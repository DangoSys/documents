# GemminiBall 架构

## 概述

GemminiBall 是 Buckyball 中的一个专用 Ball（加速器模块），实现了基于脉动阵列的矩阵乘法操作。它将 Gemmini 风格的计算语义与 Buckyball Blink 接口结合，用于指令分发和结果处理。

## 架构组件

### 核心模块

- **GemminiBall**: 主指令路由器和执行控制器
- **GemminiExCtrl**: 非循环指令执行单元控制器（CONFIG、PRELOAD、COMPUTE、FLUSH）
- **LoopMatmulUnroller**: 处理分块矩阵乘法循环
- **LoopConvUnroller**: 处理卷积计算循环
- **LoopCmdEncoder**: 编码循环命令用于执行

### 配置寄存器

GemminiBall 通过以下配置寄存器维护状态：

- **loopWsConfig**: 存储矩阵乘法的循环参数
  - `max_i`、`max_j`、`max_k`：循环迭代边界
  - 矩阵 A、B、C、D 的 DRAM 地址
  - 内存访问模式的步长参数
  
- **loopConvConfig**: 卷积特定的参数

## 按 funct7 指令路由

GemminiBall 根据 `funct7` 字段分发指令。该字段分区为：

- **位 [6:4]**：银行使能字段（编码内存访问类型：000/001/010/011/100 用于不同访问模式；101/110/111 用于扩展操作码）
- **位 [3:0]**：操作码

| funct7 | 位 [6:4] | 操作 | 类型 |
|--------|-----------|------|------|
| 0x02   | 000       | CONFIG | ExUnit |
| 0x03   | 000       | FLUSH | ExUnit |
| 0x04   | 000       | BDB_COUNTER | 调试 |
| 0x30   | 011       | IM2COL | 计算 |
| 0x31   | 011       | TRANSPOSE | 计算 |
| 0x32   | 011       | RELU | 计算 |
| 0x33   | 011       | QUANT | 计算 |
| 0x34   | 011       | DEQUANT | 计算 |
| 0x35   | 011       | PRELOAD | ExUnit |
| 0x36   | 011       | BDB_BACKDOOR | 调试 |
| 0x40   | 100       | MATMUL_WARP16 | 计算 |
| 0x41   | 100       | SYSTOLIC | 计算 |
| 0x42   | 100       | COMPUTE_PRELOADED | ExUnit |
| 0x43   | 100       | COMPUTE_ACCUMULATED | ExUnit |
| 0x50–0x57 | 101    | Loop WS Config / Loop Trigger (Matrix) | 配置 |
| 0x60–0x69 | 110    | Loop Conv Config / Loop Trigger (Conv) | 配置 |

### 执行路径

**ExUnit 路径**（CONFIG、PRELOAD、COMPUTE、FLUSH）：
- 直接路由到 GemminiExCtrl
- 输出完整延迟的标准响应

**配置路径**（循环配置）：
- 立即响应（单周期）
- 存储配置寄存器
- 为元数据关联包含 ROB 追踪

## 指令格式

### ExUnit 指令

ExUnit 指令遵循标准 Blink 命令格式和 Gemmini 语义：

```
字段    | 位    | 描述
--------|-------|-----------------------------------
funct7  | [6:0] | 操作选择器
rs2/cmd | [63:0]| 操作数/配置数据
rs1     | [31:0]| 地址/寄存器文件指针
```

### 循环配置指令

循环配置使用立即数模式与操作数编码：

```
指令: funct7 | rs2_data (特殊)
funct7 0x50: max_i [47:32], max_j [31:16], max_k [15:0]
funct7 0x51: dram_addr_a [38:0]
funct7 0x52: dram_addr_b [38:0]
funct7 0x53: dram_addr_d [38:0]
funct7 0x54: dram_addr_c [38:0]
funct7 0x55: stride_a [31:0], stride_b [63:32]
funct7 0x56: stride_d [31:0], stride_c [63:32]
```

## 寄存器追踪

GemminiBall 通过 `rob_id_reg` 追踪 ROB ID，在配置和执行阶段之间维护元数据关联。这实现了：

- 正确的结果路由到重排序缓冲区
- 管道化配置的子操作追踪
- 分块操作的一致状态管理

## 使用示例

### 矩阵乘法序列

```scala
// 1. 配置循环参数 (M=64, N=64, K=64)
gemmini_loop_config_i(64, 64, 64)

// 2. 设置 DRAM 地址
gemmini_dram_addr_a(0x0)
gemmini_dram_addr_b(0x10000)
gemmini_dram_addr_c(0x20000)
gemmini_dram_addr_d(0x20000)

// 3. 设置步长参数
gemmini_stride_a_b(1024, 1024)
gemmini_stride_d_c(1024, 1024)

// 4. 触发循环执行
gemmini_loop_trigger()

// 5. （可选）刷新结果
gemmini_flush()
```

## 与 Buckyball 的集成

### Blink 接口

GemminiBall 实现 `BlinkIO` 用于命令接收和响应：

- **cmdReq**: 命令请求（指令 + 操作数）
- **cmdResp**: 响应（结果 + 元数据）
- **status**: 当前执行状态

### 重排序缓冲区（ROB）

结果包括：
- `rob_id`: 用于乱序执行的原始指令 ID
- `is_sub`: 指示子操作状态
- `sub_rob_id`: 用于组合操作的辅助 ROB 追踪

## 最近的增强

### funct7 编码更新（最新）

最近的提交（2026 年 3 月）更新了 funct7 编码方案以：
- 在 [6:4] 中编码银行使能位用于内存访问模式追踪
- 支持新操作：IM2COL、TRANSPOSE、RELU、QUANT、DEQUANT 和 MATMUL_WARP16
- 与更新的 DISA（特定领域 ISA）规范对齐
- 启用带银行访问可视化的指令追踪

### 指令追踪

银行使能支持：
- 按银行的内存访问模式可视化
- 内存操作的性能分析
- 数据依赖性和银行冲突的调试

### 循环展开器

最近的 GemminiBall 增强添加了：
- **LoopMatmulUnroller**: 具有可配置边界的分块矩阵乘法
- **LoopConvUnroller**: 具有灵活地址生成的卷积循环展开
- 两者都支持任意循环嵌套和步长内存访问

## 相关文档

- [Goban 多核架构](Goban%20Multi-Core%20Architecture.md) — 使用 GemminiBall 的多核配置
- [Buckyball ISA Documentation](../Overview/Buckyball%20ISA.md)
- [Building Your Own Hardware Designs](../Tutorial/Building%20Your%20Own%20Hardware%20Designs.md)
