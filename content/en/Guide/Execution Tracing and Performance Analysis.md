# Execution Tracing and Performance Analysis

## Overview

Buckyball provides comprehensive execution tracing infrastructure for debugging, performance analysis, and design verification. This guide covers trace generation, trace format analysis, and common profiling workflows.

## Trace Infrastructure

### Trace Types

Buckyball generates multiple trace streams during simulation, each capturing specific aspects of system behavior. The **ITRACE** stream captures instruction issue and complete events along with RoB entry identifiers, making it ideal for debugging instruction sequencing and identifying stalls. The **MTRACE** stream records memory operations, load/store patterns, and DMA activity for analyzing cache behavior and memory bottlenecks. The **PMCTRACE** stream emits performance counter events including cache hits and misses, enabling system-level profiling and throughput measurement. The **CTRACE** stream logs commit and retire events for verifying program correctness. The **BANKTRACE** stream monitors bank access patterns and scoreboard state, useful for register pressure analysis and rename efficiency assessment.

### Enabling Traces

Traces are controlled via the `bdb_trace_mask` environment variable during simulation. Each bit in the mask enables a specific trace type: bit 0 enables ITRACE (0x01), bit 1 enables MTRACE (0x02), bit 2 enables PMCTRACE (0x04), bit 3 enables CTRACE (0x08), and bit 4 enables BANKTRACE (0x10). Common configurations include 0x01 for instruction debugging only, 0x03 for instruction and memory analysis, and 0x1F to enable all trace types simultaneously. Traces are written to standard output in NDJSON format, where each line represents a single event.

## NDJSON Trace Format

### Record Types

#### Instruction Trace (ITRACE)

Instruction trace records capture the lifecycle of instructions through the issue pipeline. Each record includes a clock cycle timestamp, the RoB entry ID, the target execution domain (ball, mem, gp, etc.), the instruction encoding, the function select field (funct7) for Ball operations, and the program counter. These fields allow correlating high-level program behavior with low-level hardware events.

#### Memory Trace (MTRACE)

Memory trace records document load, store, and DMA operations. Each record specifies the operation type (load, store, dma_read, or dma_write), the clock cycle when the operation started, the virtual or physical address, the number of bytes transferred, the hart (core) ID, whether the access hit in cache, and the operation duration in cycles. Analyzing these records reveals access patterns, cache efficiency, and identifies memory subsystem bottlenecks.

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

The `bdb_ndjson_viz.py` script generates a timeline visualization of RoB activity from trace files. It shows the lifetime of each RoB entry (allocation, issue, and completion), instruction issue rates over time, domain utilization (how much Ball, Memory, and GP bandwidth is used), and stall patterns that reveal when no instructions are active. The output is a PNG timeline image that makes it easy to spot performance issues visually.

### Trace Annotation

The `bdb_ndjson_annotate.py` script enriches traces with symbolic information by cross-referencing instruction encodings against the ISA definitions and symbol tables. It adds function names (via symbol table lookup), instruction mnemonics (decoded from ISA definitions), pretty-printed operands, and call/return markers. Annotated traces are much more readable and make it easier to correlate high-level program behavior with low-level execution patterns.

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

When application throughput is lower than expected, a systematic trace-based analysis can pinpoint the root cause. Start by enabling all trace types (BDB_TRACE_MASK=0x1F) and running the workload. The visualization script will show large idle gaps (periods with no active RoB entries) indicating stall conditions, or consistently low RoB occupancy indicating that the instruction stream itself is the bottleneck. Domain-specific analysis using grep on the trace file reveals whether Ball, Memory, or GP domains are saturated. Checking for fence and barrier events shows whether synchronization overhead is significant. This methodical approach quickly narrows down whether the issue is instruction fetch, a particular execution domain, memory subsystem, or synchronization.

### Debugging Incorrect Results

When a workload produces wrong output, enable commit traces (BDB_TRACE_MASK=0x08) to log the sequence of committed instructions. Extract the commit sequence and compare the program counter values against the expected program flow using objdump. If a specific instruction or address range appears suspicious, examine the memory traces around that address to see if unexpected memory operations occurred. Cross-referencing instruction traces with commit traces reveals whether an instruction was issued but never committed, which often indicates a missing synchronization primitive or incorrect barrier/fence placement.

### Analyzing Memory Access Patterns

Optimizing the memory subsystem begins by capturing memory traces (BDB_TRACE_MASK=0x02) for a representative workload. Aggregate access statistics by counting cache hits versus misses and measuring latency distribution to determine overall cache effectiveness. Identify memory hotspots by finding the most frequently accessed address ranges, which often reveal opportunities for better data layout or prefetching. High-latency accesses combined with miss events suggest memory subsystem congestion or poor cache utilization, which may warrant increasing cache capacity or adjusting associativity.

### Register Pressure Analysis

Register pressure can be optimized by first capturing bank traces (BDB_TRACE_MASK=0x10) and then analyzing bank utilization patterns. Count simultaneous writes per bank to determine whether any single bank is a bottleneck. Measure rename efficiency by checking the ratio of alias reuse to fresh allocations. High alias reuse indicates effective register allocation, while frequent bank stalls suggest that the virtual bank configuration may be insufficient for the workload, in which case increasing the number of virtual banks may improve performance.

## Trace Storage and Management

### File Size Considerations

Trace files grow rapidly with simulation length and trace types enabled. ITRACE alone generates approximately 50-100 KB per 1000 cycles, while enabling all trace types can produce 200-500 KB per 1000 cycles. Large workloads exceeding 1 million cycles may generate 100+ MB trace files, which can consume significant disk space and become unwieldy for analysis. Planning trace duration and selecting only necessary trace types helps manage storage requirements.

### Selective Tracing

Reduce storage requirements and overhead by limiting trace duration using environment variables. The BDB_TRACE_ADDR_START and BDB_TRACE_ADDR_END variables restrict tracing to a specific address range, useful when focusing on a particular data structure or memory region. The BDB_TRACE_MAX_CYCLES variable limits tracing to a fixed number of clock cycles from the start of simulation, helping isolate early-stage behavior or steady-state performance characteristics without tracing the entire execution.

### Compression

NDJSON trace files can be compressed using gzip to significantly reduce archival storage. Compressed traces preserve full information while typically achieving 5-10x compression ratios. Analysis tools can read compressed traces directly via standard Unix pipes, so re-compression is not necessary before processing.

## Troubleshooting Trace Collection

### No Trace Output

If simulation completes but no trace file is generated, first verify that BDB_TRACE_MASK is set to a non-zero value (echo $BDB_TRACE_MASK). Check the simulation log for trace configuration messages by grepping for "trace" keywords. Confirm that the trace mask has at least one of bits 0-4 set, as each bit enables a specific trace type. Finally, ensure that the directory where traces will be written is writable and has sufficient free space.

### Incomplete Traces

If trace files are truncated or missing events, increase the log buffer size (BDB_TRACE_BUFFER_SIZE=1000000) to allow the simulation to queue more events before flushing. Reducing the simulation step size causes traces to flush more frequently, which can help prevent loss during long-running tests. Check available disk space, as large workloads may fill the drive and truncate output. If all else fails, run a shorter test with fewer simulation cycles to establish a baseline.

### High Trace Overhead

Enabling traces increases simulation runtime due to the cost of generating and writing events. To minimize overhead, disable unused trace types by reducing BDB_TRACE_MASK to only the types needed for analysis. Use windowing (BDB_TRACE_ADDR_START/END or BDB_TRACE_MAX_CYCLES) to trace only the region of interest rather than the entire execution. Run shorter tests with fewer simulation cycles for profiling, and consider running analysis on a faster machine since Verilator throughput scales with CPU speed.

## See Also

- [Development Workflow and Build System](Development%20Workflow%20and%20Build%20System.md)
- [Verilator Simulation and CI](Verilator%20Simulation%20and%20CI.md)
- [Frontend Instruction Scheduling and Bank Aliasing](Frontend%20Instruction%20Scheduling%20and%20Bank%20Aliasing.md)
