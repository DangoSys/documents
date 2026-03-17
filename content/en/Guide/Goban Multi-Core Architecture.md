# Goban Multi-Core Architecture

## Overview

Goban is a multi-core BBTile configuration in Buckyball that enables parallel execution of SPMD (Single Program Multiple Data) workloads. Each BBTile contains multiple Rocket cores, where each core is paired with its own BuckyballAccelerator. All accelerators within a tile share a single SharedMemBackend and BarrierUnit for synchronization.

## Architecture Overview

### Tile Structure

```
┌─────────────────────────────────────┐
│         BBTile (Goban)              │
├─────────────────────────────────────┤
│ Core 0   │ Core 1   │ ...│ Core N-1 │
│ Rocket + │ Rocket + │    │ Rocket + │
│ Accel    │ Accel    │    │ Accel    │
├──────────┴──────────┴────┴──────────┤
│    SharedMemBackend + BarrierUnit   │
└─────────────────────────────────────┘
```

### Configuration Variants

**BuckyballGobanConfig**
- 1 BBTile × 4 cores
- 4 Rocket cores + 4 BuckyballAccelerators
- Single SharedMem + BarrierUnit

**BuckyballGoban2TileConfig**
- 2 BBTiles × 4 cores = 8 total cores
- 8 Rocket cores + 8 BuckyballAccelerators
- Per-tile SharedMem + BarrierUnit

## Core Components

### Multi-Core Execution

Each core executes the same program independently with access to:
- Local register file
- Private instruction cache
- Paired BuckyballAccelerator for hardware operations
- Shared memory for inter-core communication
- Hart ID (hardware thread ID) via CSR `mhartid`

### Barrier Unit

The BarrierUnit provides hardware-level synchronization via the `bb_barrier()` intrinsic:

- Stalls all cores in the tile until all reach the barrier
- Single-cycle synchronization overhead
- Supports multiple sequential barriers in same program
- Essential for SPMD algorithm coordination

### Shared Memory Backend

SharedMemBackend manages memory operations across all cores in the tile:

- Arbitrates memory requests from multiple cores
- Maintains coherency for shared data structures
- Handles memory-mapped I/O (MMIO) for inter-tile communication
- Supports atomic operations for synchronization primitives

## Programming Model

### SPMD Execution Pattern

```c
#include "goban.h"

int main(void) {
  int cid = bb_get_core_id();  // Get hart ID [0, nCores-1]
  
  // Phase 1: Per-core computation
  int local_result = compute(cid, input_data);
  
  // Phase 2: Synchronization
  bb_barrier();
  
  // Phase 3: Shared result processing
  if (cid == 0) {
    process_all_results(local_result);
  }
  
  bb_barrier();  // Ensure all cores reach exit
  
  return 0;
}
```

### Core Identification

```c
static inline int bb_get_core_id(void) {
  int hartid;
  asm volatile("csrr %0, mhartid" : "=r"(hartid));
  return hartid;
}
```

Returns hart ID in range `[0, nCores-1]`. In Goban configurations, this maps directly to core index within the tile.

## Test Workloads

### barrier_test.c

Smoke test for multi-core barrier synchronization:

1. Each core sets `arrived[cid] = 1`
2. All cores execute `bb_barrier()`
3. Each core verifies all `arrived[]` flags are set
4. Repeat with `bb_barrier()` a second time
5. Core 0 prints final result

Correctness check: simulation must not hang and all cores must reach completion.

### barrier_mvin_test.c

Combines barrier synchronization with accelerator operations (mvins):

- Tests that memory barrier coordination works with hardware acceleration
- Verifies data coherency across cores
- Validates BarrierUnit blocking during in-flight accelerator operations

## Integration with Buckyball

### System Bus

Goban uses a 128-bit system bus (vs. toy's narrower bus) to accommodate higher memory bandwidth requirements for multi-core workloads.

### Configuration in build.sc

Goban is defined as a configuration target in `arch/src/main/scala/examples/goban/CustomConfigs.scala`:

```scala
object GobanConfig {
  val nCores: Int = 4
  
  def apply(): GlobalConfig = {
    val base = GlobalConfig()
    base.copy(top = base.top.copy(nCores = nCores))
  }
}

class BuckyballGobanConfig
  extends Config(
    new WithNBBTiles(1, buckyballConfig = GobanConfig()) ++
      new chipyard.config.WithSystemBusWidth(128) ++
      new chipyard.config.AbstractConfig
  )
```

### Running Goban Workloads

```bash
# Simulate with Goban config (1 tile, 4 cores)
bbdev verilator --run \
  '--binary barrier_test-baremetal \
    --config sims.verilator.BuckyballGobanVerilatorConfig \
    --batch'

# Simulate with Goban2Tile config (2 tiles, 8 cores)
bbdev verilator --run \
  '--binary barrier_test-baremetal \
    --config sims.verilator.BuckyballGoban2TileVerilatorConfig \
    --batch'
```

## Design Considerations

### Scalability

Goban supports configurations with 1 or more BBTiles:
- Each tile operates independently
- Tiles can be scaled by instantiating multiple `WithNBBTiles` configurations
- Memory bandwidth grows with system bus width

### Synchronization Overhead

BarrierUnit provides hardware acceleration for barrier operations:
- No busy-waiting required
- Single-cycle barrier (after all cores arrive)
- Efficient for bulk synchronization at algorithm phase boundaries

### Data Layout

For optimal performance with multi-core memory access:
- Use bank-striped layouts to distribute load
- Align data structures to cache line boundaries
- Avoid false sharing in shared arrays

## Performance Profiling

Use instruction tracing and bank enable signals (from GemminiBall tracing enhancements) to profile:

- Per-core instruction flow
- Memory access patterns across cores
- Barrier stall time
- Accelerator utilization per core

## Troubleshooting

### Simulation Hangs at Barrier

- Check that all cores reach the barrier with correct hart IDs
- Verify `nCores` matches barrier array size in test program
- Ensure BarrierUnit is not deadlocked on memory operations

### Inconsistent Shared Data

- Add volatile keyword to shared variables
- Insert barriers before and after shared memory access
- Check for cache coherency issues (review memory backend logs)

### Performance Issues

- Profile barrier stall time with waveform traces
- Verify load balance across cores (use trace data)
- Consider increasing system bus width for memory-bound workloads

## See Also

- [Development Workflow and Build System](Development%20Workflow%20and%20Build%20System.md) — Building and simulating Goban configs
- [Buckyball ISA Documentation](../Overview/Buckyball%20ISA.md) — RISC-V + Blink ISA details
- [GemminiBall Architecture](GemminiBall%20Architecture.md) — Accelerator operations in Goban
