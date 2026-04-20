# Pegasus FPGA Deployment

## Overview

Pegasus is the FPGA deployment framework for Buckyball, providing a hardware abstraction layer for real FPGA implementations. Unlike Verilator simulation which runs on CPU, Pegasus targets actual FPGA hardware or FPGA simulation environments, enabling cycle-accurate execution on silicon or high-fidelity FPGA models with external memory and I/O subsystems.

This guide covers Pegasus architecture, configuration, and deployment workflows.

## Architecture

### Components

Pegasus consists of two main components working together:

1. **PegasusShell**: Low-level hardware interface managing external I/O signals
   - PCIe: 16-bit differential TX/RX pairs for host communication
   - HBM: External high-bandwidth memory interface with clock domain
   - UART: Serial communication channel
   - Memory: AXI4 write and read channels (256-bit data, 33-bit address)
   - Clock management: Multiple synchronized clock domains

2. **PegasusHarness**: System-level integration wrapper
   - Bridges Pegasus I/O to Chipyard-based Buckyball subsystems
   - Provides reference clock and reset signals to DUT (Device Under Test)
   - Connects AXI4 memory port to Pegasus external memory interface
   - Manages clock domain crossing and signal synchronization

### Integration Points

Pegasus integrates conditionally into the Buckyball build system (controlled by presence of `../pegasus/chisel/` directory). When available, build targets can be configured to use Pegasus instead of Verilator:

```bash
# Build.sc checks for Pegasus availability
private val hasPegasus = os.exists(os.pwd / os.up / "pegasus" / "chisel")

# Pegasus becomes optional dependency
moduleDeps = ... ++ (if (hasPegasus) Seq(pegasus) else Seq.empty)
```

This allows teams with FPGA infrastructure to use Pegasus, while others continue using Verilator.

## I/O Interface Specification

### Clock Signals

| Signal | Direction | Description |
|--------|-----------|-------------|
| `pcie_sys_clk` | Input | PCIe system clock (typical 100 MHz) |
| `pcie_sys_clk_gt | Input | PCIe GTX reference clock |
| `hbm_ref_clk` | Input | External memory reference clock |
| `dut_clk` | Output | DUT reference clock (derived from `pcie_sys_clk`) |

### Reset Signals

| Signal | Direction | Description |
|--------|-----------|-------------|
| `pcie_sys_rst_n` | Input | PCIe system reset (active low) |
| `dut_reset` | Output | DUT reset signal derived from `pcie_sys_rst_n` |

### PCIe Signals

PCIe differential pairs for host communication:

| Signal | Width | Direction |
|--------|-------|-----------|
| `pcie_exp_txp` / `pcie_exp_txn` | 16 bits | Output |
| `pcie_exp_rxp` / `pcie_exp_rxn` | 16 bits | Input |

These signals connect to an external PCIe bridge or simulation model.

### Memory Interface (AXI4)

The AU280 deployment uses a 64-bit AXI4 interface with 32-bit addressing. This is distinct from the simulation harness interface and reflects the actual Xilinx XDMA + DDR4 configuration on the AU280 board. DDR4 physical signals are managed by the Vivado board interface automatically.

#### Write Channel

| Signal | Width | Direction | Description |
|--------|-------|-----------|-------------|
| `chip_mem_awid` | 4 | Input | Write address ID |
| `chip_mem_awaddr` | 32 | Input | Write address |
| `chip_mem_awlen` | 8 | Input | Burst length (0 = 1 beat, 255 = 256 beats) |
| `chip_mem_awsize` | 3 | Input | Burst size encoding (0=1B, 3=8B, 6=64B) |
| `chip_mem_awburst` | 2 | Input | Burst type (FIXED=0, INCR=1, WRAP=2) |
| `chip_mem_awvalid` | 1 | Input | Write address valid |
| `chip_mem_awready` | 1 | Output | Write address ready |
| `chip_mem_wdata` | 64 | Input | Write data (8 bytes) |
| `chip_mem_wstrb` | 8 | Input | Write strobe (byte enable) |
| `chip_mem_wlast` | 1 | Input | Last beat in burst |
| `chip_mem_wvalid` | 1 | Input | Write data valid |
| `chip_mem_wready` | 1 | Output | Write data ready |
| `chip_mem_bid` | 4 | Output | Write response ID |
| `chip_mem_bresp` | 2 | Output | Write response (0=OK, 1=EXOK, 2=SLVERR, 3=DECERR) |
| `chip_mem_bvalid` | 1 | Output | Write response valid |
| `chip_mem_bready` | 1 | Input | Write response ready |

#### Read Channel

| Signal | Width | Direction | Description |
|--------|-------|-----------|-------------|
| `chip_mem_arid` | 4 | Input | Read address ID |
| `chip_mem_araddr` | 32 | Input | Read address |
| `chip_mem_arlen` | 8 | Input | Burst length |
| `chip_mem_arsize` | 3 | Input | Burst size encoding |
| `chip_mem_arburst` | 2 | Input | Burst type |
| `chip_mem_arvalid` | 1 | Input | Read address valid |
| `chip_mem_arready` | 1 | Output | Read address ready |
| `chip_mem_rid` | 4 | Output | Read data ID |
| `chip_mem_rdata` | 64 | Output | Read data (8 bytes) |
| `chip_mem_rresp` | 2 | Output | Read response |
| `chip_mem_rlast` | 1 | Output | Last beat in burst |
| `chip_mem_rvalid` | 1 | Output | Read data valid |
| `chip_mem_rready` | 1 | Input | Read data ready |

### UART Interface

| Signal | Direction | Description |
|--------|-----------|-------------|
| `uart_tx` | Input | UART transmit (currently tied to 1'b1) |

## Setup and Configuration

### Prerequisites

To deploy Buckyball on FPGA via Pegasus:

1. Pegasus Chisel sources in `../pegasus/chisel/` (relative to buckyball/arch/)
2. FPGA toolchain (Vivado, Quartus, or similar) matching your target platform
3. Verilator (for co-simulation during development)
4. Spike RISC-V simulator (for functional reference)

### Conditional Build

Pegasus is included in the build if available:

```bash
# Enter Nix environment (includes all tools)
nix develop

# Compile with Pegasus support (if installed)
mill buckyball.compile

# Verify Pegasus integration in build output
mill show buckyball.moduleDeps
```

### Configuration

Target-specific configurations live in `sims/pegasus/`:

- `PegasusHarness`: Base system wrapper
- `PegasusHarnessBinders`: AXI4 memory binding and clock wiring
- Platform-specific configurations (Vivado, Quartus) as needed

## Running Pegasus Simulations

### Using bbdev

While Verilator is the primary simulation backend via `bbdev verilator`, FPGA simulations typically run through vendor-specific tools. However, you can co-simulate Pegasus designs during development:

```bash
# Compile Pegasus design to RTL
bbdev build --config sims.pegasus.PegasusHarness

# Generate simulation scripts and waveforms
bbdev verilator --run \
  '--jobs 16 \
    --binary <test-binary> \
    --config sims.pegasus.PegasusHarness \
    --batch'
```

### FPGA Flow

For actual FPGA deployment, follow your vendor's methodology:

**Vivado (Xilinx):**
```bash
# Generate Verilog from Chisel/PegasusShell
mill buckyball.compile --no-test

# In Vivado project:
# 1. Create new RTL project
# 2. Add generated Verilog files
# 3. Instantiate PegasusShell at top level
# 4. Connect I/O to FPGA I/O constraints
# 5. Run synthesis, place & route
# 6. Generate bitstream
```

**Quartus (Intel/Altera):**
```bash
# Similar flow; add Verilog to Quartus project
# Map PegasusShell I/O to Qsys (or raw port constraints)
```

### AU280 FPGA Board Deployment

The Xilinx AU280 is the primary target board for Buckyball FPGA deployment. Two specialized commands enable rapid prototyping and workload execution:

**Flashing Bitstream to AU280:**

```bash
bbdev_pegasus_flashbitstream(bitstream?, serial?, bus_id?)
```

This command programs the AU280 FPGA with a compiled bitstream using Vivado tools. Parameters:
- `bitstream`: Path to the .bit file (optional; defaults to latest compiled bitstream)
- `serial`: Serial number of the AU280 board (optional; auto-detects if single board present)
- `bus_id`: PCIe bus ID for the card (optional; auto-detects if single board present)

The flash process handles PCIe device removal and rescanning automatically, ensuring proper initialization.

**Running Workloads on AU280:**

```bash
bbdev_pegasus_runworkload(workload?, board?, timeout?, uart?, control?, h2c?)
```

This command loads and executes a Linux kernel and rootfs into the AU280's HBM2 memory and runs the workload on the SoC:
- `workload`: Path to the executable or test image (optional; defaults to built test binary)
- `board`: AU280 serial number (optional; auto-detects)
- `timeout`: Execution timeout in seconds (default: 60)
- `uart`: Enable/disable UART logging (default: enabled)
- `control`: PCIe control channel type (default: h2c)
- `h2c`: H2C DMA channel for workload upload (default: 0)

UART output is logged to `arch/log/<timestamp>/pegasus_uart.log` for post-execution analysis and debugging. The kernel is prebuilt and loaded via DMA into HBM2 at address offset 0x80000000 (DDR4 base). Virtual addresses in the SoC map to this physical memory bank.

## Memory Constraints

### Address Range

On the AU280, the AXI4 address bus is 32 bits, supporting up to 4 GB of address space. The DDR4 memory starts at 0x80000000 in the RISC-V address space. When loading workloads via PCIe H2C DMA, the effective transfer address is calculated as:

```
pwrite address = SoC virtual address - 0x80000000
```

This offset maps the SoC's DDR4 base address to the start of the H2C channel's transfer window.

### Data Width

The AU280 deployment uses 64-bit (8-byte) wide data transfers, distinct from larger simulation configurations. Byte enables (`chip_mem_wstrb`) allow sub-word writes.

## Debugging

### Waveform Capture

Pegasus simulations in Verilator generate VCD waveforms:

```bash
bbdev verilator --run '--batch --vcd pegasus_sim.vcd --binary <test-binary>'
```

### Signal Inspection

Key signals for debugging:

- `pcie_sys_clk`, `dut_clk`: Clock domain synchronization
- `chip_mem_awvalid`, `chip_mem_awready`: Write address handshake
- `chip_mem_wvalid`, `chip_mem_wready`: Write data handshake
- `chip_mem_arvalid`, `chip_mem_arready`: Read address handshake

Use GTKWave or similar to trace signal transitions and verify protocol compliance.

### Reset Sequencing

Ensure proper reset order:

1. Assert `pcie_sys_rst_n` (active low)
2. Wait ≥ 10 clock cycles
3. Release `pcie_sys_rst_n`
4. Observe `dut_reset` going inactive

Improper reset sequencing is a common source of simulation hangs.

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Compilation fails with "pegasus not found" | Pegasus sources missing | Clone pegasus repo to `../pegasus/chisel/` |
| Memory transactions never complete | `chip_mem_*ready` signals stuck low | Check external memory model; verify address range |
| DUT clock never starts | Clock input disconnected | Verify `pcie_sys_clk` is connected and running |
| Waveforms show zero data | Data bus not driven | Check `chip_mem_rdata` on read path; verify write data propagation |

## See Also

- [Development Workflow and Build System](Development%20Workflow%20and%20Build%20System.md)
- [Verilator Simulation and CI](Verilator%20Simulation%20and%20CI.md)
- [Bebop Spike-Verilator Cosimulation](../Architecture/Bebop%20Spike-Verilator%20Cosimulation.md)
- [Buckyball ISA Documentation](../Overview/Buckyball%20ISA.md)
