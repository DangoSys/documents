# Verilator 模拟和 CI

## 概述

Verilator 是 Buckyball 中的主要硬件模拟工具，用于快速 RTL 验证和持续集成测试。最近的更新改进了时钟处理、时序鲁棒性和 CI 配置一致性。

## 设置和配置

### 安装

Verilator 包含在 Nix 开发环境中：

```bash
nix develop
```

### 项目配置

Buckyball 中的 Verilator 项目通过以下方式配置：

- `BBSimHarness`: 系统级模拟框架，具有时钟和复位管理
- `sims/verilator/` 目录: 模拟特定配置和测试运行器

## 时钟和时序改进

### 上升沿检测（mmio_tick）

`BBSimHarness` 的最近更新完善了 `mmio_tick` 信号的上升沿检测：

```scala
// 对 wFire 信号的去抖和上升沿检测
val wFire_r = RegNext(wFire)
val wFire_rising = wFire && !wFire_r
```

这防止了虚假触发检测，并与 MMIO 外设行为一致。

### 时钟边沿处理

模拟框架现在：
1. 维护显式的上升沿和下降沿周期追踪
2. 对写入-触发信号进行去抖，以防止重复的 MMIO 操作
3. 将时钟相位与预期的上升沿语义对齐

## 内存段处理

### BBSimHarness 配置

内存段在模拟中通过以下方式正确处理：

- **链接脚本**: 定义 DRAM、代码和堆栈区域
- **内存映射**: 确保虚拟到物理地址转换与硬件匹配
- **初始化**: 将测试代码和数据预加载到模拟内存中

### 示例链接器配置

内存段通常包括：

```
DRAM:  0x80000000 – 0x9FFFFFFF (512 MB 默认，可配置)
CODE:  0x80000000 – 0x800FFFFF (1 MB 默认)
STACK: 0x9FFF0000 – 0x9FFFFFFF
```

## DRAMSim2 内存模拟

Buckyball 现在包含基于 DRAMSim2 的内存管理，用于更加真实的 DRAM 时序模拟。这将替代简单的魔法内存模型，提供周期精确的 DRAM 行为。

### 概述

DRAMSim2 集成提供了：

- **真实 DRAM 时序**: 模拟实际的 DDR4 存储体冲突、刷新周期和行缓冲行为
- **可配置内存系统**: 通过 INI 文件支持不同的 DRAM 配置
- **AXI4 接口**: 标准握手协议，支持按请求 ID 跟踪的读写操作
- **突发支持**: 处理 AXI4 突发操作（每个事务多个数据传输）

### 架构

提供两种内存后端实现：

1. **`mm_magic_t`**: 简单魔法内存（零周期，用于基线测试）
   - 立即响应所有请求
   - 没有时序精度
   - 用于功能验证

2. **`mm_dramsim2_t`**: 基于 DRAMSim2 的真实内存
   - 接受 DRAMSim2 配置文件（memory.ini, system.ini）
   - 跟踪每个 ID 的读写请求队列
   - 向 DRAMSim2 发送事务并处理回调
   - 应用可配置的 CPU 时钟频率

### 配置 DRAMSim2

`mm_dramsim2_t` 构造函数接受以下参数：

- `mem_base`: 物理内存基址
- `mem_size`: 总可寻址内存（必须是 1 MB 的倍数）
- `word_size`: 数据总线宽度（通常 8 字节）
- `line_size`: 缓存行大小（DRAMSim2 固定为 64 字节）
- `clock_hz`: CPU 时钟频率（单位 Hz，传递给 DRAMSim2）
- `memory_ini`, `system_ini`, `ini_dir`: DRAMSim2 配置文件的路径

### AXI4 请求处理

请求通过独立的读写通道流动：

**读取（AR+R）：**
- AR 通道提供地址、ID、大小和突发长度
- 请求被加入队列并发送到 DRAMSim2
- 读取回调（`read_complete`）按顺序生成带数据的 R 响应

**写入（AW+W+B）：**
- AW 通道提供写入地址元数据；W 通道提供实际数据
- 两个通道都必须准备好才能接受写入事务
- 写入回调（`write_complete`）生成带事务 ID 的 B 响应

### 与 Verilator 框架集成

`BBSimDRAM` 模块通过 DPI-C 连接 Scala/Chisel 与 C++ 内存后端：

```scala
class BBSimDRAM(
  memSize:     BigInt,
  lineSize:    Int,
  clockFreqHz: BigInt,
  memBase:     BigInt,
  params:      AXI4BundleParameters,
  chipId:      Int
) extends BlackBox
```

DPI 函数：`bbsim_memory_init`、`bbsim_memory_tick` 处理初始化和每周期模拟。

### 何时使用 DRAMSim2

- **周期精确基准测试**: 当 DRAM 时序影响结果时
- **性能分析**: 研究存储体冲突和刷新影响
- **架构探索**: 评估内存总线宽度或控制器变化

**注意:** DRAMSim2 模拟比魔法内存慢；用于目标分析而非所有测试。

## 运行 Verilator 模拟

### 基本测试

```bash
bbdev verilator --run \
  '--jobs 16 \
    --binary ctest_vecunit_matmul_ones_singlecore-baremetal \
    --config sims.verilator.BuckyballToyVerilatorConfig \
    --batch'
```

### 参数

| 选项 | 含义 |
|------|------|
| `--jobs 16` | 使用 16 个并行编译作业 |
| `--binary` | 工作负载二进制名称 |
| `--config` | 模拟配置类 |
| `--batch` | 非交互模式 |

### 可用配置

- `BuckyballToyVerilatorConfig`: 用于单元测试的单核玩具配置
- `BuckyballFullVerilatorConfig`: 多核完整系统（如果可用）

## CI 流水线更新

### 工作流配置

`.github/workflows/test.yml` 中的最近 CI 更新：

1. **Verilator 设置**: 安装和缓存编译的模拟器
2. **测试矩阵**: 并行运行测试子集
3. **时序**: 强制执行时钟边沿语义以获得确定性结果
4. **调试**: 失败时捕获波形（条件）

### 工作流步骤示例

```yaml
- name: Run Verilator Tests
  run: |
    nix develop --command bash -c \
      'bbdev verilator --run "--batch --jobs 16 --binary <test-binary>"'
```

## 调试和分析

### 波形捕获

要生成 VCD 波形用于调试：

```bash
bbdev verilator --run '--batch --vcd out.vcd --binary <test-binary>'
```

### 波形检查

- 在 GTKWave、Verdi 或类似工具中打开 VCD 文件
- 跟踪跨时钟周期的信号行为
- 与指令提交日志相关联

### 执行追踪分析

Buckyball 在模拟期间生成二进制追踪文件 (BDB)，包含详细的执行信息：

**可用的追踪类型：**
- `ITRACE`: 指令发起和完成事件，含 RoB 跟踪
- `MTRACE`: 内存访问模式（load/store/DMA 操作）
- `PMCTRACE`: 性能计数器事件（缓存、分支预测）
- `CTRACE`: 提交和退役事件
- `BANKTRACE`: 计分板的库访问模式

**启用追踪：**

追踪通过模拟启动时设置的 `bdb_trace_mask` 控制。可根据域要求启用/禁用各个追踪。

**NDJSON 追踪可视化：**

最新 Buckyball 版本增强了追踪功能，支持 NDJSON 格式输出和时钟周期支持，用于时间线可视化：

```bash
# 生成带时钟周期信息的 NDJSON 追踪
bbdev verilator --run '--batch --binary <test-binary>' 2>&1 | tee sim.log

# 可视化 RoB 活动时间线（需要 bdb_ndjson_viz.py）
python3 arch/scripts/bdb_ndjson_viz.py <trace-file>.ndjson --output rob_timeline.png

# 用函数/指令名注解追踪
python3 arch/scripts/bdb_ndjson_annotate.py <trace-file>.ndjson --isa <isa-dir>
```

**追踪记录结构：**

每个 NDJSON 记录包含：
- `clk`: 捕获时的真实 RTL 时钟周期
- `kind`: 事件类型（发起、完成、分配、释放）
- `domain_id`: 目标域（ball、mem、gp 等）
- `rob_id`: 重序缓冲条目标识符
- `instr`: 指令编码或操作详情
- 元数据: 时序、库访问模式、缓存结果

## 性能考虑

### 模拟速度

- 单核玩具盒: 现代 CPU 上约 100K 周期/秒
- 多核系统: 随着核心数增加而下降
- 典型小测试: 1–5 秒模拟时间

### 资源使用

- 内存: ~500 MB–2 GB（取决于设计大小）
- 磁盘: 编译的模拟器（~200 MB）
- CPU: 随 `--jobs` 参数扩展

## 故障排除

### 常见问题

| 问题 | 解决方案 |
|------|---------|
| 内存访问越界 | 验证链接脚本和工作负载基址 |
| 模拟挂起 | 检查内存控制器或 DMA 中的死锁 |
| 不正确的时钟边沿 | 验证 BBSimHarness 中的上升沿检测 |
| 测试超时 | 增加超时或减少测试复杂性 |

### 调试输出

启用详细模拟输出：

```bash
bbdev verilator --run '--batch --verbose --binary <test-binary>'
```

## 参见

- [构建自己的硬件设计](../Tutorial/Building%20Your%20Own%20Hardware%20Designs.md)
- [Buckyball ISA 文档](../Overview/Buckyball%20ISA.md)
- [执行追踪和性能分析](Execution%20Tracing%20and%20Performance%20Analysis.md)
- [前端指令调度和库别名表](Frontend%20Instruction%20Scheduling%20and%20Bank%20Aliasing.md)
- [Bebop Spike-Verilator 协同模拟](../Architecture/Bebop%20Spike-Verilator%20Cosimulation.md)
- [向量计算支持](../Architecture/Vector%20Computation%20Support.md)
