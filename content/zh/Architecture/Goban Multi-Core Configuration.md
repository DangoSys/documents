# Goban 多核配置

## 概述

**Goban** 是 Buckyball 的多核配置，在单个 BBTile 内支持跨多个 Rocket CPU 核的共享内存并行计算。所有核可以访问相同的 Ball 算子、SRAM bank 和同步机制。

## 架构

### 核心结构

每个 Goban BBTile 包含：
- **N 个 CPU 核**：Rocket RV64 核（默认：4）
- **N 个 BuckyballAccelerator**：每个核一个，各自有独立的执行管道
- **共享组件**：
  - 统一的指令解码器和 Ball 路由器
  - 共享 SRAM bank 和内存后端
  - 用于多核同步的 BarrierUnit
  - 用于 Ball 调度的全局预约站

```
┌──────────────────────────────────────────┐
│      Goban BBTile（4 核）                │
├──────────────────────────────────────────┤
│ Rocket 核 0  Rocket 核 1  ...            │
│      │           │                       │
│   加速 0    加速 1  ...                  │
├──────────────────────────────────────────┤
│  共享前端解码器和 Ball 路由器            │
├──────────────────────────────────────────┤
│   8 个 SRAM Bank（跨核共享）            │
│      BarrierUnit | 全局 RS              │
└──────────────────────────────────────────┘
```

### 关键特性

| 特性 | 值 |
|------|-----|
| 每个 tile 的核数 | 1（默认玩具） 或 4（Goban） |
| 每个核的 Ball 算子 | 独立的问题到共享的算子 |
| SRAM bank | 共享，由内存后端仲裁 |
| 内存一致性 | 弱排序（需要围栏） |
| 同步原语 | 屏障单元、原子操作 |

## 配置

### 单 Tile（4 核）

```scala
class BuckyballGobanConfig extends Config(
  new WithNBBTiles(1, buckyballConfig = GobanConfig()) ++
    new chipyard.config.WithSystemBusWidth(128) ++
    new chipyard.config.AbstractConfig
)
```

- 1 个 BBTile
- 共 4 个核（4 个 Rocket + 4 个加速器）
- 共享 SRAM 和内存系统

**使用方式：**

```bash
bbdev verilator --verilog '--config sims.verilator.BuckyballGobanConfig'
```

### 双 Tile（8 核）

```scala
class BuckyballGoban2TileConfig extends Config(
  new WithNBBTiles(2, buckyballConfig = GobanConfig()) ++
    new chipyard.config.WithSystemBusWidth(128) ++
    new chipyard.config.AbstractConfig
)
```

- 2 个独立的 BBTile
- 共 8 个核（8 个 Rocket + 8 个加速器）
- 每个 tile 有自己的 SRAM 和内存后端（无跨 tile 访问）

**使用方式：**

```bash
bbdev verilator --verilog '--config sims.verilator.BuckyballGoban2TileConfig'
```

## 同步原语

### BarrierUnit

为多核工作负载提供硬件屏障同步。

**使用方式：**

```c
#include <bbhw/isa/isa.h>

void bb_barrier(uint32_t core_mask);  // 等待掩码中的核
```

**参数：**
- `core_mask`：核的位掩码（第 N 位 = 核 N）

**示例：4 核屏障**

```c
// 所有 4 个核使用相同的掩码调用屏障
bb_barrier(0x0F);  // 等待核 0, 1, 2, 3

// 当所有核到达屏障时执行恢复
```

### SRAM Bank 仲裁

当多个核访问相同的 SRAM bank 时，硬件仲裁解决冲突。

**保证：**
- 每个 bank 每个周期一个访问
- 核间轮询公平仲裁
- 无数据损坏（硬件强制互斥）

**最佳实践：** 分割数据以最小化 bank 冲突：

```c
// 线程 0 访问 bank 0
// 线程 1 访问 bank 1
// 等等
```

## 编程模型

### 内存一致性

Goban 使用**弱内存排序**。同步需要显式围栏：

```c
// 核 0：产生数据
for (int i = 0; i < N; i++) {
  data[i] = compute();
}
bb_fence();  // 使写入对其他核可见

// 核 1：消费数据
bb_fence();  // 确保所有先前的加载完成
for (int i = 0; i < N; i++) {
  result[i] = data[i];
}
```

### 工作分配

典型的多核工作流：

```c
int core_id = __builtin_riscv_read_csr(CSR_HARTID);

if (core_id == 0) {
  // 主控：初始化和协调
  bb_alloc(0, 4, 256);  // 在 4 个 bank 中分配 256 行
  bb_barrier(0x0F);     // 信号从控准备好
}

// 每个核处理其分区
uint32_t start = (core_id * 256) / 4;
uint32_t rows = 256 / 4;
bb_im2col(start, start + rows, rows);
bb_fence();

bb_barrier(0x0F);  // 等待所有核
```

### 缓存一致性

Rocket 核包含私有 L1 指令缓存但共享 L2 数据缓存。当一个核通过 Ball 修改 SRAM 时：

1. Ball 写入共享 SRAM bank
2. L2 缓存失效相关行（自动）
3. 其他核下次访问时重新获取更新数据

**注意：** Ball 操作绕过 Rocket 的 L1/L2 缓存并直接访问 SRAM。

## 测试多核工作负载

### 编译

多核二进制使用标准编译：

```bash
# 与单核相同
riscv64-unknown-elf-gcc -o multicore_test multicore_test.c libbbhw.a
```

### 仿真

```bash
# 生成 Goban 的 Verilog
bbdev verilator --verilog '--config sims.verilator.BuckyballGobanConfig'

# 运行仿真
bbdev verilator --run '--jobs 16 --binary multicore_test \
  --config sims.verilator.BuckyballGobanConfig --batch'
```

### 调试多核执行

调试多核代码时：

1. **检查 hartid**：每个核报告其 HARTID（单 tile 为 0-3）
   
   ```bash
   grep "HARTID" arch/log/*/disasm.log
   ```

2. **追踪按核执行**：如果可用，对每个 hartid 使用单独的追踪文件

3. **识别同步错误**：查找：
   - 一个核卡在屏障而其他核继续
   - SRAM bank 冲突导致数据损坏
   - 缺少 fence() 导致陈旧数据读取

4. **检查波形**：Goban 信号包括：
   - 按核的 Ball 有效/就绪信号
   - Bank 仲裁优先级信号
   - 屏障同步状态

## 性能考虑

### 加速 vs. 开销

多核并行引入开销：
- **Bank 仲裁延迟**：~1-2 周期每个竞争
- **同步成本**：屏障 ~5-10 周期每个核
- **L2 缓存失效**：~3-5 周期每行

**最优：** 数据分割以最小化冲突。

### 扩展指南

| 工作负载类型 | 核数 | 预期加速 |
|-------------|------|---------|
| 令人尴尬的并行（无共享） | 4 | ~3.5x |
| 数据并行（一些 bank 冲突） | 4 | ~2-3x |
| 同步细粒度任务 | 4 | ~1.5-2x |

更高的加速需要仔细的数据布局和工作负载平衡。

## 多核 ISA 扩展

### Hart ID（核标识符）

```c
uint32_t hart_id = read_csr(0xF14);  // CSR_HARTID
```

**Goban 的值：**
- 单 tile：0-3（4 核）
- 双 tile：Tile 0: 0-3，Tile 1: 4-7

### 屏障指令

如上所述；作为 Ball 指令添加（funct7 = 50，0x32）。

## 已知限制

1. **无跨 tile 通信**：双 tile Goban 有独立的内存系统
2. **同步限制**：仅屏障；Ball 上无等待自由算法
3. **Bank 仲裁公平性**：轮询但无保证延迟界限
4. **无虚拟内存**：所有核共享线性物理内存（无 MMU）

## 示例：并行矩阵转置

```c
#include <bbhw/isa/isa.h>
#include <stdint.h>

#define MATRIX_SIZE 256
#define CORES 4

int main() {
  uint32_t core = read_csr(0xF14);  // Hart ID
  
  // 主控：初始化
  if (core == 0) {
    bb_alloc(0, 2, MATRIX_SIZE);  // 2 个 bank 用于 A、结果
    bb_mvin_dram(0, 0, MATRIX_SIZE, DRAM_A);
    bb_fence();
  }
  bb_barrier(0x0F);
  
  // 并行转置：每个核执行块
  uint32_t chunk = MATRIX_SIZE / CORES;
  uint32_t start_row = core * chunk;
  
  bb_transpose(0, 1, start_row, chunk);
  bb_fence();
  
  bb_barrier(0x0F);
  
  // 主控：写回
  if (core == 0) {
    bb_mvout_dram(1, 0, MATRIX_SIZE, DRAM_RESULT);
  }
  
  return 0;
}
```

## 相关文档

- [仿真与调试](../Architecture/Simulation%20and%20Debugging.md)
- [构建自己的硬件设计](../Tutorial/Building%20Your%20Own%20Hardware%20Designs.md)
- BarrierUnit RTL：`arch/src/main/scala/framework/core/bbtile/BarrierUnit.scala`
- GlobalRS（Ball 调度器）：`arch/src/main/scala/framework/frontend/globalrs/`
