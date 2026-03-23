# 前端指令调度和库别名表

## 概述

Buckyball 前端通过 GlobalScheduler 组件实现先进的指令调度，并通过库别名表（BAT）优化寄存器分配。这些机制支持高效的多域执行（Ball 加速器、GPU、内存操作），减少寄存器压力，提高多种工作负载的吞吐量。

## GlobalScheduler 架构

### 目的

GlobalScheduler 管理跨多个执行域（Ball、GPU、内存）的指令分配和发放，并协调同步原语（fence、barrier）。

### 核心组件

**GlobalROB（全局重序缓冲）**
- 跟踪跨域的所有在途指令
- 维护程序顺序以保证正确性
- 提供分配和完成跟踪
- 支持 fence 和 barrier 语义用于同步

**SubROB（子重序缓冲）**
- 每个 Ball 加速器的子域重序缓冲
- 管理 Ball 计算核内的指令批次
- 支持高吞吐量的 Ball 操作执行
- 共享写端口仲裁器

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

### Ball 域（加速器）

- 接收包含库重命名信息的压缩命令
- SubROB 跟踪 Ball 核内的子操作
- 库信息指导访问哪些寄存器文件库
- 完成标记 Ball 单元完成核执行时

### 内存域（MemDomain）

- 处理 load/store 和 DMA 操作
- 库信息用于结果寄存器分配
- 内存操作提交后的完成反馈

### GP 域（通用）

- 执行标准 ALU 和控制操作
- 与 Ball 和 Mem 域共享调度器
- 非阻塞发放（最快完成路径）

## 性能考量

### 吞吐量优化

- **多发放端口**: 三条并行发放路径（Ball、Mem、GP）避免序列化瓶颈
- **SubROB 仲裁**: 防止单个 Ball 加速器阻塞其他域
- **重命名**: 通过虚拟库映射消除虚假依赖

### 延迟路径

- **Fence**: 开销为最大(在途指令延迟) ≥ 1 周期
- **Barrier**: 开销为 GlobalROB 排空时间 + 外部信号传递
- **Ball 发放**: 1 周期（假设单元可用）

### 资源限制

- GlobalROB 深度（通常 32-64 条目）：在途指令最大值
- SubROB 深度（通常 16-32 每个 Ball）：Ball 核并行度最大值
- 别名池大小：决定重命名压力；应匹配 ROB 深度

## 调试和分析

### 执行追踪

启用 ITRACE 捕获 GlobalScheduler 行为：

```bash
bbdev verilator --run '--batch --binary <test> ...'
```

追踪记录显示：
- 每个 ROB 条目的分配/发放/完成事件
- 域路由（Ball/Mem/GP）
- Fence/barrier 状态转换
- 暂停原因（ROB 满、域未就绪）

### 性能分析

使用 PMCTRACE 测量：
- 各域每周期发放率
- 暂停频率和原因
- 平均 ROB 占用率
- 重命名效率（别名重用率）

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
