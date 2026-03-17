# Goban Multi-Core Configuration

## Overview

**Goban** is Buckyball's multi-core configuration that enables shared-memory parallelism across multiple Rocket CPU cores within a BBTile. All cores can access the same Ball operators, SRAM banks, and synchronization mechanisms.

## Architecture

### Core Structure

Each Goban BBTile contains:
- **N CPU Cores**: Rocket RV64 cores (default: 4)
- **N BuckyballAccelerators**: One per core, with independent execution pipelines
- **Shared Components**:
  - Unified instruction decoder and Ball router
  - Shared SRAM banks and memory backend
  - BarrierUnit for multi-core synchronization
  - Global Reservation Station for Ball scheduling

```
┌─────────────────────────────────────────┐
│           Goban BBTile (4-core)         │
├─────────────────────────────────────────┤
│ Rocket Core 0   Rocket Core 1   ...     │
│       │              │                  │
│  Acc 0      Acc 1       ...            │
├─────────────────────────────────────────┤
│ Shared Frontend Decoder & Ball Router   │
├─────────────────────────────────────────┤
│   8 SRAM Banks (shared across cores)    │
│       BarrierUnit  | Global RS          │
└─────────────────────────────────────────┘
```

### Key Properties

| Property | Value |
|----------|-------|
| Cores per tile | 1 (default toy) or 4 (Goban) |
| Ball operators per core | Independent issue to shared operators |
| SRAM banks | Shared, arbitrated by memory backend |
| Memory consistency | Weak ordering (fences required) |
| Synchronization primitives | Barrier unit, atomic ops via memory |

## Configurations

### Single-Tile (4 cores)

```scala
class BuckyballGobanConfig extends Config(
  new WithNBBTiles(1, buckyballConfig = GobanConfig()) ++
    new chipyard.config.WithSystemBusWidth(128) ++
    new chipyard.config.AbstractConfig
)
```

- 1 BBTile
- 4 cores total (4 Rocket + 4 accelerators)
- Shared SRAM and memory system

**Usage:**

```bash
bbdev verilator --verilog '--config sims.verilator.BuckyballGobanConfig'
```

### Dual-Tile (8 cores)

```scala
class BuckyballGoban2TileConfig extends Config(
  new WithNBBTiles(2, buckyballConfig = GobanConfig()) ++
    new chipyard.config.WithSystemBusWidth(128) ++
    new chipyard.config.AbstractConfig
)
```

- 2 independent BBTiles
- 8 cores total (8 Rocket + 8 accelerators)
- Each tile has its own SRAM and memory backend (no inter-tile access)

**Usage:**

```bash
bbdev verilator --verilog '--config sims.verilator.BuckyballGoban2TileConfig'
```

## Synchronization Primitives

### BarrierUnit

Provides hardware barrier synchronization for multi-core workloads.

**Usage:**

```c
#include <bbhw/isa/isa.h>

void bb_barrier(uint32_t core_mask);  // Wait for cores in mask
```

**Parameters:**
- `core_mask`: Bitmask of cores to synchronize (bit N = core N)

**Example: 4-core barrier**

```c
// All 4 cores call barrier with same mask
bb_barrier(0x0F);  // Wait for cores 0, 1, 2, 3

// Execution resumes when all cores reach barrier
```

### SRAM Bank Arbitration

When multiple cores access the same SRAM bank, hardware arbitration resolves conflicts.

**Guarantees:**
- One access per bank per cycle
- Fair round-robin arbitration between cores
- No data corruption (hardware enforces mutual exclusion)

**Best practice:** Partition data to minimize bank conflicts:

```c
// Thread 0 accesses bank 0
// Thread 1 accesses bank 1
// etc.
```

## Programming Model

### Memory Consistency

Goban uses **weak memory ordering**. Synchronization requires explicit fences:

```c
// Core 0: produce data
for (int i = 0; i < N; i++) {
  data[i] = compute();
}
bb_fence();  // Make writes visible to other cores

// Core 1: consume data
bb_fence();  // Ensure all prior loads complete
for (int i = 0; i < N; i++) {
  result[i] = data[i];
}
```

### Work Distribution

Typical multi-core workflow:

```c
int core_id = __builtin_riscv_read_csr(CSR_HARTID);

if (core_id == 0) {
  // Master: initialize and coordinate
  bb_alloc(0, 4, 256);  // Allocate 256 rows in 4 banks
  bb_barrier(0x0F);     // Signal slaves ready
}

// Each core processes its partition
uint32_t start = (core_id * 256) / 4;
uint32_t rows = 256 / 4;
bb_im2col(start, start + rows, rows);
bb_fence();

bb_barrier(0x0F);  // Wait for all cores
```

### Cache Coherence

Rocket cores include private L1 instruction caches but share an L2 data cache. When one core modifies SRAM via Ball:

1. Ball writes to shared SRAM bank
2. L2 cache invalidates relevant lines (automatic)
3. Other cores refetch updated data on next access

**Note:** Ball operations bypass Rocket's L1/L2 caches and access SRAM directly.

## Testing Multi-Core Workloads

### Compilation

Multi-core binaries use standard compilation:

```bash
# Same as single-core
riscv64-unknown-elf-gcc -o multicore_test multicore_test.c libbbhw.a
```

### Simulation

```bash
# Generate Verilog for Goban
bbdev verilator --verilog '--config sims.verilator.BuckyballGobanConfig'

# Run simulation
bbdev verilator --run '--jobs 16 --binary multicore_test \
  --config sims.verilator.BuckyballGobanConfig --batch'
```

### Debugging Multi-Core Execution

When debugging multi-core code:

1. **Check hartid**: Each core reports its HARTID (0-3 for single tile)
   
   ```bash
   grep "HARTID" arch/log/*/disasm.log
   ```

2. **Trace per-core execution**: Use separate trace files per hartid if available

3. **Identify synchronization bugs**: Look for:
   - One core stuck at barrier while others proceed
   - SRAM bank conflicts causing data corruption
   - Missing fence() causing stale data reads

4. **Inspect waveform**: Goban signals include:
   - Per-core Ball valid/ready signals
   - Bank arbitration priority signals
   - Barrier synchronization state

## Performance Considerations

### Speedup vs. Overhead

Multi-core parallelism introduces overhead:
- **Bank arbitration latency**: ~1-2 cycles per contention
- **Synchronization cost**: Barrier ~5-10 cycles per core
- **L2 cache invalidation**: ~3-5 cycles per line

**Optimal:** Data partitioning to minimize conflicts.

### Scaling Guidelines

| Workload Type | Cores | Expected Speedup |
|---------------|-------|------------------|
| Embarrassingly parallel (no sharing) | 4 | ~3.5x |
| Data-parallel (some bank conflicts) | 4 | ~2-3x |
| Synchronized fine-grained tasks | 4 | ~1.5-2x |

Higher speedup requires careful data layout and workload balancing.

## ISA Extensions for Multi-Core

### Hart ID (core identifier)

```c
uint32_t hart_id = read_csr(0xF14);  // CSR_HARTID
```

**Values for Goban:**
- Single-tile: 0-3 (4 cores)
- Dual-tile: Tile 0: 0-3, Tile 1: 4-7

### Barrier Instruction

Already described above; added as a Ball instruction (funct7 = 50, 0x32).

## Known Limitations

1. **No inter-tile communication**: Dual-tile Goban has independent memory systems
2. **Limited synchronization**: Only barrier; no wait-free algorithms on Ball
3. **Bank arbitration fairness**: Round-robin but not guaranteed latency bounds
4. **No virtual memory**: All cores share linear physical memory (no MMU)

## Example: Parallel Matrix Transpose

```c
#include <bbhw/isa/isa.h>
#include <stdint.h>

#define MATRIX_SIZE 256
#define CORES 4

int main() {
  uint32_t core = read_csr(0xF14);  // Hart ID
  
  // Master: initialize
  if (core == 0) {
    bb_alloc(0, 2, MATRIX_SIZE);  // 2 banks for A, result
    bb_mvin_dram(0, 0, MATRIX_SIZE, DRAM_A);
    bb_fence();
  }
  bb_barrier(0x0F);
  
  // Parallel transpose: each core does chunk
  uint32_t chunk = MATRIX_SIZE / CORES;
  uint32_t start_row = core * chunk;
  
  bb_transpose(0, 1, start_row, chunk);
  bb_fence();
  
  bb_barrier(0x0F);
  
  // Master: writeback
  if (core == 0) {
    bb_mvout_dram(1, 0, MATRIX_SIZE, DRAM_RESULT);
  }
  
  return 0;
}
```

## Related Documentation

- [Simulation and Debugging](../Architecture/Simulation%20and%20Debugging.md)
- [Building Your Own Hardware Designs](../Tutorial/Building%20Your%20Own%20Hardware%20Designs.md)
- BarrierUnit RTL: `arch/src/main/scala/framework/core/bbtile/BarrierUnit.scala`
- GlobalRS (Ball scheduler): `arch/src/main/scala/framework/frontend/globalrs/`
