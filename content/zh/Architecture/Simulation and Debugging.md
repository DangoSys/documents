# 仿真与调试

## 概述

Buckyball 提供全面的仿真和调试能力，支持多种仿真后端和工具，可在开发过程中进行周期级分析和指令追踪。

## 仿真核心

Buckyball 支持多种仿真后端，适应不同的使用场景：

### Verilator 仿真

**BBSimHarness** 提供基于 Verilator 的快速开源仿真。

**主要特性：**
- 快速周期精确仿真
- MMIO 支持仿真控制和控制台输出
- 指令追踪和周期计数
- Bank 后门读写用于数据检查
- 波形生成（FST 格式）

**使用方式：**

```bash
# 从 Chisel 生成 Verilog
bbdev verilator --verilog '--config sims.verilator.BuckyballToyVerilatorConfig'

# 运行仿真并生成波形
bbdev verilator --run '--jobs 16 --binary <binary_name> --config sims.verilator.BuckyballToyVerilatorConfig --batch'
```

**仿真输出：**
- `arch/log/<timestamp>-<binary>/` — 执行日志和追踪
- `arch/waveform/<timestamp>-<binary>/waveform.fst` — 波形文件
- `bdb.log` — 周期计数和 bank 访问追踪

### MMIO 接口

MMIO（内存映射 I/O）接口在 Verilator 运行时提供仿真控制和控制台 I/O。

**地址映射：**
- `0x6000_0000` — 仿真退出（写入任意值结束仿真）
- `0x6002_0000` — UART0 TX（写入低字节输出字符）

**C 代码示例：**

```c
// 触发仿真退出
*(volatile uint32_t*)0x60000000 = 0;

// 通过 UART 输出字符
void putchar(char c) {
  *(volatile uint32_t*)0x60020000 = (uint32_t)c;
}
```

## 使用 TraceBall 调试

TraceBall 是一个特殊的执行单元，提供运行时调试能力，但不执行实际计算。可用于周期级性能分析和 SRAM 数据检查。

### 周期计数 API

使用最多 16 个独立的周期计数器测量任意代码段的执行时间。

**指令集：**

| 指令 | funct7 | 功能 |
|------|--------|------|
| `bdb_counter_start(ctr_id, tag)` | 0x30 | 启动计数器，记录周期和标签 |
| `bdb_counter_stop(ctr_id)` | 0x30 | 停止计数器，输出消耗周期数 |
| `bdb_counter_read(ctr_id)` | 0x30 | 读取计数器当前值（非阻塞） |

**使用示例：**

```c
#include <bbhw/isa/isa.h>

// 测量矩阵乘法周期数
bdb_counter_start(0, 0xA001);  // 标签 = 0xA001（matmul）
bb_mul_warp16(A, B, C, 16);
bb_fence();
bdb_counter_stop(0);  // 输出消耗周期

// 测量嵌套区间
bdb_counter_start(0, 0x0001);  // 外层：卷积
  bdb_counter_start(1, 0x0002);  // 内层：im2col
  bb_im2col(...);
  bb_fence();
  bdb_counter_stop(1);

  bdb_counter_start(2, 0x0003);  // 内层：矩阵乘法
  bb_mul_warp16(...);
  bb_fence();
  bdb_counter_stop(2);
bdb_counter_stop(0);
```

**bdb.log 输出：**

```
[CTRACE] CTR_START  ctr=0 tag=0x0001 cycle=0
[CTRACE] CTR_START  ctr=1 tag=0x0002 cycle=0
[CTRACE] CTR_STOP   ctr=1 tag=0x0002 elapsed=150 cycle=150
[CTRACE] CTR_START  ctr=2 tag=0x0003 cycle=0
[CTRACE] CTR_STOP   ctr=2 tag=0x0003 elapsed=300 cycle=300
[CTRACE] CTR_STOP   ctr=0 tag=0x0001 elapsed=456 cycle=456
```

### SRAM 后门访问

在不使用 DMA 的情况下，直接将测试数据注入或提取 SRAM bank。用于单元测试和数据验证。

**指令集：**

| 指令 | funct7 | 功能 |
|------|--------|------|
| `bdb_backdoor_mvin(rows)` | 0x31 | 注入行数到私有 bank（来自 DPI-C） |
| `bdb_backdoor_write(bank_id, rows)` | 0x31 | 从私有 bank 复制到目标 bank |
| `bdb_backdoor_read(bank_id, rows)` | 0x31 | 将 bank 行数写入追踪 |

**示例：注入测试数据并验证转置结果：**

```c
// DPI-C 注入 16 行数据到 TraceBall 私有 bank
bdb_backdoor_mvin(16);

// 复制到 bank 0
bdb_backdoor_write(0, 16);

// 运行转置
bb_alloc(0, 1, 1);
bb_transpose(0, 1, 16);

// 读出 bank 1 结果
bdb_backdoor_read(1, 16);
```

**bdb.log 输出：**

```
[BANK-TRACE] BACKDOOR_WRITE bank=0 row=0 data=0x00010002000300040005000600070008
[BANK-TRACE] BACKDOOR_READ  bank=1 row=0 data=0x00000001000200030004000500060007
```

## 波形分析

波形文件（FST 格式）捕获周期级信号转换，是详细调试的必要工具。

### 查看波形

1. 从 `arch/waveform/<timestamp>/waveform.fst` 下载 FST 文件
2. 使用 GTKWave 或类似工具打开：

```bash
gtkwave waveform.fst &
```

### 定位信号

在波形层次结构中查找 Ball 的执行信号：

**Toy 配置的路径模式：**

```
TOP.TestHarness.chiptop0.system.tile_prci_domain.element_reset_domain_tile
  .buckyball.ballDomain.bbus.balls_<BID>.<UnitName>
```

**示例——MatrixBall（BID=1）：**

```
TOP.TestHarness.chiptop0.system.tile_prci_domain.element_reset_domain_tile
  .buckyball.ballDomain.bbus.balls_1.matrixUnit
```

关键信号：
- `valIn`, `readyIn` — 输入握手
- `valOut`, `readyOut` — 输出握手
- `op1`, `op2` — 操作数
- Bank 读写端口用于数据移动

## 配置文件

Buckyball 使用 Scala 配置类定义仿真参数。

### Toy 配置

用于开发和测试的默认配置。

```scala
class BuckyballToyVerilatorConfig extends Config(...)
```

**特性：**
- 1 个 BBTile，1 个 Rocket 核 + 1 个 BuckyballAccelerator
- 8 个 SRAM bank（容量可配）
- 标准 Ball 算子（VecBall、MatrixBall、Im2colBall、TransposeBall）
- TraceBall 用于调试
- 128 位系统总线

### Goban 配置

多核配置，每个 tile 有 4 个核，共享单一加速器域。

```scala
class BuckyballGobanConfig extends Config(...)  // 1 个 tile，4 个核
class BuckyballGoban2TileConfig extends Config(...)  // 2 个 tile，8 个核
```

**特性：**
- 多个 Rocket 核（可配）
- 共享 Ball 算子和内存
- 用于多核同步的 BarrierUnit
- 与 Toy 配置相同的 ISA

## 构建和运行流程

### 1. 准备工作负载

```bash
cd bb-tests/build
rm -rf *
cmake -G Ninja ../
ninja <workload_target>
```

### 2. 生成 Verilog

```bash
bbdev verilator --verilog '--config sims.verilator.BuckyballToyVerilatorConfig'
```

### 3. 运行仿真

```bash
bbdev verilator --run '--jobs 16 --binary <binary_name> \
  --config sims.verilator.BuckyballToyVerilatorConfig --batch'
```

### 4. 分析结果

- **执行日志：** `arch/log/<timestamp>/disasm.log`
- **追踪文件：** `arch/log/<timestamp>/bdb.log`（使用 TraceBall 时）
- **波形文件：** `arch/waveform/<timestamp>/waveform.fst`

## 故障排查

### 仿真超时或死锁

**症状：**
- 仿真无法完成而挂起
- bbdev 输出超时错误

**诊断：**
1. 检查 `disasm.log` — 最后执行的指令可能指示卡住的位置
2. 加载 `waveform.fst` 并检查接近结束时间的 Ball 信号
3. 查找卡住的握手（valOut=1 但 readyOut=0）

**常见原因：**
- Ball 算子不响应（检查指令解码）
- 内存死锁（检查 bank 分配和访问模式）
- 缺少 fence() 调用

### 波形文件损坏

**症状：**
- `waveform.fst.hier` 文件与 `waveform.fst` 共存
- FST 文件无法在 GTKWave 中打开

**解决方案：**
- 表示仿真失败。检查日志中的崩溃或超时。
- 重新运行仿真并确保成功完成。

### TraceBall 未激活

**症状：**
- 未生成 `bdb.log` 文件
- `bdb_counter_*` 调用无输出

**诊断：**
1. 验证 TraceBall 在 busRegister.scala 中注册
2. 检查 DISA 是否包含 funct7 0x30 和 0x31
3. 确保测试代码中的指令编码正确

## 进阶：自定义仿真核心

创建自定义仿真核心：

1. 创建 Scala 类，继承相应的核心基类
2. 定义 MMIO 地址映射和 DPI-C 回调
3. 在 C++ 中实现 `mmio_tick()` 处理程序
4. 在 `TargetConfigs.scala` 中注册以供 bbdev CLI 使用

示例文件：`arch/src/main/scala/sims/verilator/BBSimHarness.scala`

## 相关文档

- [构建自己的硬件设计](../Tutorial/Building%20Your%20Own%20Hardware%20Designs.md) — 完整的 Ball 开发流程
- [Ball 参考](../Reference/Ball%20Reference.md) — Ball 算子规范
- Buckyball ISA 参考 — 指令编码详情
