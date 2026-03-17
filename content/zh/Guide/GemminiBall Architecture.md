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

GemminiBall 根据 `funct7` 字段分发指令：

| funct7 | 操作 | 类型 |
|--------|------|------|
| 0x02   | CONFIG | ExUnit |
| 0x03   | FLUSH | ExUnit |
| 0x35   | PRELOAD | ExUnit |
| 0x42   | COMPUTE_PRELOADED | ExUnit |
| 0x43   | COMPUTE_ACCUMULATED | ExUnit |
| 0x50–0x56 | 循环配置 | 配置 |
| 0x57   | 循环触发（矩阵） | 控制 |
| 0x60–0x68 | 循环配置（卷积） | 配置 |
| 0x69   | 循环触发（卷积） | 控制 |

### 执行路径

**ExUnit 路径**（CONFIG、PRELOAD、COMPUTE、FLUSH）：
- 直接路由到 GemminiExCtrl
- 输出完整延迟的标准响应

**配置路径**（循环配置）：
- 立即响应（单周期）
- 存储配置寄存器
- 包含 ROB 元数据追踪

## 指令格式

### ExUnit 指令

ExUnit 指令遵循标准 Blink 命令格式，具有 Gemmini 语义：

```
字段      | 位    | 描述
----------|-------|-----------------------------------
funct7    | [6:0]   | 操作选择器
rs2/cmd   | [63:0]  | 操作数/配置数据
rs1       | [31:0]  | 地址/寄存器文件指针
```

### 循环配置指令

循环配置使用立即数模式，操作数编码如下：

```
指令：funct7 | rs2_data（特殊）
funct7 0x50: max_i [47:32], max_j [31:16], max_k [15:0]
funct7 0x51: dram_addr_a [38:0]
funct7 0x52: dram_addr_b [38:0]
funct7 0x53: dram_addr_d [38:0]
funct7 0x54: dram_addr_c [38:0]
funct7 0x55: stride_a [31:0], stride_b [63:32]
funct7 0x56: stride_d [31:0], stride_c [63:32]
```

## 寄存器追踪

GemminiBall 通过 `rob_id_reg` 追踪 ROB ID 以维护配置和执行阶段之间的元数据关联。这使得：

- 正确的结果路由到重排序缓冲区
- 分块操作的子操作追踪
- 管道化配置的一致状态管理

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
- `rob_id`: 原始指令 ID，用于乱序执行
- `is_sub`: 表示子操作状态
- `sub_rob_id`: 复合操作的二级 ROB 追踪

## 最近的改进

### funct7 编码更新（最新）

最近的提交重构了 funct7 编码方案以：
- 将 ExUnit 指令（立即响应路径）与循环控制分离
- 与更新的 DISA（领域特定 ISA）规范对齐
- 支持用于调试和分析的新增银行使能追踪

### 指令追踪

银行使能支持：
- 内存访问模式可视化
- 每个内存银行的性能分析
- 数据依赖关系的调试

## 参见

- [Buckyball ISA 文档](../Overview/Buckyball%20ISA.md)
- [构建自己的硬件设计](../Tutorial/Building%20Your%20Own%20Hardware%20Designs.md)
