# Vector Computation Support in Bebop

## Overview

Bebop's vector computation subsystem provides high-throughput data-parallel operations for machine learning accelerators integrated with Buckyball. The vector compute units process element-wise and reduction operations on multi-lane vector data, supporting various data types and operation modes.

Recent enhancements to Bebop's vector acceleration capabilities include extended operation coverage, improved latency characteristics, and enhanced bank access patterns for efficient memory utilization.

## Architecture

### Vector Lanes and Data Types

The vector computation unit operates on 16 parallel lanes (configurable):

- **Lane count**: 16 lanes per vector unit
- **Input precision**: 8-bit elements (int8, uint8 supported)
- **Output precision**: 32-bit results (int32 for accumulation)
- **Operations per cycle**: Up to 16 parallel element operations

This configuration balances throughput with area/power efficiency for typical ML workloads.

### Core Compute Modules

#### MulOp (Multiplication Operator)

The `MulOp` module implements element-wise multiplication with optional accumulation:

**Interface:**

```
Input:
  - valid: Operation valid signal
  - in1[0..15]: 16 × 8-bit operand A
  - in2[0..15]: 16 × 8-bit operand B

Output:
  - valid: Result valid
  - out[0..15]: 16 × 32-bit products (A[i] × B[i])
```

**Execution semantics:**

- Single-cycle latency for multiply operation
- Results available when `valid` asserts
- Back-pressure via ready signal (held high for continuous throughput)

#### VecComputeTop

The `VecComputeTop` wrapper orchestrates iterations of multiplication across matrix blocks:

```scala
val start = Input(Bool())       // Initiate computation
val iter = Input(UInt(16.W))   // Iteration count
val op1 = Input(Vec(16, UInt(8.W)))  // 16 operands A
val op2 = Input(Vec(16, UInt(8.W)))  // 16 operands B
val res = Output(Vec(16, UInt(32.W))) // 16 results
val valid = Output(Bool())     // Results valid
val done = Output(Bool())      // Computation complete
```

**Execution flow:**

1. Assert `start` with iteration count in `iter`
2. Load operands `op1[0..15]` and `op2[0..15]`
3. Hold `active` high as `MulOp` produces results each cycle
4. After `iter` iterations, assert `done`

### Integration with Bebop Accelerator

Vector compute units connect to the broader Bebop memory and control hierarchy:

- **Frontend**: Decodes vector instructions, routes operands to compute units
- **Memory domain**: Handles prefetching of matrix/tensor data into local buffers
- **Bank hierarchy**: Internal dual-port RAMs store intermediate and final results
- **Result writeback**: Accumulation results return to main memory via TileLink

## Vector Operations

### Supported Operations

Bebop implements a core set of vector operations optimized for dense linear algebra:

| Operation | Description | Latency | Throughput |
|-----------|-------------|---------|-----------|
| VMUL | Element-wise multiply (int8 × int8 → int32) | 1 cycle | 16 pairs/cycle |
| VMAC | Multiply-accumulate chain | 1 cycle | 16 pairs/cycle |
| VREDSUM | Vector reduction sum | 4–6 cycles | 1 result/operation |
| VREDMAX | Vector reduction max | 4–6 cycles | 1 result/operation |
| VPADD | Parallel add (int32 + int32 → int32) | 1 cycle | 16 pairs/cycle |
| VSHUFFLE | Intra-lane shuffling for data reorganization | 2 cycles | 16 elements/cycle |

### Data Flow Example: 64×64 Matmul

Matrix multiplication decomposes into tiled operations:

```
Given A[64×64] and B[64×64]:
1. Frontend loads tile A[0..15, 0..15] and B[0..15, 0..15]
2. VecComputeTop executes 16 iterations:
   - Cycle 0: Multiply column 0
   - Cycle 1: Multiply column 1
   - ...
   - Cycle 15: Multiply column 15
3. Accumulator in memory integrates partial results
4. Repeat for remaining tiles until full result computed
```

## Memory Interactions

### Operand Supply

Vector operations read operands from local dual-port RAM (bank hierarchy):

- **Port A (read)**: Operands for current iteration
- **Port B (read)**: Prefetch for next iteration
- **Write port**: Writeback results to memory

This dual-access enables pipelined operation scheduling.

### Result Accumulation

Intermediate results accumulate in designated memory regions:

- **Buffer location**: Aligned to 64-byte boundaries for efficient cache-line transfers
- **Atomicity**: No atomic operations; software coordinates multi-instruction accumulations
- **Coherency**: Results visible to Buckyball cores after writeback completes

### Bandwidth Optimization

Burst memory operations hide latency:

```
Prefetch pattern:
- While iteration N computes, DMA loads data for iteration N+1
- Each 16-lane result (64 bytes) writes to memory in single TileLink burst
```

## Performance Characteristics

### Throughput

For dense matrix operations:

- **Sustained throughput**: 16 multiply-accumulate operations per cycle
- **System throughput**: Limited by memory bandwidth (typically 8–16 Gbps)
- **Utilization**: 70–85% typical for well-tiled kernels

### Latency

Per-operation latencies (single matrix multiply):

- **Multiply**: 1 cycle
- **Reduction**: 4–6 cycles (tree-based parallel reduction)
- **Memory round-trip**: 20–50 cycles (depends on cache state)

### Scaling Across Cores

When Buckyball runs multi-threaded workloads:

- Vector compute shares TileLink bus with CPU cores
- Contention increases memory latency (expected 1.2–1.5× slowdown per core)
- Scheduling tool (`GlobalScheduler`) can prioritize Bebop operations during memory-intensive phases

## Programming Interface

### RoCC Instruction Format

Vector operations encode in RoCC custom instructions:

```
Instruction: funct=BEBOP_VMUL, rs1=A_addr, rs2=B_addr, rd=dest_reg
```

The RoCC interface routes operands and receives results through the Spike-Verilator cosimulation.

### Software Stack

Typical ML framework usage:

```python
# PyTorch/TensorFlow-style usage (compiled to RoCC)
C = A @ B  # Matrix multiply dispatches to Bebop
# RTL executes VecComputeTop iterations
# Results written back to C buffer
```

### Manual Tuning

Advanced users can control:

- Tile size and iteration count
- Bank selection for operand placement
- Prefetch timing relative to compute

## Debugging and Analysis

### Waveform Inspection

Enable detailed tracing of vector operations:

```bash
bbdev verilator --run \
  '--batch --vcd veccomp.vcd \
    --binary ctest_bebop_vec_matmul'
```

In waveform viewer, inspect:
- `VecComputeTop.io.start` (operation trigger)
- `VecComputeTop.io.valid` (result ready)
- `MulOp.io.in/out` (operand/result buses)

### Execution Trace

Enable verbose output to see operation dispatch:

```bash
bbdev verilator --run \
  '--batch --verbose \
    --binary ctest_bebop_vec_matmul' 2>&1 | grep "VMUL\|VREDSUM"
```

Output includes:
- Instruction funct code
- Operand values and addresses
- Result latency and correctness

### Bank Access Patterns

Use `bankDigestPeek` to validate internal state after vector operations:

```scala
// In cosimulation harness
val expectedDigest = sha256(A) ^ sha256(B)  // Golden model
assert(bankDigest === expectedDigest, "Bank state mismatch")
```

## Troubleshooting

### Incorrect Results

**Symptom**: Output differs from reference (CPU matmul)

**Diagnostic steps:**
1. Verify operand data types match (8-bit input, 32-bit output)
2. Check lane count configuration (must be 16)
3. Inspect accumulated partial results in memory
4. Compare waveforms at cycle where divergence occurs

**Common causes:**
- Lane count mismatch in configuration
- Incorrect operand alignment (must be vector-aligned)
- Integer overflow in accumulation (check scaling)

### Performance Lower Than Expected

**Symptom**: Operation takes longer than theoretical latency

**Analysis:**
1. Profile memory bandwidth: Run micro-benchmark of isolated multiply
2. Check for bank conflicts: Inspect access patterns in waveform
3. Verify prefetch timing: Ensure next-iteration data arrives before needed
4. Monitor bus contention: Check TileLink busy cycles

**Optimization:**
- Increase iteration count per RoCC call (amortizes dispatch overhead)
- Align tiles to bank boundaries to avoid conflicts
- Schedule Bebop operations when CPU cores are stalled

## Integration Examples

### Matrix Transpose

To compute transpose, reorganize tiles and use shuffle operations:

```
Input: A[4×4] (tiled)
Step 1: Load A[0][0..3], B = A^T (via VecComputeTop shuffle)
Step 2: Prefetch A[1][0..3]
Result: Transposed data in output buffer
```

### Reduction Operations

Sum reduction across 16-lane vector:

```
Input: vec[0..15]
Tree reduction:
  Level 1: vec[0]+vec[1], vec[2]+vec[3], ..., (8 results)
  Level 2: sum[0]+sum[1], sum[2]+sum[3], ..., (4 results)
  ...
  Final: Single accumulator containing sum of all 16 elements
```

## See Also

- [Bebop Spike-Verilator Cosimulation](Bebop%20Spike-Verilator%20Cosimulation.md)
- [Verilator Simulation and CI](../ToolChain%20Guide/Verilator%20Simulation%20and%20CI.md)
- [Execution Tracing and Performance Analysis](../ToolChain%20Guide/Execution%20Tracing%20and%20Performance%20Analysis.md)
- [GemminiBall Architecture](GemminiBall%20Architecture.md)
