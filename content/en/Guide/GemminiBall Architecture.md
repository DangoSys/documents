# GemminiBall Architecture

## Overview

GemminiBall is a specialized Ball (accelerator module) in Buckyball that implements systolic array-based matrix multiplication operations. It integrates Gemmini-style compute semantics with the Buckyball Blink interface for instruction dispatch and result handling.

## Architecture Components

### Core Modules

- **GemminiBall**: Main instruction router and execution controller
- **GemminiExCtrl**: Execution unit controller for non-loop instructions (CONFIG, PRELOAD, COMPUTE, FLUSH)
- **LoopMatmulUnroller**: Handles blocked matrix multiplication loops
- **LoopConvUnroller**: Handles convolutional computation loops
- **LoopCmdEncoder**: Encodes loop commands for execution

### Configuration Registers

GemminiBall maintains configuration state via:

- **loopWsConfig**: Stores loop parameters for matrix multiplication
  - `max_i`, `max_j`, `max_k`: Loop iteration bounds
  - DRAM addresses for matrices A, B, C, D
  - Stride parameters for memory access patterns
  
- **loopConvConfig**: Stores convolution-specific parameters

## Instruction Routing by funct7

GemminiBall dispatches instructions based on the `funct7` field:

| funct7 | Operation | Type |
|--------|-----------|------|
| 0x02   | CONFIG    | ExUnit |
| 0x03   | FLUSH     | ExUnit |
| 0x35   | PRELOAD   | ExUnit |
| 0x42   | COMPUTE_PRELOADED | ExUnit |
| 0x43   | COMPUTE_ACCUMULATED | ExUnit |
| 0x50–0x56 | Loop Config | Configuration |
| 0x57   | Loop Trigger (Matrix) | Control |
| 0x60–0x68 | Loop Config (Conv) | Configuration |
| 0x69   | Loop Trigger (Conv) | Control |

### Execution Paths

**ExUnit Path** (CONFIG, PRELOAD, COMPUTE, FLUSH):
- Routed directly to GemminiExCtrl
- Produces standard responses with full latency

**Config Path** (Loop configuration):
- Immediate response (single cycle)
- Stores configuration registers
- Includes ROB tracking for metadata association

## Instruction Format

### ExUnit Instructions

ExUnit instructions follow the standard Blink command format with Gemmini semantics:

```
Field     | Bits    | Description
----------|---------|-----------------------------------
funct7    | [6:0]   | Operation selector
rs2/cmd   | [63:0]  | Operand/configuration data
rs1       | [31:0]  | Address/register file pointer
```

### Loop Configuration Instructions

Loop configuration uses immediate mode with operand encoding:

```
Instruction: funct7 | rs2_data (special)
funct7 0x50: max_i [47:32], max_j [31:16], max_k [15:0]
funct7 0x51: dram_addr_a [38:0]
funct7 0x52: dram_addr_b [38:0]
funct7 0x53: dram_addr_d [38:0]
funct7 0x54: dram_addr_c [38:0]
funct7 0x55: stride_a [31:0], stride_b [63:32]
funct7 0x56: stride_d [31:0], stride_c [63:32]
```

## Register Tracking

GemminiBall tracks ROB IDs via `rob_id_reg` to maintain metadata association across configuration and execution stages. This enables:

- Correct result routing to the ReOrder Buffer
- Sub-operation tracking for pipelined configurations
- Coherent state management for blocked operations

## Usage Example

### Matrix Multiplication Sequence

```scala
// 1. Configure loop parameters (M=64, N=64, K=64)
gemmini_loop_config_i(64, 64, 64)

// 2. Set DRAM addresses
gemmini_dram_addr_a(0x0)
gemmini_dram_addr_b(0x10000)
gemmini_dram_addr_c(0x20000)
gemmini_dram_addr_d(0x20000)

// 3. Set stride parameters
gemmini_stride_a_b(1024, 1024)
gemmini_stride_d_c(1024, 1024)

// 4. Trigger loop execution
gemmini_loop_trigger()

// 5. (Optional) Flush results
gemmini_flush()
```

## Integration with Buckyball

### Blink Interface

GemminiBall implements `BlinkIO` for command receipt and response:

- **cmdReq**: Command request (instruction + operands)
- **cmdResp**: Response (result + metadata)
- **status**: Current execution status

### ReOrder Buffer (ROB)

Results include:
- `rob_id`: Original instruction ID for out-of-order execution
- `is_sub`: Indicates sub-operation status
- `sub_rob_id`: Secondary ROB tracking for composed operations

## Recent Enhancements

### funct7 Encoding Update (Latest)

Recent commits refactored the funct7 encoding scheme to:
- Separate ExUnit instructions (immediate response paths) from loop control
- Align with updated DISA (Domain-Specific ISA) specification
- Support new bank enable tracing for debug and profiling

### Instruction Tracing

Bank enable support enables:
- Memory access pattern visualization
- Performance profiling per memory bank
- Debugging of data dependencies

## See Also

- [Buckyball ISA Documentation](../Overview/Buckyball%20ISA.md)
- [Building Your Own Hardware Designs](../Tutorial/Building%20Your%20Own%20Hardware%20Designs.md)
