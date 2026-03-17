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

### 检查

- 在 GTKWave、Verdi 或类似工具中打开 VCD 文件
- 跟踪跨时钟周期的信号行为
- 与指令提交日志相关联

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

## 最近的变化

- **上升沿检测**: 改进 `mmio_tick` 去抖和时钟相位处理
- **内存布局**: 修正 BBSimHarness 链接脚本中的段处理
- **CI 配置**: 统一测试工作流中的 Verilator 设置
- **覆盖率支持**: 增强覆盖率驱动验证的信号处理（如果启用）

## 参见

- [构建自己的硬件设计](../Tutorial/Building%20Your%20Own%20Hardware%20Designs.md)
- [Buckyball ISA 文档](../Overview/Buckyball%20ISA.md)
