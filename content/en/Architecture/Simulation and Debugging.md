# Simulation and Debugging

## Overview

Buckyball provides comprehensive simulation and debugging capabilities through multiple harnesses and tools, enabling cycle-level analysis and instruction tracing during development.

## Simulation Harnesses

Buckyball supports multiple simulation backends for different use cases:

### Verilator Harness

The **BBSimHarness** provides fast open-source simulation using Verilator.

**Key features:**
- Fast cycle-accurate simulation
- MMIO support for simulation control and console output
- Instruction tracing with cycle counter
- Bank backdoor access for data inspection
- Waveform generation (FST format)

**Usage:**

```bash
# Generate Verilog from Chisel
bbdev verilator --verilog '--config sims.verilator.BuckyballToyVerilatorConfig'

# Run simulation with waveform
bbdev verilator --run '--jobs 16 --binary <binary_name> --config sims.verilator.BuckyballToyVerilatorConfig --batch'
```

**Simulation output:**
- `arch/log/<timestamp>-<binary>/` — execution logs and trace
- `arch/waveform/<timestamp>-<binary>/waveform.fst` — waveform file
- `bdb.log` — cycle counter and bank access trace

### MMIO Interface

The MMIO (Memory-Mapped I/O) interface enables simulation control and console I/O during Verilator runs.

**Address map:**
- `0x6000_0000` — simulation exit (write any value to end simulation)
- `0x6002_0000` — UART0 TX (write low byte for character output)

**Example usage in C:**

```c
// Trigger simulation exit
*(volatile uint32_t*)0x60000000 = 0;

// Print character via UART
void putchar(char c) {
  *(volatile uint32_t*)0x60020000 = (uint32_t)c;
}
```

## Debugging with TraceBall

TraceBall is a special execution unit that provides runtime debugging without performing computation. It enables cycle-level performance profiling and SRAM data inspection.

### Cycle Counter API

Use up to 16 independent cycle counters to measure any code region's execution time.

**Instructions:**

| Instruction | funct7 | Function |
|------------|--------|----------|
| `bdb_counter_start(ctr_id, tag)` | 0x30 | Start counter, record cycle and tag |
| `bdb_counter_stop(ctr_id)` | 0x30 | Stop counter, output elapsed cycles |
| `bdb_counter_read(ctr_id)` | 0x30 | Read current counter value (non-blocking) |

**Example:**

```c
#include <bbhw/isa/isa.h>

// Measure matrix multiply cycles
bdb_counter_start(0, 0xA001);  // tag = 0xA001 (matmul)
bb_mul_warp16(A, B, C, 16);
bb_fence();
bdb_counter_stop(0);  // Output elapsed cycles

// Measure nested regions
bdb_counter_start(0, 0x0001);  // outer: convolution
  bdb_counter_start(1, 0x0002);  // inner: im2col
  bb_im2col(...);
  bb_fence();
  bdb_counter_stop(1);

  bdb_counter_start(2, 0x0003);  // inner: matmul
  bb_mul_warp16(...);
  bb_fence();
  bdb_counter_stop(2);
bdb_counter_stop(0);
```

**Output in bdb.log:**

```
[CTRACE] CTR_START  ctr=0 tag=0x0001 cycle=0
[CTRACE] CTR_START  ctr=1 tag=0x0002 cycle=0
[CTRACE] CTR_STOP   ctr=1 tag=0x0002 elapsed=150 cycle=150
[CTRACE] CTR_START  ctr=2 tag=0x0003 cycle=0
[CTRACE] CTR_STOP   ctr=2 tag=0x0003 elapsed=300 cycle=300
[CTRACE] CTR_STOP   ctr=0 tag=0x0001 elapsed=456 cycle=456
```

### SRAM Backdoor Access

Inject or extract test data directly to/from SRAM banks without using the DMA engine. Useful for unit testing and data verification.

**Instructions:**

| Instruction | funct7 | Function |
|------------|--------|----------|
| `bdb_backdoor_mvin(rows)` | 0x31 | Inject rows into private bank (from DPI-C) |
| `bdb_backdoor_write(bank_id, rows)` | 0x31 | Copy from private bank to target bank |
| `bdb_backdoor_read(bank_id, rows)` | 0x31 | Dump bank rows to trace |

**Example: inject test data and verify transpose result:**

```c
// DPI-C injects 16 rows of data into TraceBall private bank
bdb_backdoor_mvin(16);

// Copy to bank 0
bdb_backdoor_write(0, 16);

// Run transpose
bb_alloc(0, 1, 1);
bb_transpose(0, 1, 16);

// Read result from bank 1
bdb_backdoor_read(1, 16);
```

**Output in bdb.log:**

```
[BANK-TRACE] BACKDOOR_WRITE bank=0 row=0 data=0x00010002000300040005000600070008
[BANK-TRACE] BACKDOOR_READ  bank=1 row=0 data=0x00000001000200030004000500060007
```

## Waveform Analysis

Waveform files (FST format) capture cycle-level signal transitions and are essential for detailed debugging.

### Viewing Waveforms

1. Download the FST file from `arch/waveform/<timestamp>/waveform.fst`
2. Open with GTKWave or similar tool:

```bash
gtkwave waveform.fst &
```

### Finding Signals

To locate a Ball's execution signals in the waveform hierarchy:

**Path pattern for toy configuration:**

```
TOP.TestHarness.chiptop0.system.tile_prci_domain.element_reset_domain_tile
  .buckyball.ballDomain.bbus.balls_<BID>.<UnitName>
```

**Example — MatrixBall (BID=1):**

```
TOP.TestHarness.chiptop0.system.tile_prci_domain.element_reset_domain_tile
  .buckyball.ballDomain.bbus.balls_1.matrixUnit
```

Key signals to inspect:
- `valIn`, `readyIn` — input handshake
- `valOut`, `readyOut` — output handshake
- `op1`, `op2` — operand values
- Bank read/write ports for data movements

## Configuration Files

Buckyball uses Scala configuration classes to define simulation parameters.

### Toy Configuration

The default configuration for development and testing.

```scala
class BuckyballToyVerilatorConfig extends Config(...)
```

**Properties:**
- 1 BBTile with 1 Rocket core + 1 BuckyballAccelerator
- 8 SRAM banks (configurable capacity)
- Standard Ball operators (VecBall, MatrixBall, Im2colBall, TransposeBall)
- TraceBall for debugging
- 128-bit system bus

### Goban Configuration

Multi-core configuration with 4 cores per tile sharing a single accelerator domain.

```scala
class BuckyballGobanConfig extends Config(...)  // 1 tile, 4 cores
class BuckyballGoban2TileConfig extends Config(...)  // 2 tiles, 8 cores
```

**Properties:**
- Multiple Rocket cores (configurable)
- Shared Ball operators and memory
- BarrierUnit for multi-core synchronization
- Same ISA as toy configuration

## Build and Run Workflow

### 1. Prepare Workload

```bash
cd bb-tests/build
rm -rf *
cmake -G Ninja ../
ninja <workload_target>
```

### 2. Generate Verilog

```bash
bbdev verilator --verilog '--config sims.verilator.BuckyballToyVerilatorConfig'
```

### 3. Run Simulation

```bash
bbdev verilator --run '--jobs 16 --binary <binary_name> \
  --config sims.verilator.BuckyballToyVerilatorConfig --batch'
```

### 4. Analyze Results

- **Execution log:** `arch/log/<timestamp>/disasm.log`
- **Trace file:** `arch/log/<timestamp>/bdb.log` (if using TraceBall)
- **Waveform:** `arch/waveform/<timestamp>/waveform.fst`

## Troubleshooting

### Simulation Timeout or Deadlock

**Symptoms:**
- Simulation hangs without completing
- Timeout error in bbdev output

**Diagnosis:**
1. Check `disasm.log` — last executed instruction may indicate where it stalled
2. Load `waveform.fst` and inspect Ball signals near the end time
3. Look for stalled handshakes (valOut=1 but readyOut=0)

**Common causes:**
- Ball operator not responding (check instruction decoding)
- Memory deadlock (check bank allocation and access patterns)
- Missing fence() call before reading results

### Waveform File Corrupt

**Symptoms:**
- `waveform.fst.hier` file exists alongside `waveform.fst`
- FST file won't open in GTKWave

**Resolution:**
- Indicates failed simulation. Check logs for crash or timeout.
- Re-run simulation and ensure it completes successfully.

### TraceBall Not Activated

**Symptoms:**
- No `bdb.log` file generated
- `bdb_counter_*` calls don't produce output

**Diagnosis:**
1. Verify TraceBall is registered in busRegister.scala
2. Check that DISA includes funct7 0x30 and 0x31
3. Ensure instruction encoding is correct in test code

## Advanced: Custom Harness

To create a custom simulation harness:

1. Create Scala class extending appropriate harness base
2. Define MMIO address map and DPI-C callbacks
3. Implement `mmio_tick()` handler in C++
4. Register in `TargetConfigs.scala` for bbdev CLI

Example file: `arch/src/main/scala/sims/verilator/BBSimHarness.scala`

## Related Documentation

- [Building Your Own Hardware Designs](../Tutorial/Building%20Your%20Own%20Hardware%20Designs.md) — full Ball development workflow
- [Ball Reference](../Reference/Ball%20Reference.md) — Ball operator specifications
- Buckyball ISA Reference — instruction encoding details
