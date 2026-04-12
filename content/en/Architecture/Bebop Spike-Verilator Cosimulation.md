# Bebop Spike-Verilator Cosimulation

## Overview

Bebop is a vector computation accelerator integrated with Buckyball for high-performance machine learning workloads. The Spike-Verilator cosimulation framework enables cycle-accurate hardware verification of Bebop operations by coupling the Spike RISC-V functional simulator with Verilator-based RTL simulation.

This setup allows developers to test complex vector operations against a reference ISA model, ensuring correctness before silicon deployment and accelerating RTL validation during hardware design iterations.

## Architecture

### Component Layout

The cosimulation infrastructure consists of three main components:

1. **Spike Functional Model**: RISC-V ISA simulator providing golden reference execution
2. **Bebop RTL**: Chisel-generated RTL for vector compute units, including frontend and memory domains
3. **Cosimulation Harness**: Synchronizes instruction execution between Spike and RTL, validates results

### Integration Points

Bebop integrates into Buckyball as a specialized accelerator domain with dedicated memory backend and vector computation units. The cosimulation couples Spike at the Custom instruction (RoCC) boundary, validating both execution semantics and memory access patterns.

**Key Modules:**

- `BebopBuckyballSubsystemCosim`: Full system wrapper combining Spike interface, memory hierarchy, and vector compute blocks
- `BebopSpikeCosimTop`: Top-level Verilator module that executes RoCC instructions and returns results
- `BebopCosimBlocks`: Functional blocks implementing vector operations (matmul, vlen, bank operations)
- `VecComputeTop`: Vector computation unit integrating matmul and other SIMD operations

## Spike-Verilator Communication Protocol

### Instruction Format

Custom RoCC instructions route to Bebop via the `custom3` opcode (0x7B):

```
Instruction Layout:
[funct7(7) | rs2(5) | rs1(5) | funct3(3) | rd(5) | opcode(7)]
opcode = 0x7B (custom3)
funct3 = 0x3 (fixed for Bebop)
```

Bebop operations are encoded in the 7-bit `funct` field, with up to 128 distinct operations supported.

### Result Encoding

Execution results follow a deterministic encoding:

```
- If execution succeeds and returns value 0: rd = funct (operation ID)
- If execution produces non-zero value or fails: rd = 0
```

Optional 64-bit bank digest peek allows comparing internal state between RTL and golden model for advanced verification.

## Running Bebop Cosimulation

### Environment Setup

Ensure all Bebop dependencies are installed:

```bash
nix develop
```

This provides Spike, Verilator, and the compiled Bebop toolchain.

### Basic Cosimulation Test

Execute a single vector operation through Spike-Verilator:

```bash
bbdev verilator --run \
  '--jobs 16 \
    --binary ctest_bebop_cosim_matmul \
    --config sims.bebop.BebopSpikeVerilatorCosimConfig \
    --batch'
```

### Configuration Classes

| Configuration | Purpose |
|---------------|---------|
| `BebopSpikeVerilatorCosimConfig` | Standard cosim with Spike coupling and vector compute blocks |
| `BebopSpikeCosimToyConfig` | Lightweight cosim for quick verification during development |
| `BebopBuckyballFullCosimConfig` | Full system with all domains (if available) |

## Vector Operations

### Supported Operations

Bebop implements RISC-V Vector Extension-inspired operations optimized for matrix and tensor workloads:

- **MATMUL**: Blocked matrix multiplication with configurable tile sizes
- **VLEN**: Vector length reduction operations
- **BANK_OPS**: Internal bank access for debugging and verification
- **VPADD**: Vector parallel addition
- **VSHUFFLE**: Data shuffling within vector units

Each operation encodes functional parameters (e.g., tile size, data type) within `rs1` and `rs2` register values.

### Example: Matrix Multiplication

To verify a 64×64 matrix multiply with int32 data:

```bash
# Test workload invokes RoCC instruction with funct=MATMUL_INT32
# rs1 = matrix A pointer, rs2 = matrix B pointer
# Spike executes reference C = A × B
# RTL executes same, compares result
```

## Memory Integration

### Address Translation

Bebop shares the main memory hierarchy with Buckyball cores via the unified TileLink memory fabric. Virtual-to-physical translation occurs in the frontend; Bebop operates on physical addresses for DMA and load/store operations.

**Typical Address Map:**
- Code and data: 0x80000000 – 0x8FFFFFFF
- Bebop working memory: Dynamically allocated within heap
- Stack: 0x9FFF0000 – 0x9FFFFFFF

### Memory Backend

Vector operations use the shared memory backend with:
- Coherent read/write for intermediate results
- Burst transfers for large matrix blocks (cache-line aligned)
- Back-pressure via stall signals during congestion

### DMA Considerations

Bebop includes optional DMA support for prefetching matrix data. DMA operations are serialized with compute operations; memory conflicts are checked in cosimulation.

## Debugging Workflow

### Waveform Capture

Generate VCD waveforms for signal inspection:

```bash
bbdev verilator --run \
  '--batch --vcd bebop_cosim.vcd \
    --binary ctest_bebop_cosim_matmul'
```

Open in waveform viewer (GTKWave, Verdi):

```bash
gtkwave bebop_cosim.vcd
```

### Trace Analysis

Enable execution tracing:

```bash
bbdev verilator --run \
  '--batch --verbose \
    --binary ctest_bebop_cosim_matmul' 2>&1 | tee cosim.log
```

The log contains:
- Instruction fetch/decode events
- RoCC operation invocation (funct, xs1, xs2)
- Execution result and latency
- Memory access patterns

### Mismatch Diagnosis

If RTL result differs from Spike reference:

1. **Compare funct encoding**: Verify RoCC instruction opcode matches operation definition
2. **Check data routing**: Trace rs1/rs2 values through memory hierarchy
3. **Inspect internal state**: Use `bankDigestPeek` to compare bank state before/after
4. **Review waveforms**: Identify cycle where divergence occurs

## Performance and Scaling

### Simulation Speed

Single vector operation (e.g., 64×64 matmul):
- RTL simulation: ~10–50K cycles
- Simulation wall time: ~1–5 seconds (on modern CPU)
- Bottleneck: Memory latency and verification overhead

### Scaling Considerations

- **Multiple cores**: Each additional Buckyball core degrades simulation speed
- **Larger matrices**: Simulation time scales quadratically with matrix dimension
- **Bank conflicts**: If internal bank access patterns are complex, use `--jobs` to parallelize compilation

### Optimization Tips

- Reduce test matrix sizes for quick iteration (e.g., 16×16 instead of 256×256)
- Cache compiled simulator binaries across runs
- Run multiple tests in parallel by invoking separate `bbdev` processes
- Use toy configurations for early-stage verification

## Troubleshooting

### Cosimulation Hangs

**Symptom:** Verilator process runs indefinitely without output

**Solutions:**
1. Verify Spike is installed: `which spike`
2. Check RoCC instruction encoding (funct, xs1, xs2 values)
3. Ensure memory backend is responsive (check for DMA deadlock)
4. Increase timeout in test runner

### Result Mismatch

**Symptom:** RTL and Spike produce different rd values

**Solutions:**
1. Verify funct encoding matches operation definition in `BebopCosimBlocks`
2. Check xs1/xs2 alignment (must match vector element width)
3. Inspect memory contents before/after to detect corruption
4. Compare waveforms at cycle where divergence occurs

### Out of Memory

**Symptom:** Verilator process killed or crashes

**Solutions:**
1. Reduce matrix size or test complexity
2. Disable unnecessary traces (e.g., bank digests if not needed)
3. Run on machine with more RAM (minimum 4 GB recommended)
4. Use separate test runs instead of bundling many tests

## Integration with CI/CD

The cosimulation framework integrates into the Buckyball CI pipeline for continuous verification:

```yaml
- name: Bebop Cosimulation Tests
  run: |
    nix develop --command bash -c \
      'bbdev verilator --run "--batch --jobs 16 --binary ctest_bebop_cosim_*"'
```

Tests are run in parallel by test binary name. CI fails if any cosimulation test produces incorrect results.

## See Also

- [Development Workflow and Build System](Development%20Workflow%20and%20Build%20System.md)
- [Verilator Simulation and CI](Verilator%20Simulation%20and%20CI.md)
- [Execution Tracing and Performance Analysis](Execution%20Tracing%20and%20Performance%20Analysis.md)
- [Buckyball ISA Documentation](../Overview/Buckyball%20ISA.md)
