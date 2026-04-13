# Pegasus FPGA 部署

## 概述

Pegasus 是 Buckyball 的 FPGA 部署框架，为实际的 FPGA 实现提供硬件抽象层。与在 CPU 上运行的 Verilator 模拟不同，Pegasus 面向真实的 FPGA 硬件或 FPGA 模拟环境，能够在硅上或具有外部存储和 I/O 子系统的高保真 FPGA 模型上实现周期精确的执行。

本指南涵盖 Pegasus 架构、配置和部署工作流。

## 架构

### 组件

Pegasus 由两个协同工作的主要组件组成：

1. **PegasusShell**：管理外部 I/O 信号的低级硬件接口
   - PCIe：16 位差分 TX/RX 对用于主机通信
   - HBM：外部高带宽存储接口，带时钟域
   - UART：串行通信通道
   - 存储：AXI4 写入和读取通道（256 位数据，33 位地址）
   - 时钟管理：多个同步时钟域

2. **PegasusHarness**：系统级集成包装器
   - 将 Pegasus I/O 桥接到基于 Chipyard 的 Buckyball 子系统
   - 为 DUT（待测设备）提供参考时钟和复位信号
   - 将 AXI4 存储端口连接到 Pegasus 外部存储接口
   - 管理时钟域交叉和信号同步

### 集成点

Pegasus 有条件地集成到 Buckyball 构建系统中（由 `../pegasus/chisel/` 目录的存在控制）。当可用时，构建目标可以配置为使用 Pegasus 而不是 Verilator：

```bash
# Build.sc 检查 Pegasus 可用性
private val hasPegasus = os.exists(os.pwd / os.up / "pegasus" / "chisel")

# Pegasus 成为可选依赖
moduleDeps = ... ++ (if (hasPegasus) Seq(pegasus) else Seq.empty)
```

这允许有 FPGA 基础设施的团队使用 Pegasus，而其他团队继续使用 Verilator。

## I/O 接口规范

### 时钟信号

| 信号 | 方向 | 描述 |
|------|------|------|
| `pcie_sys_clk` | 输入 | PCIe 系统时钟（典型 100 MHz） |
| `pcie_sys_clk_gt` | 输入 | PCIe GTX 参考时钟 |
| `hbm_ref_clk` | 输入 | 外部存储参考时钟 |
| `dut_clk` | 输出 | DUT 参考时钟（由 `pcie_sys_clk` 派生） |

### 复位信号

| 信号 | 方向 | 描述 |
|------|------|------|
| `pcie_sys_rst_n` | 输入 | PCIe 系统复位（低电平有效） |
| `dut_reset` | 输出 | 从 `pcie_sys_rst_n` 派生的 DUT 复位信号 |

### PCIe 信号

用于主机通信的 PCIe 差分对：

| 信号 | 宽度 | 方向 |
|------|------|------|
| `pcie_exp_txp` / `pcie_exp_txn` | 16 位 | 输出 |
| `pcie_exp_rxp` / `pcie_exp_rxn` | 16 位 | 输入 |

这些信号连接到外部 PCIe 桥接器或模拟模型。

### 存储接口（AXI4）

#### 写入通道

| 信号 | 宽度 | 方向 | 描述 |
|------|------|------|------|
| `chip_mem_awid` | 6 | 输入 | 写入地址 ID |
| `chip_mem_awaddr` | 33 | 输入 | 写入地址（位 32：完整范围的高位） |
| `chip_mem_awlen` | 8 | 输入 | 突发长度（0 = 1 拍，15 = 16 拍） |
| `chip_mem_awsize` | 3 | 输入 | 突发大小编码（0=1B，3=8B，5=32B） |
| `chip_mem_awburst` | 2 | 输入 | 突发类型（FIXED=0，INCR=1，WRAP=2） |
| `chip_mem_awvalid` | 1 | 输入 | 写入地址有效 |
| `chip_mem_awready` | 1 | 输出 | 写入地址就绪 |
| `chip_mem_wdata` | 256 | 输入 | 写入数据（32 字节） |
| `chip_mem_wstrb` | 32 | 输入 | 写入选通（字节使能） |
| `chip_mem_wlast` | 1 | 输入 | 突发中的最后一拍 |
| `chip_mem_wvalid` | 1 | 输入 | 写入数据有效 |
| `chip_mem_wready` | 1 | 输出 | 写入数据就绪 |
| `chip_mem_bid` | 6 | 输出 | 写入响应 ID |
| `chip_mem_bresp` | 2 | 输出 | 写入响应（0=OK，1=EXOK，2=SLVERR，3=DECERR） |
| `chip_mem_bvalid` | 1 | 输出 | 写入响应有效 |
| `chip_mem_bready` | 1 | 输入 | 写入响应就绪 |

#### 读取通道

| 信号 | 宽度 | 方向 | 描述 |
|------|------|------|------|
| `chip_mem_arid` | 6 | 输入 | 读取地址 ID |
| `chip_mem_araddr` | 33 | 输入 | 读取地址 |
| `chip_mem_arlen` | 8 | 输入 | 突发长度 |
| `chip_mem_arsize` | 3 | 输入 | 突发大小编码 |
| `chip_mem_arburst` | 2 | 输入 | 突发类型 |
| `chip_mem_arvalid` | 1 | 输入 | 读取地址有效 |
| `chip_mem_arready` | 1 | 输出 | 读取地址就绪 |
| `chip_mem_rid` | 6 | 输出 | 读取数据 ID |
| `chip_mem_rdata` | 256 | 输出 | 读取数据（32 字节） |
| `chip_mem_rresp` | 2 | 输出 | 读取响应 |
| `chip_mem_rlast` | 1 | 输出 | 突发中的最后一拍 |
| `chip_mem_rvalid` | 1 | 输出 | 读取数据有效 |
| `chip_mem_rready` | 1 | 输入 | 读取数据就绪 |

### UART 接口

| 信号 | 方向 | 描述 |
|------|------|------|
| `uart_tx` | 输入 | UART 发送（当前绑定到 1'b1） |

## 设置和配置

### 前提条件

要通过 Pegasus 在 FPGA 上部署 Buckyball：

1. Pegasus Chisel 源代码在 `../pegasus/chisel/`（相对于 buckyball/arch/）
2. FPGA 工具链（Vivado、Quartus 或类似工具）与目标平台相匹配
3. Verilator（用于开发期间的协同模拟）
4. Spike RISC-V 模拟器（用于功能参考）

### 条件构建

如果可用，Pegasus 将包含在构建中：

```bash
# 进入 Nix 环境（包括所有工具）
nix develop

# 带 Pegasus 支持的编译（如果已安装）
mill buckyball.compile

# 验证构建输出中的 Pegasus 集成
mill show buckyball.moduleDeps
```

### 配置

特定于目标的配置位于 `sims/pegasus/`：

- `PegasusHarness`：基本系统包装器
- `PegasusHarnessBinders`：AXI4 存储绑定和时钟接线
- 平台特定配置（Vivado、Quartus）根据需要

## 运行 Pegasus 模拟

### 使用 bbdev

虽然 Verilator 是通过 `bbdev verilator` 的主要模拟后端，但 FPGA 模拟通常通过供应商特定工具运行。但是，您可以在开发期间协同模拟 Pegasus 设计：

```bash
# 将 Pegasus 设计编译为 RTL
bbdev build --config sims.pegasus.PegasusHarness

# 生成模拟脚本和波形
bbdev verilator --run \
  '--jobs 16 \
    --binary <test-binary> \
    --config sims.pegasus.PegasusHarness \
    --batch'
```

### FPGA 流程

对于实际的 FPGA 部署，请遵循您的供应商方法论：

**Vivado（赛灵思）：**
```bash
# 从 Chisel/PegasusShell 生成 Verilog
mill buckyball.compile --no-test

# 在 Vivado 项目中：
# 1. 创建新的 RTL 项目
# 2. 添加生成的 Verilog 文件
# 3. 在顶层实例化 PegasusShell
# 4. 将 I/O 连接到 FPGA I/O 约束
# 5. 运行综合、布局和布线
# 6. 生成比特流
```

**Quartus（英特尔/Altera）：**
```bash
# 类似流程；将 Verilog 添加到 Quartus 项目
# 将 PegasusShell I/O 映射到 Qsys（或原始端口约束）
```

## 存储约束

### 地址范围

AXI4 写入/读取地址总线为 33 位，支持最多 8 GB 的地址空间：

```
存储映射示例：
0x000000000 – 0x0FFFFFFFF（4 GB）  [下半部分]
0x100000000 – 0x1FFFFFFFF（4 GB）  [上半部分，位 32 设置]
```

确保您的外部存储（HBM 或 DDR）覆盖您的 Buckyball 配置期望的地址范围（通常从 RISC-V 的 0x80000000 开始）。

### 数据宽度

所有传输使用 256 位（32 字节）宽的数据总线。字节使能（`chip_mem_wstrb`）允许子字写入。

## 调试

### 波形捕获

Verilator 中的 Pegasus 模拟生成 VCD 波形：

```bash
bbdev verilator --run '--batch --vcd pegasus_sim.vcd --binary <test-binary>'
```

### 信号检查

用于调试的关键信号：

- `pcie_sys_clk`、`dut_clk`：时钟域同步
- `chip_mem_awvalid`、`chip_mem_awready`：写入地址握手
- `chip_mem_wvalid`、`chip_mem_wready`：写入数据握手
- `chip_mem_arvalid`、`chip_mem_arready`：读取地址握手

使用 GTKWave 或类似工具来追踪信号转换并验证协议合规性。

### 复位序列

确保正确的复位顺序：

1. 声明 `pcie_sys_rst_n`（低电平有效）
2. 等待 ≥ 10 个时钟周期
3. 释放 `pcie_sys_rst_n`
4. 观察 `dut_reset` 变为非活跃

不正确的复位顺序是模拟挂起的常见原因。

## 故障排除

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| 编译失败，"pegasus not found" | Pegasus 源代码缺失 | 将 pegasus 克隆到 `../pegasus/chisel/` |
| 存储事务永远不会完成 | `chip_mem_*ready` 信号卡在低 | 检查外部存储模型；验证地址范围 |
| DUT 时钟从不启动 | 时钟输入未连接 | 验证 `pcie_sys_clk` 已连接并运行 |
| 波形显示零数据 | 数据总线未驱动 | 检查读取路径中的 `chip_mem_rdata`；验证写入数据传播 |

## 也可以看看

- [开发工作流和构建系统](Development%20Workflow%20and%20Build%20System.md)
- [Verilator 模拟和 CI](Verilator%20Simulation%20and%20CI.md)
- [Bebop Spike-Verilator 协同模拟](../Architecture/Bebop%20Spike-Verilator%20Cosimulation.md)
- [Buckyball ISA 文档](../Overview/Buckyball%20ISA.md)
