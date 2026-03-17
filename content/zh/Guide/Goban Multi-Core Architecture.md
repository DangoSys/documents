# Goban 多核架构

## 概述

Goban 是 Buckyball 中的一个多核 BBTile 配置，支持 SPMD（单程序多数据）工作负载的并行执行。每个 BBTile 包含多个 Rocket 核，每个核都配置有自己的 BuckyballAccelerator。所有加速器在一个瓦片内共享单个 SharedMemBackend 和 BarrierUnit 以进行同步。

## 架构概览

### 瓦片结构

```
┌─────────────────────────────────────┐
│        BBTile (Goban)               │
├─────────────────────────────────────┤
│ 核心0  │ 核心1  │ ...│ 核心N-1     │
│Rocket+│Rocket+│    │Rocket+        │
│加速   │加速   │    │加速           │
├──────┴───────┴────┴────────────────┤
│    SharedMemBackend + BarrierUnit   │
└─────────────────────────────────────┘
```

### 配置变体

**BuckyballGobanConfig**
- 1 个 BBTile × 4 核
- 4 个 Rocket 核 + 4 个 BuckyballAccelerator
- 单个 SharedMem + BarrierUnit

**BuckyballGoban2TileConfig**
- 2 个 BBTile × 4 核 = 8 个核心
- 8 个 Rocket 核 + 8 个 BuckyballAccelerator
- 每瓦片的 SharedMem + BarrierUnit

## 核心组件

### 多核执行

每个核心独立执行相同程序，访问：
- 本地寄存器文件
- 私有指令缓存
- 配套的 BuckyballAccelerator 用于硬件操作
- 用于核间通信的共享内存
- 通过 CSR `mhartid` 获取 Hart ID（硬件线程 ID）

### 屏障单元

BarrierUnit 通过 `bb_barrier()` 内置函数提供硬件级同步：

- 在所有核到达屏障前，暂停瓦片内所有核
- 单周期同步开销
- 支持同一程序中的多个连续屏障
- 对于 SPMD 算法协调至关重要

### 共享内存后端

SharedMemBackend 管理来自瓦片内所有核的内存操作：

- 仲裁来自多个核的内存请求
- 为共享数据结构维护一致性
- 处理内存映射 I/O (MMIO) 用于瓦片间通信
- 支持同步原语的原子操作

## 编程模型

### SPMD 执行模式

```c
#include "goban.h"

int main(void) {
  int cid = bb_get_core_id();  // 获取 hart ID [0, nCores-1]
  
  // 阶段 1：每核计算
  int local_result = compute(cid, input_data);
  
  // 阶段 2：同步
  bb_barrier();
  
  // 阶段 3：共享结果处理
  if (cid == 0) {
    process_all_results(local_result);
  }
  
  bb_barrier();  // 确保所有核到达退出
  
  return 0;
}
```

### 核心标识

```c
static inline int bb_get_core_id(void) {
  int hartid;
  asm volatile("csrr %0, mhartid" : "=r"(hartid));
  return hartid;
}
```

返回 hart ID，范围为 `[0, nCores-1]`。在 Goban 配置中，这直接映射到瓦片内的核心索引。

## 测试工作负载

### barrier_test.c

多核屏障同步冒烟测试：

1. 每个核设置 `arrived[cid] = 1`
2. 所有核执行 `bb_barrier()`
3. 每个核验证所有 `arrived[]` 标志已设置
4. 再用 `bb_barrier()` 重复一次
5. 核心 0 打印最终结果

正确性检查：模拟不能挂起，所有核必须完成。

### barrier_mvin_test.c

结合屏障同步和加速器操作（mvins）：

- 测试内存屏障协调与硬件加速的配合
- 验证跨核的数据一致性
- 验证 BarrierUnit 在飞行中加速器操作期间的阻塞

## 与 Buckyball 的集成

### 系统总线

Goban 使用 128 位系统总线（相对于 toy 的较窄总线），以适应多核工作负载的更高内存带宽需求。

### build.sc 中的配置

Goban 在 `arch/src/main/scala/examples/goban/CustomConfigs.scala` 中定义为配置目标：

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

### 运行 Goban 工作负载

```bash
# 使用 Goban 配置（1 瓦片，4 核）进行模拟
bbdev verilator --run \
  '--binary barrier_test-baremetal \
    --config sims.verilator.BuckyballGobanVerilatorConfig \
    --batch'

# 使用 Goban2Tile 配置（2 瓦片，8 核）进行模拟
bbdev verilator --run \
  '--binary barrier_test-baremetal \
    --config sims.verilator.BuckyballGoban2TileVerilatorConfig \
    --batch'
```
