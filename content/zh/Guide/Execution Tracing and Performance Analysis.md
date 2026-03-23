# 执行追踪和性能分析

## 概述

Buckyball 提供全面的执行追踪基础设施，用于调试、性能分析和设计验证。本指南涵盖追踪生成、追踪格式分析和常见分析工作流程。

## 追踪基础设施

### 追踪类型

Buckyball 在模拟期间生成多个追踪流，每个流捕获系统行为的特定方面：

| 追踪类型 | 内容 | 目的 |
|---------|------|------|
| **ITRACE** | 指令发放/完成事件，RoB 条目 | 调试指令序列，识别暂停 |
| **MTRACE** | 内存操作，load/store 模式，DMA | 缓存行为，内存瓶颈分析 |
| **PMCTRACE** | 性能计数器事件，缓存命中/缺失 | 系统级分析，吞吐量测量 |
| **CTRACE** | 提交和退役事件 | 程序正确性验证 |
| **BANKTRACE** | 库访问模式，计分板状态 | 寄存器压力分析，重命名效率 |

### 启用追踪

追踪通过模拟期间的 `bdb_trace_mask` 环境变量控制：

```bash
# 启用特定追踪
export BDB_TRACE_MASK=0x01  # 仅 ITRACE
export BDB_TRACE_MASK=0x03  # ITRACE + MTRACE
export BDB_TRACE_MASK=0x1F  # 所有追踪 (ITRACE|MTRACE|PMCTRACE|CTRACE|BANKTRACE)

bbdev verilator --run '--batch --binary <test-binary>' 2>&1 | tee sim.log
```

**比特编码：**
```
Bit 0: BDB_TR_ITRACE    (0x01)
Bit 1: BDB_TR_MTRACE    (0x02)
Bit 2: BDB_TR_PMCTRACE  (0x04)
Bit 3: BDB_TR_CTRACE    (0x08)
Bit 4: BDB_TR_BANKTRACE (0x10)
```

### 追踪输出

追踪以 NDJSON 格式（换行符分隔的 JSON）写入标准输出，每行表示单个事件：

```json
{"kind":"itrace_issue","clk":42,"rob_id":5,"domain_id":"ball","instr":"0x4002a8b"}
{"kind":"itrace_complete","clk":123,"rob_id":5,"domain_id":"ball"}
{"kind":"mtrace_load","clk":58,"addr":"0x80001234","size":8,"hart":0}
```

## NDJSON 追踪格式

### 记录类型

#### 指令追踪（ITRACE）

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

字段：
- `clk`: 事件发生时的 RTL 时钟周期
- `rob_id`: 重序缓冲条目 ID
- `domain_id`: 目标域（ball、mem、gp 等）
- `instr`: 指令编码
- `funct7`: Ball 操作的功能选择字段
- `pc`: 程序计数器

#### 内存追踪（MTRACE）

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

字段：
- `kind`: 操作类型（load、store、dma_read、dma_write）
- `clk`: 操作开始时的周期
- `addr`: 虚拟或物理地址
- `size`: 传输字节数
- `hart`: 核 ID
- `cached`: 缓存命中指示符
- `latency`: 操作持续周期数

#### 性能计数器追踪（PMCTRACE）

```json
{
  "kind": "pmctrace_cache",
  "clk": 100,
  "event": "miss",
  "cache_level": "l1",
  "hart": 0
}
```

#### 提交追踪（CTRACE）

```json
{
  "kind": "ctrace_commit",
  "clk": 200,
  "hart": 0,
  "pc": "0x80001a40",
  "instr": "0x002082b3"
}
```

## 追踪分析工具

### NDJSON 可视化脚本

`bdb_ndjson_viz.py` 脚本生成 RoB 活动的时间轴可视化：

```bash
python3 arch/scripts/bdb_ndjson_viz.py <trace-file>.ndjson \
  --output rob_timeline.png \
  --start-clk 0 \
  --end-clk 100000
```

输出：PNG 时间轴显示：
- RoB 条目生命周期（分配 → 发放 → 完成）
- 指令发放率
- 域利用率（Ball/Mem/GP）
- 暂停模式和空闲间隙

### 追踪注解

`bdb_ndjson_annotate.py` 脚本向追踪添加符号信息：

```bash
python3 arch/scripts/bdb_ndjson_annotate.py <trace-file>.ndjson \
  --isa arch/src/main/scala/framework \
  --output annotated_trace.ndjson
```

注解添加：
- 函数名（通过符号表）
- 指令助记符（通过 ISA 定义）
- 美化打印的操作数
- 调用/返回标记

### 手动追踪处理

用 Python 解析 NDJSON 追踪：

```python
import json
from pathlib import Path

records = []
with open('trace.ndjson') as f:
  for line in f:
    records.append(json.loads(line))

# 筛选指令完成
completions = [r for r in records if r['kind'] == 'itrace_complete']

# 测量各域平均延迟
domain_latencies = {}
for r in completions:
  domain = r['domain_id']
  latency = r['clk']  # 简化；实际延迟需要发放到完成映射
  if domain not in domain_latencies:
    domain_latencies[domain] = []
  domain_latencies[domain].append(latency)

for domain, lats in domain_latencies.items():
  print(f"{domain}: avg {sum(lats)/len(lats):.1f} cycles")
```

## 常见分析工作流程

### 识别性能瓶颈

**场景**：应用程序吞吐量低于预期。

1. **启用所有事件的追踪：**
   ```bash
   export BDB_TRACE_MASK=0x1F
   bbdev verilator --run '--batch --binary <test>' 2>&1 | tee trace.log
   ```

2. **可视化 RoB 时间轴：**
   ```bash
   python3 arch/scripts/bdb_ndjson_viz.py trace.ndjson --output timeline.png
   ```
   查找：
   - 大的空闲间隙（无活跃 RoB 条目）→ 暂停条件
   - 低 RoB 占用率 → 指令流暂停
   - 单一域利用率 → 其他域被阻塞

3. **分析域特定追踪：**
   ```bash
   grep '"domain_id":"ball"' trace.ndjson | wc -l  # Ball 域事件
   grep '"domain_id":"mem"' trace.ndjson | wc -l   # 内存域事件
   ```

4. **检查 fence/barrier 开销：**
   ```bash
   grep 'itrace_fence\|itrace_barrier' trace.ndjson
   ```

### 调试不正确的结果

**场景**：工作负载产生错误的输出。

1. **启用提交追踪：**
   ```bash
   export BDB_TRACE_MASK=0x08  # CTRACE
   bbdev verilator --run '--batch --binary <test>' > trace.log 2>&1
   ```

2. **交叉引用指令地址：**
   ```bash
   # 提取提交序列
   grep 'ctrace_commit' trace.log | head -50
   
   # 与预期程序流比较
   objdump -d <test-binary> | grep -A 5 <suspect-pc>
   ```

3. **检查可疑地址周围的内存追踪：**
   ```bash
   grep '0x<suspect-addr>' trace.log
   ```

### 分析内存访问模式

**场景**：优化内存子系统配置。

1. **捕获内存追踪：**
   ```bash
   export BDB_TRACE_MASK=0x02  # MTRACE
   bbdev verilator --run '--batch --binary <test>'
   ```

2. **聚合访问统计：**
   ```bash
   # 计数缓存命中 vs. 缺失
   grep '"cached":true' trace.ndjson | wc -l   # 命中
   grep '"cached":false' trace.ndjson | wc -l  # 缺失
   
   # 测量延迟分布
   python3 -c "
   import json
   with open('trace.ndjson') as f:
     lats = [int(json.loads(l)['latency']) for l in f if 'latency' in json.loads(l)]
   print(f'Min: {min(lats)}, Max: {max(lats)}, Avg: {sum(lats)/len(lats):.1f}')
   "
   ```

3. **识别热点：**
   ```bash
   # 最频繁访问的地址范围
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

### 寄存器压力分析

**场景**：优化虚拟库配置。

1. **捕获库追踪：**
   ```bash
   export BDB_TRACE_MASK=0x10  # BANKTRACE
   bbdev verilator --run '--batch --binary <test>'
   ```

2. **分析库利用率：**
   ```bash
   # 每个库的峰值同时写入
   grep 'banktrace_write' trace.ndjson | grep '"bank_id":0' | wc -l
   grep 'banktrace_write' trace.ndjson | grep '"bank_id":1' | wc -l
   ```

3. **测量重命名效率：**
   - 高别名重用 → 好的寄存器分配
   - 频繁库暂停 → 考虑增加虚拟库

## 追踪存储和管理

### 文件大小考量

追踪文件随模拟长度快速增长：
- **仅 ITRACE**: ~50-100 KB 每 1000 周期
- **所有追踪**: ~200-500 KB 每 1000 周期
- 大工作负载（>1M 周期）可能生成 100+ MB 追踪文件

### 选择性追踪

通过限制追踪持续时间减少存储：

```bash
# 仅追踪特定地址范围
BDB_TRACE_ADDR_START=0x80010000 BDB_TRACE_ADDR_END=0x80020000 bbdev verilator ...

# 仅追踪 N 个时钟周期从开始
BDB_TRACE_MAX_CYCLES=10000 bbdev verilator ...
```

### 压缩

压缩 NDJSON 用于存档：

```bash
gzip -9 trace.ndjson
```

从压缩文件重新分析：

```bash
zcat trace.ndjson.gz | python3 arch/scripts/bdb_ndjson_viz.py - --output timeline.png
```

## 追踪收集故障排除

### 无追踪输出

**问题**：模拟完成但未生成追踪文件。

**解决方案**：
- 验证 `BDB_TRACE_MASK` 已设置：`echo $BDB_TRACE_MASK`
- 检查模拟日志中的追踪配置消息：`grep -i trace sim.log`
- 确保追踪掩码非零：比特 0-4 编码追踪类型
- 确认追踪输出目录可写

### 不完整追踪

**问题**：追踪文件被截断或缺少事件。

**解决方案**：
- 增加日志缓冲区大小（如果适用）：`BDB_TRACE_BUFFER_SIZE=1000000`
- 更频繁刷新追踪：减少模拟步长
- 检查磁盘空间：大工作负载可能填满驱动器

### 高追踪开销

**问题**：启用追踪明显减慢模拟。

**解决方案**：
- 禁用未使用的追踪类型（减少 `BDB_TRACE_MASK`）
- 使用窗口：仅追踪感兴趣的区域
- 运行较短测试：用较少周期进行分析
- 在更快的机器上分析：Verilator 随 CPU 速度扩展

## 参见

- [开发工作流和构建系统](Development%20Workflow%20and%20Build%20System.md)
- [Verilator 模拟和 CI](Verilator%20Simulation%20and%20CI.md)
- [前端指令调度和库别名表](Frontend%20Instruction%20Scheduling%20and%20Bank%20Aliasing.md)
