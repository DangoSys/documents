<div align="center">

# Buckyball ISA 指令参考

基于 RISC-V `CUSTOM_3`（opcode `0x7b`）R-R 格式自定义指令集

```
.insn r CUSTOM_3, 0x3, funct7, x0, rs1, rs2
```
    
</div>


## rs1/rs2 统一编码

### rs1 — Bank 路由 + 迭代控制（64-bit）

<table>
<tr>
<th style="text-align:center; background:#e8f4fd; padding:4px 12px;">63:48</th>
<th style="text-align:center; background:#fde8e8; padding:4px 8px;">47</th>
<th style="text-align:center; background:#fde8e8; padding:4px 8px;">46</th>
<th style="text-align:center; background:#fde8e8; padding:4px 8px;">45</th>
<th style="text-align:center; background:#e8fde8; padding:4px 12px;">44:30</th>
<th style="text-align:center; background:#fdf8e8; padding:4px 12px;">29:15</th>
<th style="text-align:center; background:#f0e8fd; padding:4px 12px;">14:0</th>
</tr>
<tr>
<td style="text-align:center; padding:6px 12px;"><code>iter</code><br><sub>16-bit</sub></td>
<td style="text-align:center; padding:6px 8px;"><code>WR</code></td>
<td style="text-align:center; padding:6px 8px;"><code>RD1</code></td>
<td style="text-align:center; padding:6px 8px;"><code>RD0</code></td>
<td style="text-align:center; padding:6px 12px;"><code>bank_2</code><br><sub>15-bit</sub></td>
<td style="text-align:center; padding:6px 12px;"><code>bank_1</code><br><sub>15-bit</sub></td>
<td style="text-align:center; padding:6px 12px;"><code>bank_0</code><br><sub>15-bit</sub></td>
</tr>
</table>

- **WR** (`[47]`) — 写 Bank 使能 &emsp; **RD1** (`[46]`) — bank\_1 读使能 &emsp; **RD0** (`[45]`) — bank\_0 读使能

### rs2 — 统一 Special 字段（64-bit）

<table>
<tr>
<th style="text-align:center; background:#f5f5f5; padding:4px 12px;">63:0</th>
</tr>
<tr>
<td style="text-align:center; padding:6px 12px;"><code>special</code> — 完整 64-bit，含义由各指令自行定义</td>
</tr>
</table>

<details>
<summary><b>C 宏辅助</b></summary>

```c
// Bank ID 编码
BB_BANK0(id)   // id -> rs1[14:0]
BB_BANK1(id)   // id -> rs1[29:15]
BB_BANK2(id)   // id -> rs1[44:30]

// 使能标志
BB_RD0         // 置位 rs1[45]
BB_RD1         // 置位 rs1[46]
BB_WR          // 置位 rs1[47]

// 迭代次数
BB_ITER(n)     // n -> rs1[63:48]

// 位域辅助
FIELD(val, start_bit, end_bit)
```

</details>

## 指令速查

<div align="center">

| funct7 | 指令 | 域 | Bank | rs2 |
|:------:|------|:--:|:----:|-----|
| `21` | `bb_shared_mvin` | Mem | W | addr + stride |
| `22` | `bb_shared_mvout` | Mem | R | addr + stride |
| `23` | `bb_mset` | Mem | W | row + col + alloc |
| `24` | `bb_mvin` | Mem | W | addr + stride |
| `25` | `bb_mvout` | Mem | R | addr + stride |
| `31` | `bb_fence` | FE | -- | 0 |
| `32` | `bb_mul_warp16` | Ball | RR+W | mode |
| `33` | `bb_im2col` | Ball | R+W | 卷积参数 |
| `34` | `bb_transpose` | Ball | R+W | mode |
| `38` | `bb_relu` | Ball | R+W | 0 |
| `39` | `bb_BFP` | Ball | RR+W | mode |
| `40` | `bb_quant` | Ball | R+W | scale\_fp32 |
| `41` | `bb_dequant` | Ball | R+W | scale\_fp32 |
| `42` | `bb_gemmini_config` | Ball | -- | 配置参数 |
| `43` | `bb_gemmini_preload` | Ball | R+W | 0 |
| `44` | `bb_gemmini_compute_preloaded` | Ball | RR+W | 0 |
| `45` | `bb_gemmini_compute_accumulated` | Ball | RR+W | 0 |
| `46` | `bb_gemmini_flush` | Ball | -- | 0 |

</div>


## Mem 域指令

<details open>
<summary><b><code>bb_shared_mvin</code> — 共享内存加载 &nbsp;&nbsp; <code>funct7 = 21</code></b></summary>

从 DRAM 加载数据到**共享** SRAM Bank。

```c
bb_shared_mvin(mem_addr, bank_id, depth, stride)
```

| 寄存器 | 字段 | 位域 | 说明 |
|:------:|------|:----:|------|
| rs1 | `bank_0` | `[14:0]` | 目标 Bank ID |
| rs1 | `wr_valid` | `[47]` | 写使能 |
| rs1 | `iter` | `[63:48]` | 加载行数 |
| rs2 | `mem_addr` | `[38:0]` | DRAM 虚拟地址（39-bit） |
| rs2 | `stride` | `[57:39]` | 行步长（字节） |

</details>

<details>
<summary><b><code>bb_shared_mvout</code> — 共享内存存储 &nbsp;&nbsp; <code>funct7 = 22</code></b></summary>

从**共享** SRAM Bank 写回 DRAM。

```c
bb_shared_mvout(mem_addr, bank_id, depth, stride)
```

| 寄存器 | 字段 | 位域 | 说明 |
|:------:|------|:----:|------|
| rs1 | `bank_0` | `[14:0]` | 源 Bank ID |
| rs1 | `rd0_valid` | `[45]` | 读使能 |
| rs1 | `iter` | `[63:48]` | 存储行数 |
| rs2 | `mem_addr` | `[38:0]` | DRAM 虚拟地址 |
| rs2 | `stride` | `[57:39]` | 行步长 |

</details>

<details>
<summary><b><code>bb_mset</code> — Bank 分配/释放 &nbsp;&nbsp; <code>funct7 = 23</code></b></summary>

分配或释放 SRAM Bank 空间。

```c
bb_mset(bank_id, alloc, row, col)
bb_mem_alloc(bank_id, row, col)   // alloc=1 的语法糖
bb_mem_release(bank_id)           // alloc=0 的语法糖
```

| 寄存器 | 字段 | 位域 | 说明 |
|:------:|------|:----:|------|
| rs1 | `bank_0` | `[14:0]` | 目标 Bank ID |
| rs1 | `wr_valid` | `[47]` | 写使能 |
| rs2 | `row` | `[4:0]` | 行数 |
| rs2 | `col` | `[9:5]` | 列数（>1 触发多 Bank 分配） |
| rs2 | `alloc` | `[10]` | 1=分配, 0=释放 |

</details>

<details>
<summary><b><code>bb_mvin</code> — 私有内存加载 &nbsp;&nbsp; <code>funct7 = 24</code></b></summary>

从 DRAM 加载数据到**私有** SRAM Bank。编码与 `bb_shared_mvin` 相同，硬件通过 funct7 区分共享/私有。

```c
bb_mvin(mem_addr, bank_id, depth, stride)
```

| 寄存器 | 字段 | 位域 | 说明 |
|:------:|------|:----:|------|
| rs1 | `bank_0` | `[14:0]` | 目标 Bank ID |
| rs1 | `wr_valid` | `[47]` | 写使能 |
| rs1 | `iter` | `[63:48]` | 加载行数 |
| rs2 | `mem_addr` | `[38:0]` | DRAM 虚拟地址 |
| rs2 | `stride` | `[57:39]` | 行步长 |

</details>

<details>
<summary><b><code>bb_mvout</code> — 私有内存存储 &nbsp;&nbsp; <code>funct7 = 25</code></b></summary>

从**私有** SRAM Bank 写回 DRAM。编码与 `bb_shared_mvout` 相同，仅 funct7 不同。

```c
bb_mvout(mem_addr, bank_id, depth, stride)
```

| 寄存器 | 字段 | 位域 | 说明 |
|:------:|------|:----:|------|
| rs1 | `bank_0` | `[14:0]` | 源 Bank ID |
| rs1 | `rd0_valid` | `[45]` | 读使能 |
| rs1 | `iter` | `[63:48]` | 存储行数 |
| rs2 | `mem_addr` | `[38:0]` | DRAM 虚拟地址 |
| rs2 | `stride` | `[57:39]` | 行步长 |

</details>

## Frontend 域指令

<details open>
<summary><b><code>bb_fence</code> — 流水线屏障 &nbsp;&nbsp; <code>funct7 = 31</code></b></summary>

阻塞后续指令发射，直到 ROB 中所有已发射指令完成。

```c
bb_fence()
```

rs1 = 0, rs2 = 0。无 Bank 操作，无参数。

</details>

## Ball 域指令

<details open>
<summary><b><code>bb_mul_warp16</code> — 16-元素向量乘法 &nbsp;&nbsp; <code>funct7 = 32</code></b></summary>

逐元素向量乘法，支持多种数据类型模式。

```c
bb_mul_warp16(op1_bank_id, op2_bank_id, wr_bank_id, iter, mode)
```

| 寄存器 | 字段 | 位域 | 说明 |
|:------:|------|:----:|------|
| rs1 | `bank_0` | `[14:0]` | 操作数 1 |
| rs1 | `bank_1` | `[29:15]` | 操作数 2 |
| rs1 | `bank_2` | `[44:30]` | 结果 |
| rs1 | 使能 | `[47:45]` | RD0 + RD1 + WR |
| rs1 | `iter` | `[63:48]` | 迭代行数 |
| rs2 | `mode` | `[63:0]` | 运算模式 |

</details>

<details>
<summary><b><code>bb_im2col</code> — Im2Col 变换 &nbsp;&nbsp; <code>funct7 = 33</code></b></summary>

将卷积输入重排为矩阵列形式（Toeplitz 矩阵构造）。

```c
bb_im2col(op1_bank_id, wr_bank_id, krow, kcol, inrow, incol, startrow, startcol)
```

| 寄存器 | 字段 | 位域 | 说明 |
|:------:|------|:----:|------|
| rs1 | `bank_0` | `[14:0]` | 输入 Bank |
| rs1 | `bank_2` | `[44:30]` | 输出 Bank |
| rs1 | 使能 | `[45],[47]` | RD0 + WR |
| rs2 | `kcol` | `[3:0]` | 卷积核列数 |
| rs2 | `krow` | `[7:4]` | 卷积核行数 |
| rs2 | `incol` | `[12:8]` | 输入列数 |
| rs2 | `inrow` | `[22:13]` | 输入行数 |
| rs2 | `startcol` | `[27:23]` | 起始列偏移 |
| rs2 | `startrow` | `[37:28]` | 起始行偏移 |

</details>

<details>
<summary><b><code>bb_transpose</code> — 矩阵转置 &nbsp;&nbsp; <code>funct7 = 34</code></b></summary>

```c
bb_transpose(op1_bank_id, wr_bank_id, iter, mode)
```

| 寄存器 | 字段 | 位域 | 说明 |
|:------:|------|:----:|------|
| rs1 | `bank_0` | `[14:0]` | 输入 Bank |
| rs1 | `bank_2` | `[44:30]` | 输出 Bank |
| rs1 | 使能 | `[45],[47]` | RD0 + WR |
| rs1 | `iter` | `[63:48]` | 行数 |
| rs2 | `mode` | `[63:0]` | 转置模式 |

</details>

<details>
<summary><b><code>bb_relu</code> — ReLU 激活 &nbsp;&nbsp; <code>funct7 = 38</code></b></summary>

逐元素 ReLU：`out = max(0, in)`。

```c
bb_relu(bank_id, wr_bank_id, iter)
```

| 寄存器 | 字段 | 位域 | 说明 |
|:------:|------|:----:|------|
| rs1 | `bank_0` | `[14:0]` | 输入 Bank |
| rs1 | `bank_2` | `[44:30]` | 输出 Bank |
| rs1 | 使能 | `[45],[47]` | RD0 + WR |
| rs1 | `iter` | `[63:48]` | 行数 |
| rs2 | -- | -- | 0 |

</details>

<details>
<summary><b><code>bb_BFP</code> — 块浮点运算 &nbsp;&nbsp; <code>funct7 = 39</code></b></summary>

编码与 `bb_mul_warp16` 一致（双读 + 写 + iter + mode），仅 funct7 不同。

```c
bb_BFP(op1_bank_id, op2_bank_id, wr_bank_id, iter, mode)
```

| 寄存器 | 字段 | 位域 | 说明 |
|:------:|------|:----:|------|
| rs1 | `bank_0` | `[14:0]` | 操作数 1 |
| rs1 | `bank_1` | `[29:15]` | 操作数 2 |
| rs1 | `bank_2` | `[44:30]` | 结果 |
| rs1 | 使能 | `[47:45]` | RD0 + RD1 + WR |
| rs1 | `iter` | `[63:48]` | 行数 |
| rs2 | `mode` | `[63:0]` | 运算模式 |

</details>

<details>
<summary><b><code>bb_quant</code> / <code>bb_dequant</code> — 量化/反量化 &nbsp;&nbsp; <code>funct7 = 40 / 41</code></b></summary>

FP32 与定点之间的缩放转换。两条指令编码完全相同。

```c
bb_quant(bank_id, wr_bank_id, iter, scale_fp32)
bb_dequant(bank_id, wr_bank_id, iter, scale_fp32)
```

| 寄存器 | 字段 | 位域 | 说明 |
|:------:|------|:----:|------|
| rs1 | `bank_0` | `[14:0]` | 输入 Bank |
| rs1 | `bank_2` | `[44:30]` | 输出 Bank |
| rs1 | 使能 | `[45],[47]` | RD0 + WR |
| rs1 | `iter` | `[63:48]` | 行数 |
| rs2 | `scale` | `[31:0]` | FP32 缩放因子（bit pattern） |

</details>

## Gemmini 脉动阵列指令

> Gemmini 指令组共享 **Ball ID = 7**。硬件解码器在 `special[3:0]` 注入子命令标识，
> 由 `GemminiExCtrl` 状态机根据子命令分发执行。

<details open>
<summary><b><code>bb_gemmini_config</code> — 配置脉动阵列 &nbsp;&nbsp; <code>funct7 = 42</code></b></summary>

配置数据流模式、激活函数等参数。无 Bank 操作，立即完成。

```c
bb_gemmini_config(dataflow, activation, a_transpose, b_transpose, in_shift)
```

| 寄存器 | 字段 | 位域 | 说明 |
|:------:|------|:----:|------|
| rs1 | -- | -- | 0 |
| rs2 | `dataflow` | `[4]` | 0=OS, 1=WS |
| rs2 | `activation` | `[6:5]` | 0=无, 1=ReLU |
| rs2 | `a_transpose` | `[7]` | A 矩阵转置 |
| rs2 | `b_transpose` | `[8]` | B 矩阵转置 |
| rs2 | `in_shift` | `[40:9]` | 输出右移量 |

> **解码细节**：硬件将 rs2 重组为 `Cat(rs2[63:4], 0.U(4.W))`，`special[3:0]` 替换为子命令 `CONFIG = 0`。
> 因此 C 宏中配置参数从 bit 4 起编码，避免与子命令标识冲突。

</details>

<details>
<summary><b><code>bb_gemmini_preload</code> — 预加载矩阵 &nbsp;&nbsp; <code>funct7 = 43</code></b></summary>

将 D 矩阵（OS 模式）或 B 矩阵（WS 模式）预加载到脉动阵列。

```c
bb_gemmini_preload(op1_bank_id, wr_bank_id, iter)
```

| 寄存器 | 字段 | 位域 | 说明 |
|:------:|------|:----:|------|
| rs1 | `bank_0` | `[14:0]` | 源 Bank |
| rs1 | `bank_2` | `[44:30]` | 输出 Bank |
| rs1 | 使能 | `[45],[47]` | RD0 + WR |
| rs1 | `iter` | `[63:48]` | 预加载行数 |
| rs2 | -- | -- | 0 |

`special[3:0]` = `PRELOAD = 1`（由解码器注入）

</details>

<details>
<summary><b><code>bb_gemmini_compute_preloaded</code> — 预加载后计算 &nbsp;&nbsp; <code>funct7 = 44</code></b></summary>

执行 C = A * B + D(preloaded)。

```c
bb_gemmini_compute_preloaded(op1_bank_id, op2_bank_id, wr_bank_id, iter)
```

| 寄存器 | 字段 | 位域 | 说明 |
|:------:|------|:----:|------|
| rs1 | `bank_0` | `[14:0]` | A 矩阵 Bank |
| rs1 | `bank_1` | `[29:15]` | B/D 矩阵 Bank |
| rs1 | `bank_2` | `[44:30]` | C 输出 Bank |
| rs1 | 使能 | `[47:45]` | RD0 + RD1 + WR |
| rs1 | `iter` | `[63:48]` | 计算行数 |
| rs2 | -- | -- | 0 |

`special[3:0]` = `COMPUTE_PRELOADED = 2`

</details>

<details>
<summary><b><code>bb_gemmini_compute_accumulated</code> — 累加计算 &nbsp;&nbsp; <code>funct7 = 45</code></b></summary>

复用之前的累加结果继续计算。编码与 `compute_preloaded` 相同。

```c
bb_gemmini_compute_accumulated(op1_bank_id, op2_bank_id, wr_bank_id, iter)
```

`special[3:0]` = `COMPUTE_ACCUMULATED = 3`

</details>

<details>
<summary><b><code>bb_gemmini_flush</code> — 刷新脉动阵列 &nbsp;&nbsp; <code>funct7 = 46</code></b></summary>

清空脉动阵列内部状态。

```c
bb_gemmini_flush()
```

rs1 = 0, rs2 = 0。`special[3:0]` = `FLUSH = 4`。

</details>

## 硬件解码流程

<details>
<summary><b>展开查看解码流程</b></summary>

### 第一级：GlobalDecoder

从 RISC-V Core 接收指令，统一提取公共字段：

| 提取项 | 来源 | 用途 |
|--------|------|------|
| `rd0_valid` | `rs1[45]` | Bank 记分板冒险检测 |
| `rd1_valid` | `rs1[46]` | Bank 记分板冒险检测 |
| `wr_valid` | `rs1[47]` | Bank 记分板冒险检测 |
| `rd_bank_0_id` | `rs1[14:0]` | 读 Bank 0 路由 |
| `rd_bank_1_id` | `rs1[29:15]` | 读 Bank 1 路由 |
| `wr_bank_id` | Mem: `rs1[14:0]`, Ball: `rs1[44:30]` | 写 Bank 路由 |
| `domain_id` | `funct7` 范围判定 | 域路由 |

### 第二级：域解码器

**MemDomainDecoder**：提取 `rs2[38:0]` 作为 `mem_addr`，`rs2` 整体作为 `special`，`rs1[63:48]` 作为 `iter`。

**BallDomainDecoder**：提取 `rs1[14:0]/[29:15]/[44:30]` 作为三个 Bank，`rs2` 整体作为 `special`（Gemmini 指令会在 `special[3:0]` 注入子命令），`rs1[63:48]` 作为 `iter`。

### Bank 记分板

利用三个使能位（`rd0_valid`、`rd1_valid`、`wr_valid`）进行 Bank 级 RAW/WAW/WAR 冒险检测，支持不同 Ball 之间的乱序发射。

</details>
