# Verilator Simulation and CI

## Overview

Verilator is the primary hardware simulation tool in Buckyball, used for rapid RTL verification and continuous integration testing. Recent updates improve clock handling, timing robustness, and CI configuration consistency.

## Setup and Configuration

### Installation

Verilator is included in the Nix development environment:

```bash
nix develop
```

### Project Configuration

Verilator projects in Buckyball are configured via:

- `BBSimHarness`: System-level simulation harness with clock and reset management
- `sims/verilator/` directory: Simulation-specific configurations and test runners

## Clock and Timing Improvements

### Rising-Edge Detection (mmio_tick)

Recent updates to `BBSimHarness` refine the `mmio_tick` signal for rising-edge detection:

```scala
// Debounce and rising-edge detection for wFire signal
val wFire_r = RegNext(wFire)
val wFire_rising = wFire && !wFire_r
```

This prevents spurious trigger detection and aligns with MMIO peripheral behavior.

### Clock Edge Handling

The simulation harness now:
1. Maintains explicit rising-edge and falling-edge cycle tracking
2. Debounces write-fire signals to prevent duplicate MMIO operations
3. Aligns clock phases with expected rising-edge semantics

## Memory Section Handling

### BBSimHarness Configuration

Memory sections are correctly handled in simulation via:

- **Linker script**: Defines DRAM, code, and stack regions
- **Memory mapping**: Ensures virtual-to-physical address translation matches hardware
- **Initialization**: Pre-loads test code and data into simulated memory

### Example Linker Configuration

Memory sections typically include:

```
DRAM:  0x80000000 – 0x9FFFFFFF (512 MB default, configurable)
CODE:  0x80000000 – 0x800FFFFF (1 MB default)
STACK: 0x9FFF0000 – 0x9FFFFFFF
```

## DRAMSim2 Memory Simulation

Buckyball now includes DRAMSim2-based memory management for more realistic DRAM timing simulation. This replaces the simple magic memory model with cycle-accurate DRAM behavior.

### Overview

DRAMSim2 integration provides:

- **Realistic DRAM timing**: Simulates actual DDR4 bank conflicts, refresh cycles, and row buffer behavior
- **Configurable memory systems**: Supports different DRAM configurations via INI files
- **AXI4 interface**: Standard handshake protocol for read/write requests with per-request ID tracking
- **Burst support**: Handles AXI4 bursts (multiple beats per transaction)

### Architecture

Two memory backend implementations are available:

1. **`mm_magic_t`**: Simple magic memory (zero-cycle, for baseline testing)
   - Immediately responds to all requests
   - No timing realism
   - Useful for functional verification

2. **`mm_dramsim2_t`**: DRAMSim2-based realistic memory
   - Accepts DRAMSim2 configuration files (memory.ini, system.ini)
   - Tracks per-ID read/write request queues
   - Issues transactions to DRAMSim2 and processes callbacks
   - Applies configurable CPU clock frequency

### Configuring DRAMSim2

The `mm_dramsim2_t` constructor accepts:

- `mem_base`: Physical memory base address
- `mem_size`: Total addressable memory (must be multiple of 1 MB)
- `word_size`: Data bus width (typically 8 bytes)
- `line_size`: Cache line size (fixed at 64 bytes for DRAMSim2)
- `clock_hz`: CPU clock frequency in Hz (passed to DRAMSim2)
- `memory_ini`, `system_ini`, `ini_dir`: Path to DRAMSim2 configuration files

### AXI4 Request Handling

Requests flow through separate read and write channels:

**Read (AR+R):**
- AR channel provides address, ID, size, and burst length
- Requests are queued and issued to DRAMSim2
- Read callback (`read_complete`) generates R responses with data in order

**Write (AW+W+B):**
- AW channel provides write address metadata; W channel provides actual data
- Both channels must be ready before accepting a write transaction
- Write callback (`write_complete`) generates B response with transaction ID

### Integration with Verilator Harness

The `BBSimDRAM` module bridges Scala/Chisel to C++ memory backends via DPI-C:

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

DPI functions: `bbsim_memory_init`, `bbsim_memory_tick` handle initialization and per-cycle simulation.

### When to Use DRAMSim2

- **Cycle-accurate benchmarking**: When DRAM timing affects results
- **Performance analysis**: To study bank conflicts and refresh impact
- **Architecture exploration**: When evaluating memory bus width or controller changes

**Note:** DRAMSim2 simulation is slower than magic memory; use for targeted analysis rather than all tests.

## Running Verilator Simulation

### Basic Test

```bash
bbdev verilator --run \
  '--jobs 16 \
    --binary ctest_vecunit_matmul_ones_singlecore-baremetal \
    --config sims.verilator.BuckyballToyVerilatorConfig \
    --batch'
```

### Parameters

| Option | Meaning |
|--------|---------|
| `--jobs 16` | Use 16 parallel compile jobs |
| `--binary` | Workload binary name |
| `--config` | Simulation configuration class |
| `--batch` | Non-interactive mode |

### Available Configurations

- `BuckyballToyVerilatorConfig`: Single-core toy configuration for unit testing
- `BuckyballFullVerilatorConfig`: Multi-core full system (if available)

## CI Pipeline Updates

### Workflow Configuration

Recent CI updates in `.github/workflows/test.yml`:

1. **Verilator Setup**: Installs and caches compiled simulator
2. **Test Matrix**: Runs subset of tests in parallel
3. **Timing**: Enforces clock edge semantics for deterministic results
4. **Debugging**: Captures waveforms on failure (conditional)

### Example Workflow Step

```yaml
- name: Run Verilator Tests
  run: |
    nix develop --command bash -c \
      'bbdev verilator --run "--batch --jobs 16 --binary <test-binary>"'
```

## Debugging and Analysis

### Waveform Capture

To generate VCD waveforms for debugging:

```bash
bbdev verilator --run '--batch --vcd out.vcd --binary <test-binary>'
```

### Waveform Inspection

- Open VCD files in GTKWave, Verdi, or similar tools
- Trace signal behavior across clock cycles
- Correlate with instruction commit log

### Execution Trace Analysis

Buckyball generates binary trace files (BDB) during simulation containing detailed execution information:

**Available trace types:**
- `ITRACE`: Instruction issue and completion events with RoB tracking
- `MTRACE`: Memory access patterns (load/store/DMA operations)
- `PMCTRACE`: Performance counter events (cache, branch predictions)
- `CTRACE`: Commit and retire events
- `BANKTRACE`: Bank access patterns for scoreboard analysis

**Enabling traces:**

Traces are controlled via `bdb_trace_mask` set at simulation start. Individual traces can be enabled/disabled based on domain requirements.

**NDJSON Trace Visualization:**

Recent Buckyball releases enhanced tracing with NDJSON-format output and clock cycle support for timeline visualization:

```bash
# Generate NDJSON trace with clock cycle info
bbdev verilator --run '--batch --binary <test-binary>' 2>&1 | tee sim.log

# Visualize RoB activity timeline (requires bdb_ndjson_viz.py)
python3 arch/scripts/bdb_ndjson_viz.py <trace-file>.ndjson --output rob_timeline.png

# Annotate trace with function/instruction names
python3 arch/scripts/bdb_ndjson_annotate.py <trace-file>.ndjson --isa <isa-dir>
```

**Trace record structure:**

Each NDJSON record contains:
- `clk`: Real RTL clock cycle at capture time
- `kind`: Event type (issue, complete, alloc, free)
- `domain_id`: Target domain (ball, mem, gp, etc.)
- `rob_id`: Reorder buffer entry identifier
- `instr`: Instruction encoding or operation details
- Metadata: timings, bank access patterns, cache outcomes

## Performance Considerations

### Simulation Speed

- Single-core toybox: ~100K cycles/second on modern CPU
- Multi-core systems: Speed degrades with core count
- Typical small test: 1–5 seconds simulation time

### Resource Usage

- Memory: ~500 MB–2 GB depending on design size
- Disk: Compiled simulator (~200 MB)
- CPU: Scales with `--jobs` parameter

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Memory access out of bounds | Verify linker script and workload base address |
| Simulation hangs | Check for deadlock in memory controller or DMA |
| Incorrect clock edge | Verify rising-edge detection in BBSimHarness |
| Test timeouts | Increase timeout or reduce test complexity |

### Debug Output

Enable verbose simulation output:

```bash
bbdev verilator --run '--batch --verbose --binary <test-binary>'
```

## See Also

- [Building Your Own Hardware Designs](../Tutorial/Building%20Your%20Own%20Hardware%20Designs.md)
- [Buckyball ISA Documentation](../Overview/Buckyball%20ISA.md)
- [Execution Tracing and Performance Analysis](Execution%20Tracing%20and%20Performance%20Analysis.md)
- [Frontend Instruction Scheduling and Bank Aliasing](Frontend%20Instruction%20Scheduling%20and%20Bank%20Aliasing.md)
- [Bebop Spike-Verilator Cosimulation](../Architecture/Bebop%20Spike-Verilator%20Cosimulation.md)
- [Vector Computation Support](../Architecture/Vector%20Computation%20Support.md)
