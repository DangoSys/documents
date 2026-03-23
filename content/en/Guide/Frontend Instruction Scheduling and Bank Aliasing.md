# Frontend Instruction Scheduling and Bank Aliasing

## Overview

The Buckyball frontend implements advanced instruction scheduling through the GlobalScheduler component and optimizes register allocation through the Bank Alias Table (BAT). These mechanisms enable efficient multi-domain execution, reduce register pressure, and improve throughput for diverse workload types (Ball accelerator, GPU, and memory operations).

## GlobalScheduler Architecture

### Purpose

The GlobalScheduler manages instruction allocation and issue across multiple execution domains (Ball, GPU, Memory) and coordinates synchronization primitives (fence, barrier).

### Key Components

The **GlobalROB (Global Reorder Buffer)** tracks all in-flight instructions across multiple execution domains, maintaining program order to ensure correctness. It provides allocation and completion tracking for every instruction, and supports the semantics of fence and barrier instructions for inter-domain synchronization. The GlobalROB is central to the GlobalScheduler's ability to coordinate execution across Ball accelerators, memory operations, and general-purpose units.

The **SubROB (Sub Reorder Buffer)** is dedicated to each Ball accelerator and manages instruction batches within Ball compute kernels. It enables high-throughput Ball operation execution by handling sub-operations within a kernel, and uses an arbitrated write port shared across all accelerators to manage contention. This separation of concerns allows Ball kernels to run at high performance without blocking other execution domains.

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

The **Ball Domain (Accelerator)** receives commands from the GlobalScheduler with embedded bank rename information, allowing efficient register allocation. The SubROB tracks sub-operations within Ball kernels and uses bank information to guide which register file banks to access. When the Ball unit completes executing a kernel, it signals completion, which updates the GlobalROB and releases associated resources.

The **Memory Domain (MemDomain)** handles all load, store, and DMA operations issued by the GlobalScheduler. Bank information is used to determine which physical register banks will receive the results, and completion feedback is sent after the memory operation commits. This integration with the rename logic ensures that memory results flow correctly into the renamed register namespace.

The **GP Domain (General Purpose)** executes standard ALU and control-flow operations. It shares the scheduler infrastructure with Ball and Memory domains, allowing seamless interleaving of different instruction types. Instructions issued to GP have the fastest completion path, returning results with minimal latency to the GlobalROB. This non-blocking issue model prevents one type of operation from serializing the entire pipeline.

## Performance Considerations

### Throughput Optimization

Multiple issue ports provide three parallel paths for Ball, Memory, and GP instructions, avoiding serialization bottlenecks that would otherwise reduce instruction-per-cycle throughput. The SubROB arbitration mechanism prevents a single Ball accelerator from blocking other execution domains, ensuring that long-running kernels do not starve the memory or general-purpose units. Virtual bank mapping through the BAT eliminates false dependencies by allowing multiple instructions to write to the same virtual bank at different times without causing serialization.

### Latency Paths

Fence instructions introduce overhead equal to the maximum latency of in-flight instructions, which is at least one cycle in practice. Barrier instructions incur higher overhead: the GlobalROB must drain completely, then the external barrier signal must be negotiated with other tiles, and finally the next instruction can allocate. The fastest path is Ball issue, which completes in one cycle when the Ball unit is available and not blocked by resource contention.

### Resource Limits

The GlobalROB depth (typically 32-64 entries) sets an upper bound on the number of in-flight instructions across all domains, preventing unbounded growth of instruction state. SubROB depth (typically 16-32 entries per Ball accelerator) limits the parallelism within a single Ball kernel. The alias pool size, determined by the extra bank IDs beyond the virtual banks, must be sized to match or exceed the ROB depth to prevent rename stalls. Careful provisioning of these resources is critical for balancing performance and silicon area.

## Debugging and Analysis

### Execution Traces

Enable ITRACE to capture GlobalScheduler behavior, which produces trace records showing allocation, issue, and complete events for each ROB entry. The traces reveal the domain routing decisions (which execution unit received the instruction), fence and barrier state transitions, and stall reasons (such as ROB overflow or a domain not being ready to accept an instruction). Combined with timestamps, these traces enable detailed timeline analysis of instruction flow through the scheduler.

### Performance Profiling

Use PMCTRACE to measure issue rates per domain, stall frequency and cause, average ROB occupancy, and rename efficiency (the ratio of alias reuse to fresh allocations). These metrics help identify whether the scheduler is the bottleneck or if a particular execution domain is saturated. High stall frequency in one domain suggests it should be accelerated, while low ROB occupancy suggests the instruction stream itself is the bottleneck.

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
