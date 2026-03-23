# Execution Tracing and Performance Analysis

## Overview

Buckyball provides comprehensive execution tracing infrastructure for debugging, performance analysis, and design verification. This guide covers trace generation, trace format analysis, and common profiling workflows.

## Trace Infrastructure

### Trace Types

Buckyball generates multiple trace streams during simulation, each capturing specific aspects of system behavior:

| Trace Type | Content | Purpose |
|-----------|---------|---------|
| **ITRACE** | Instruction issue/complete events, RoB entries | Debugging instruction sequencing, identifying stalls |
| **MTRACE** | Memory operations, load/store patterns, DMA | Cache behavior, memory bottleneck analysis |
| **PMCTRACE** | Performance counter events, cache hits/misses | System-level profiling, throughput measurement |
| **CTRACE** | Commit and retire events | Program correctness verification |
| **BANKTRACE** | Bank access patterns, scoreboard state | Register pressure analysis, rename efficiency |

### Enabling Traces

Traces are controlled via the `bdb_trace_mask` environment variable during simulation:

```bash
# Enable specific traces
export BDB_TRACE_MASK=0x01  # ITRACE only
export BDB_TRACE_MASK=0x03  # ITRACE + MTRACE
export BDB_TRACE_MASK=0x1F  # All traces (ITRACE|MTRACE|PMCTRACE|CTRACE|BANKTRACE)

bbdev verilator --run '--batch --binary <test-binary>' 2>&1 | tee sim.log
```

**Bit Encoding:**
```
Bit 0: BDB_TR_ITRACE    (0x01)
Bit 1: BDB_TR_MTRACE    (0x02)
Bit 2: BDB_TR_PMCTRACE  (0x04)
Bit 3: BDB_TR_CTRACE    (0x08)
Bit 4: BDB_TR_BANKTRACE (0x10)
```

### Trace Output

Traces are written to standard output in NDJSON format (newline-delimited JSON), with each line representing a single event:

```json
{"kind":"itrace_issue","clk":42,"rob_id":5,"domain_id":"ball","instr":"0x4002a8b"}
{"kind":"itrace_complete","clk":123,"rob_id":5,"domain_id":"ball"}
{"kind":"mtrace_load","clk":58,"addr":"0x80001234","size":8,"hart":0}
```

## NDJSON Trace Format

### Record Types

#### Instruction Trace (ITRACE)

```json
{
  "kind": "itrace_issue",
  "clk": 42,
  "rob_id": 5,
  "domain_id": "ball",
  "instr": "0x4002a8b",
  "funct7": 50,
  "pc": "0x800010a4"
}
```

Fields:
- `clk`: RTL clock cycle at event time
- `rob_id`: Reorder buffer entry ID
- `domain_id`: Target domain (ball, mem, gp, etc.)
- `instr`: Instruction encoding
- `funct7`: Function select field for Ball operations
- `pc`: Program counter

#### Memory Trace (MTRACE)

```json
{
  "kind": "mtrace_load",
  "clk": 58,
  "addr": "0x80001234",
  "size": 8,
  "hart": 0,
  "cached": true,
  "latency": 3
}
```

Fields:
- `kind`: Operation type (load, store, dma_read, dma_write)
- `clk`: Cycle when operation started
- `addr`: Virtual or physical address
- `size`: Bytes transferred
- `hart`: Core ID
- `cached`: Cache hit indicator
- `latency`: Operation duration in cycles

#### Performance Counter Trace (PMCTRACE)

```json
{
  "kind": "pmctrace_cache",
  "clk": 100,
  "event": "miss",
  "cache_level": "l1",
  "hart": 0
}
```

#### Commit Trace (CTRACE)

```json
{
  "kind": "ctrace_commit",
  "clk": 200,
  "hart": 0,
  "pc": "0x80001a40",
  "instr": "0x002082b3"
}
```

## Trace Analysis Tools

### NDJSON Visualization Script

The `bdb_ndjson_viz.py` script generates timeline visualization of RoB activity:

```bash
python3 arch/scripts/bdb_ndjson_viz.py <trace-file>.ndjson \
  --output rob_timeline.png \
  --start-clk 0 \
  --end-clk 100000
```

Output: PNG timeline showing:
- RoB entry lifetime (allocation → issue → complete)
- Instruction issue rate
- Domain utilization (Ball/Mem/GP)
- Stall patterns and idle gaps

### Trace Annotation

The `bdb_ndjson_annotate.py` script adds symbolic information to traces:

```bash
python3 arch/scripts/bdb_ndjson_annotate.py <trace-file>.ndjson \
  --isa arch/src/main/scala/framework \
  --output annotated_trace.ndjson
```

Annotation adds:
- Function names (via symbol table)
- Instruction mnemonics (via ISA definitions)
- Pretty-printed operands
- Call/return markers

### Manual Trace Processing

Parse NDJSON trace with Python:

```python
import json
from pathlib import Path

records = []
with open('trace.ndjson') as f:
  for line in f:
    records.append(json.loads(line))

# Filter instruction completions
completions = [r for r in records if r['kind'] == 'itrace_complete']

# Measure average latency per domain
domain_latencies = {}
for r in completions:
  domain = r['domain_id']
  latency = r['clk']  # Simplified; actual latency requires issue-to-complete mapping
  if domain not in domain_latencies:
    domain_latencies[domain] = []
  domain_latencies[domain].append(latency)

for domain, lats in domain_latencies.items():
  print(f"{domain}: avg {sum(lats)/len(lats):.1f} cycles")
```

## Common Profiling Workflows

### Identifying Performance Bottlenecks

**Scenario**: Application throughput is lower than expected.

1. **Capture traces with all events enabled:**
   ```bash
   export BDB_TRACE_MASK=0x1F
   bbdev verilator --run '--batch --binary <test>' 2>&1 | tee trace.log
   ```

2. **Visualize RoB timeline:**
   ```bash
   python3 arch/scripts/bdb_ndjson_viz.py trace.ndjson --output timeline.png
   ```
   Look for:
   - Large idle gaps (no active RoB entries) → stall condition
   - Low RoB occupancy → instruction stream stalls
   - Single-domain utilization → other domains blocked

3. **Analyze domain-specific traces:**
   ```bash
   grep '"domain_id":"ball"' trace.ndjson | wc -l  # Ball domain events
   grep '"domain_id":"mem"' trace.ndjson | wc -l   # Memory domain events
   ```

4. **Check for fence/barrier overhead:**
   ```bash
   grep 'itrace_fence\|itrace_barrier' trace.ndjson
   ```

### Debugging Incorrect Results

**Scenario**: Workload produces wrong output.

1. **Enable commit trace:**
   ```bash
   export BDB_TRACE_MASK=0x08  # CTRACE
   bbdev verilator --run '--batch --binary <test>' > trace.log 2>&1
   ```

2. **Cross-reference with instruction addresses:**
   ```bash
   # Extract commit sequence
   grep 'ctrace_commit' trace.log | head -50
   
   # Compare against expected program flow
   objdump -d <test-binary> | grep -A 5 <suspect-pc>
   ```

3. **Examine memory trace around suspicious address:**
   ```bash
   grep '0x<suspect-addr>' trace.log
   ```

### Analyzing Memory Access Patterns

**Scenario**: Optimize memory subsystem configuration.

1. **Capture memory trace:**
   ```bash
   export BDB_TRACE_MASK=0x02  # MTRACE
   bbdev verilator --run '--batch --binary <test>'
   ```

2. **Aggregate access statistics:**
   ```bash
   # Count cache hits vs. misses
   grep '"cached":true' trace.ndjson | wc -l   # Hits
   grep '"cached":false' trace.ndjson | wc -l  # Misses
   
   # Measure latency distribution
   python3 -c "
   import json
   with open('trace.ndjson') as f:
     lats = [int(json.loads(l)['latency']) for l in f if 'latency' in json.loads(l)]
   print(f'Min: {min(lats)}, Max: {max(lats)}, Avg: {sum(lats)/len(lats):.1f}')
   "
   ```

3. **Identify hotspots:**
   ```bash
   # Most frequently accessed address ranges
   grep 'mtrace_load\|mtrace_store' trace.ndjson | \
     python3 -c "
     import json, sys
     from collections import Counter
     addrs = Counter()
     for line in sys.stdin:
       r = json.loads(line)
       addrs[r['addr']] += 1
     for addr, cnt in addrs.most_common(10):
       print(f'{addr}: {cnt} accesses')
     "
   ```

### Register Pressure Analysis

**Scenario**: Optimize virtual bank configuration.

1. **Capture bank trace:**
   ```bash
   export BDB_TRACE_MASK=0x10  # BANKTRACE
   bbdev verilator --run '--batch --binary <test>'
   ```

2. **Analyze bank utilization:**
   ```bash
   # Peak simultaneous writes per bank
   grep 'banktrace_write' trace.ndjson | grep '"bank_id":0' | wc -l
   grep 'banktrace_write' trace.ndjson | grep '"bank_id":1' | wc -l
   ```

3. **Measure rename efficiency:**
   - High alias reuse → good register allocation
   - Frequent bank stalls → consider increasing virtual banks

## Trace Storage and Management

### File Size Considerations

Trace files grow rapidly with simulation length:
- **ITRACE only**: ~50-100 KB per 1000 cycles
- **All traces**: ~200-500 KB per 1000 cycles
- Large workloads (>1M cycles) may generate 100+ MB trace files

### Selective Tracing

Reduce storage by limiting trace duration:

```bash
# Trace only specific address range
BDB_TRACE_ADDR_START=0x80010000 BDB_TRACE_ADDR_END=0x80020000 bbdev verilator ...

# Trace only N clock cycles from start
BDB_TRACE_MAX_CYCLES=10000 bbdev verilator ...
```

### Compression

Compress NDJSON for archival:

```bash
gzip -9 trace.ndjson
```

Re-analyze from compressed file:

```bash
zcat trace.ndjson.gz | python3 arch/scripts/bdb_ndjson_viz.py - --output timeline.png
```

## Troubleshooting Trace Collection

### No Trace Output

**Problem**: Simulation completes but no trace file generated.

**Solutions**:
- Verify `BDB_TRACE_MASK` is set: `echo $BDB_TRACE_MASK`
- Check simulation log for trace configuration message: `grep -i trace sim.log`
- Ensure trace mask is non-zero: bits 0-4 encode trace types
- Confirm trace output directory is writable

### Incomplete Traces

**Problem**: Trace file is truncated or missing events.

**Solutions**:
- Increase log buffer size (if applicable): `BDB_TRACE_BUFFER_SIZE=1000000`
- Flush traces more frequently: Reduce simulation step size
- Check disk space: Large workloads may fill drive

### High Trace Overhead

**Problem**: Enabling traces significantly slows simulation.

**Solutions**:
- Disable unused trace types (reduce `BDB_TRACE_MASK`)
- Use windowing: Trace only region of interest
- Run shorter test: Simulate fewer cycles for profiling
- Profile on faster machine: Verilator scales with CPU speed

## See Also

- [Development Workflow and Build System](Development%20Workflow%20and%20Build%20System.md)
- [Verilator Simulation and CI](Verilator%20Simulation%20and%20CI.md)
- [Frontend Instruction Scheduling and Bank Aliasing](Frontend%20Instruction%20Scheduling%20and%20Bank%20Aliasing.md)
