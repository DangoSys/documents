# Frontend Instruction Scheduling and Bank Aliasing

## Overview

The Buckyball frontend implements advanced instruction scheduling through the GlobalScheduler component and optimizes register allocation through the Bank Alias Table (BAT). These mechanisms enable efficient multi-domain execution, reduce register pressure, and improve throughput for diverse workload types (Ball accelerator, GPU, and memory operations).

## GlobalScheduler Architecture

### Purpose

The GlobalScheduler manages instruction allocation and issue across multiple execution domains (Ball, GPU, Memory) and coordinates synchronization primitives (fence, barrier).

### Key Components

**GlobalROB (Global Reorder Buffer)**
- Tracks all in-flight instructions across domains
- Maintains program order for correctness
- Provides allocation and completion tracking
- Supports fence and barrier semantics for synchronization

**SubROB (Sub Reorder Buffer)**
- Per-Ball accelerator reorder buffer for sub-domain operations
- Manages instruction batches within Ball compute kernels
- Enables high-throughput Ball operation execution
- Arbitrated write port shared across all accelerators

### Instruction Flow

```
Decoder → GlobalScheduler:
  ├── Decode command validation
  ├── Fence/Barrier detection
  └── Domain routing

GlobalScheduler → GlobalROB/SubROB:
  ├── Allocate entry on valid decode
  ├── Track domain routing
  └── Manage issue port contention

Issue to Domains:
  ├── Ball issue → BuckyballAccelerator
  ├── Mem issue → MemDomain
  └── GP issue → GPDomain

Completion Feedback:
  ├── ball_complete_i → Update GlobalROB
  ├── mem_complete_i → Free resources
  └── gp_complete_i → Commit status
```

## Fence and Barrier Semantics

### Fence Instruction

A fence instruction stalls new instruction allocation until all in-flight instructions complete:

```
Fence timing:
  t0: Fence decoded, fenceActive ← true
  t1..tN: No new allocations (alloc.ready = false)
  tN+1: GlobalROB empty, fenceActive ← false
  tN+2: Next instruction can allocate
```

Use case: Ensure all prior operations commit before memory-mapped I/O or inter-tile communication.

### Barrier Instruction

A barrier instruction stalls new allocation and signals inter-domain synchronization:

```
Barrier timing:
  t0: Barrier decoded, barrierWaitROB ← true
  t1..tN: GlobalROB drains
  tN+1: barrierWaitROB ← false, barrierWaitRelease ← true
  tN+2: External barrier_release signal asserts
  tN+3: barrierWaitRelease ← false, barrier_arrive signal released
  tN+4: Next instruction can allocate
```

Use case: Multi-tile synchronization, SPMD workload coordination.

## Bank Alias Table (BAT)

### Purpose

The BAT performs virtual-to-physical register renaming at the frontend level, reducing register pressure and supporting high-performance execution. It maps virtual bank IDs to expanded alias namespace, enabling more flexible register allocation.

### ID Partition Scheme

```
Virtual Banks (Architected):
  [0, vbankUpper]: Named register banks (e.g., scalar, vector, MMIO)

Renamed Aliases:
  [vbankUpper + 1, maxBankId]: Dynamic aliases (one per ROB entry)

Example (8-entry ROB, 4 virtual banks):
  Virtual: bank 0,1,2,3
  Aliases: bank 4,5,6,7,8,9,10,11 (one per ROB slot)
```

### Rename Semantics

**Write Rename:**

When an instruction writes to a virtual bank, BAT allocates a fresh alias from the extra space:

```
Write to virtual_bank[i]:
  ├── Allocate extra_alias[rob_id] from pool
  ├── Update v2a[i] ← extra_alias[rob_id]
  └── Save old alias for later free
```

**Read Rename:**

Reads to the same virtual bank transparently follow the current alias:

```
Read virtual_bank[i]:
  └── Use current v2a[i] → physical ID
```

**Commit-Time Free:**

On ROB commit, old aliases are freed and returned to the free pool:

```
Commit instruction[rob_id]:
  ├── If entHasWrite[rob_id]:
  │   └── Free entOldAlias[rob_id]
  └── Clear aliasInUse[rob_id]
```

### Example Scenario

```
Program:
  add r1, r2, r3       # Write to bank 0
  load r1, [r4]        # Write to bank 0 (different instruction)
  mul r5, r1, r6       # Read bank 0

Timeline:
  t0: add allocates, bank 0 → alias 4
  t1: load allocates, bank 0 → alias 5 (new alias)
  t2: mul allocates, reads from v2a[0] = alias 5 (load's result)
  t3: add commits, alias 4 freed
  t4: load commits, alias 5 available for reuse
```

### Constraints and Configuration

- `bankIdLen`: Total bits for bank ID (typically 8-16)
- `vbankUpper`: Highest virtual bank ID (e.g., 3 for 4 virtual banks)
- `robEntries`: Number of ROB entries determines alias pool size
- Requirement: `aliasBase + robEntries - 1 ≤ (1 << bankIdLen) - 1`

## Domain-Specific Execution

### Ball Domain (Accelerator)

- Receives packed command with bank rename information
- SubROB tracks sub-operations within Ball kernel
- Bank info guides which register file banks to access
- Completion marks when Ball unit finishes kernel

### Memory Domain (MemDomain)

- Handles load/store and DMA operations
- Bank info used for result register allocation
- Completion feedback after memory operation commits

### GP Domain (General Purpose)

- Executes standard ALU and control operations
- Shares scheduler with Ball and Mem domains
- Non-blocking issue (fastest completion path)

## Performance Considerations

### Throughput Optimization

- **Multiple Issue Ports**: Three parallel issue paths (Ball, Mem, GP) avoid serialization bottleneck
- **SubROB Arbitration**: Prevents single Ball accelerator from blocking other domains
- **Renaming**: Eliminates false dependencies through virtual bank mapping

### Latency Paths

- **Fence**: Overhead is max(in-flight instruction latency) ≥ 1 cycle
- **Barrier**: Overhead is GlobalROB drain time + external signaling
- **Ball Issue**: 1 cycle (assuming unit available)

### Resource Limits

- GlobalROB depth (typically 32-64 entries): Maximum in-flight instructions
- SubROB depth (typically 16-32 per Ball): Maximum Ball kernel parallelism
- Alias pool size: Determines rename pressure; should match ROB depth

## Debugging and Analysis

### Execution Traces

Enable ITRACE to capture GlobalScheduler behavior:

```bash
bbdev verilator --run '--batch --binary <test> ...'
```

Trace records show:
- Allocation/issue/complete events per ROB entry
- Domain routing (Ball/Mem/GP)
- Fence/barrier state transitions
- Stall reasons (ROB full, domain not ready)

### Performance Profiling

Use PMCTRACE to measure:
- Issue rate per domain
- Stall frequency and cause
- Average ROB occupancy
- Rename efficiency (alias reuse ratio)

### Common Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| ROB full stalls | Too many long-latency ops | Reduce kernel size or increase ROB depth |
| Barrier timeout | Cores not reaching sync point | Verify all threads execute barrier code |
| Incorrect results after fence | Memory ordering violation | Check fence placement before MMIO |
| SubROB overflow | Ball kernel too deep | Split kernel into smaller batches |

## See Also

- [Goban Multi-Core Architecture](Goban%20Multi-Core%20Architecture.md)
- [GemminiBall Architecture](GemminiBall%20Architecture.md)
- [Development Workflow and Build System](Development%20Workflow%20and%20Build%20System.md)
