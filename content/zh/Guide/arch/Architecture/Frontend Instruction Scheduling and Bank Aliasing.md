# 前端指令调度和库别名表

## 概述

Buckyball 前端通过 GlobalScheduler 组件实现先进的指令调度，并通过库别名表（BAT）优化寄存器分配。这些机制支持高效的多域执行（Ball 加速器、GPU、内存操作），减少寄存器压力，提高多种工作负载的吞吐量。

## GlobalScheduler 架构

### 目的

GlobalScheduler 管理跨多个执行域（Ball、GPU、内存）的指令分配和发放，并协调同步原语（fence、barrier）。

### 核心组件

**GlobalROB（全局重序缓冲）** 跟踪跨越多个执行域的所有在途指令，并维持程序顺序以保证正确性。它为每条指令提供分配和完成跟踪，并支持 fence 和 barrier 指令的同步语义。GlobalROB 是 GlobalScheduler 能够协调 Ball 加速器、内存操作和通用计算单元之间执行的核心。

**SubROB（子重序缓冲）** 专属于每个 Ball 加速器，管理 Ball 计算核内的指令批次。它通过处理核内的子操作来支持高吞吐量的 Ball 操作执行，并使用跨所有加速器共享的仲裁写端口来管理竞争。这种关注点的分离使得 Ball 核可以高性能运行，而不阻塞其他执行域。

### 指令流

```
译码器 → GlobalScheduler:
  ├── 指令有效性验证
  ├── Fence/Barrier 检测
  └── 域路由

GlobalScheduler → GlobalROB/SubROB:
  ├── 有效译码时分配条目
  ├── 跟踪域路由
  └── 管理发放端口竞争

发放到各域:
  ├── Ball 发放 → BuckyballAccelerator
  ├── Mem 发放 → MemDomain
  └── GP 发放 → GPDomain

完成反馈:
  ├── ball_complete_i → 更新 GlobalROB
  ├── mem_complete_i → 释放资源
  └── gp_complete_i → 提交状态
```

## Fence 和 Barrier 语义

### Fence 指令

Fence 指令会暂停新指令分配，直到所有在途指令完成：

```
Fence 时序:
  t0: Fence 被译码，fenceActive ← true
  t1..tN: 禁止新分配（alloc.ready = false）
  tN+1: GlobalROB 为空，fenceActive ← false
  tN+2: 下一条指令可分配
```

用途：确保所有先前操作提交后再进行内存映射 I/O 或跨瓦片通信。

### Barrier 指令

Barrier 指令暂停新分配并发送跨域同步信号：

```
Barrier 时序:
  t0: Barrier 被译码，barrierWaitROB ← true
  t1..tN: GlobalROB 排空
  tN+1: barrierWaitROB ← false, barrierWaitRelease ← true
  tN+2: 外部 barrier_release 信号断言
  tN+3: barrierWaitRelease ← false, barrier_arrive 信号释放
  tN+4: 下一条指令可分配
```

用途：多瓦片同步，SPMD 工作负载协调。

## 库别名表（BAT）

### 目的

BAT 在前端进行虚拟到物理寄存器重命名，减少寄存器压力并支持高性能执行。它将虚拟库 ID 映射到扩展的别名命名空间，实现更灵活的寄存器分配。

### ID 分区方案

```
虚拟库（架构固定）:
  [0, vbankUpper]: 命名寄存器库（例如标量、向量、MMIO）

重命名别名:
  [vbankUpper + 1, maxBankId]: 动态别名（每个 ROB 条目一个）

示例（8 条目 ROB，4 个虚拟库）:
  虚拟: bank 0,1,2,3
  别名: bank 4,5,6,7,8,9,10,11（每个 ROB 位置一个）
```

### 重命名语义

**写重命名：**

当指令写入虚拟库时，BAT 从池中分配新的别名：

```
写虚拟库[i]:
  ├── 从池中分配 extra_alias[rob_id]
  ├── 更新 v2a[i] ← extra_alias[rob_id]
  └── 保存旧别名用于后续释放
```

**读重命名：**

同一虚拟库的读操作透明地跟随当前别名：

```
读虚拟库[i]:
  └── 使用当前 v2a[i] → 物理 ID
```

**提交时释放：**

ROB 提交时，旧别名被释放并返回到池：

```
提交指令[rob_id]:
  ├── 如果 entHasWrite[rob_id]:
  │   └── 释放 entOldAlias[rob_id]
  └── 清除 aliasInUse[rob_id]
```

### 场景示例

```
程序:
  add r1, r2, r3       # 写到 bank 0
  load r1, [r4]        # 写到 bank 0（不同指令）
  mul r5, r1, r6       # 读 bank 0

时间轴:
  t0: add 分配，bank 0 → alias 4
  t1: load 分配，bank 0 → alias 5（新别名）
  t2: mul 分配，从 v2a[0] = alias 5 读（load 的结果）
  t3: add 提交，alias 4 被释放
  t4: load 提交，alias 5 可重用
```

### 约束和配置

- `bankIdLen`: 库 ID 的总比特数（通常 8-16）
- `vbankUpper`: 最高虚拟库 ID（例如 4 个虚拟库时为 3）
- `robEntries`: ROB 条目数决定别名池大小
- 约束: `aliasBase + robEntries - 1 ≤ (1 << bankIdLen) - 1`

## 域特定执行

**Ball 域（加速器）** 从 GlobalScheduler 接收包含库重命名信息的压缩命令，允许有效的寄存器分配。SubROB 跟踪 Ball 核内的子操作，并使用库信息指导访问哪些寄存器文件库。当 Ball 单元完成核执行时，它发送完成信号，更新 GlobalROB 并释放相关资源。

**内存域（MemDomain）** 处理所有由 GlobalScheduler 发放的 load、store 和 DMA 操作。库信息用于确定物理寄存器库将接收哪些结果，完成反馈在内存操作提交后发送。这种与重命名逻辑的集成确保内存结果正确流入重命名的寄存器命名空间。

**GP 域（通用）** 执行标准 ALU 和控制流操作。它与 Ball 和内存域共享调度器基础设施，允许不同指令类型的无缝交错。发放到 GP 的指令具有最快的完成路径，以最小延迟向 GlobalROB 返回结果。这种非阻塞发放模型防止一种操作类型序列化整个流水线。

## 性能考量

### 吞吐量优化

多发放端口为 Ball、内存和 GP 指令提供三条并行路径，避免否则会降低指令每周期吞吐量的序列化瓶颈。SubROB 仲裁机制防止单个 Ball 加速器阻塞其他执行域，确保长时间运行的核不会饿死内存或通用计算单元。虚拟库映射通过 BAT 消除虚假依赖，允许多条指令在不同时间写入同一虚拟库而不引起序列化。

### 延迟路径

Fence 指令引入的开销等于在途指令的最大延迟，在实践中至少为一个周期。Barrier 指令引入更高的开销：GlobalROB 必须完全排空，然后外部 barrier 信号必须与其他瓦片协商，最后下一条指令才能分配。最快的路径是 Ball 发放，当 Ball 单元可用且未被资源竞争阻塞时在一个周期内完成。

### 资源限制

GlobalROB 深度（通常 32-64 条目）为跨所有域的在途指令数量设置上界，防止指令状态无限增长。SubROB 深度（通常每个 Ball 加速器 16-32 条目）限制了单个 Ball 核内的并行度。别名池大小由超出虚拟库的额外库 ID 决定，必须达到或超过 ROB 深度以防止重命名停顿。这些资源的仔细配置对于平衡性能和芯片面积至关重要。

## 调试和分析

### 执行追踪

启用 ITRACE 捕获 GlobalScheduler 行为，生成追踪记录显示每个 ROB 条目的分配、发放和完成事件。追踪揭示域路由决策（哪个执行单元接收指令）、fence 和 barrier 状态转换，以及停顿原因（如 ROB 溢出或域未就绪接收指令）。与时间戳结合，这些追踪允许详细的时间轴分析指令流通过调度器。

### 性能分析

使用 PMCTRACE 测量各域的发放率、停顿频率和原因、平均 ROB 占用率和重命名效率（别名重用与新分配的比率）。这些指标有助于识别调度器是否是瓶颈，或某个特定执行域是否饱和。一个域中的高停顿频率表明该域应被加速，而低 ROB 占用率表明指令流本身是瓶颈。

### 常见问题

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| ROB 满暂停 | 过多长延迟操作 | 减少核大小或增加 ROB 深度 |
| Barrier 超时 | 核未到达同步点 | 验证所有线程执行 barrier 代码 |
| Fence 后结果错误 | 内存顺序违反 | 检查 MMIO 前 fence 放置 |
| SubROB 溢出 | Ball 核过深 | 将核拆分为较小批次 |

## 参见

- [Goban 多核架构](Goban%20Multi-Core%20Architecture.md)
- [GemminiBall 架构](GemminiBall%20Architecture.md)
- [开发工作流和构建系统](Development%20Workflow%20and%20Build%20System.md)
