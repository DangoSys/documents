<div align="center">

# Buckyball ISA Reference

Custom instruction set based on RISC-V `CUSTOM_3` (opcode `0x7b`), R-R format

```
.insn r CUSTOM_3, 0x3, funct7, x0, rs1, rs2
```

</div>


## rs1/rs2 Unified Encoding

### rs1 — Bank Routing + Iteration Control (64-bit)

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

- **WR** (`[47]`) — Write bank enable &emsp; **RD1** (`[46]`) — bank\_1 read enable &emsp; **RD0** (`[45]`) — bank\_0 read enable

### rs2 — Unified Special Field (64-bit)

<table>
<tr>
<th style="text-align:center; background:#f5f5f5; padding:4px 12px;">63:0</th>
</tr>
<tr>
<td style="text-align:center; padding:6px 12px;"><code>special</code> — Full 64-bit, semantics defined per instruction</td>
</tr>
</table>

<details>
<summary><b>C Macro Helpers</b></summary>

```c
// Bank ID encoding
BB_BANK0(id)   // id -> rs1[14:0]
BB_BANK1(id)   // id -> rs1[29:15]
BB_BANK2(id)   // id -> rs1[44:30]

// Enable flags
BB_RD0         // Set rs1[45]
BB_RD1         // Set rs1[46]
BB_WR          // Set rs1[47]

// Iteration count
BB_ITER(n)     // n -> rs1[63:48]

// Bit-field helper
FIELD(val, start_bit, end_bit)
```

</details>

## Instruction Quick Reference

<div align="center">

| funct7 | Instruction | Domain | Banks | rs2 |
|:------:|-------------|:------:|:-----:|-----|
| `21` | `bb_shared_mvin` | Mem | W | addr + stride |
| `22` | `bb_shared_mvout` | Mem | R | addr + stride |
| `23` | `bb_mset` | Mem | W | row + col + alloc |
| `24` | `bb_mvin` | Mem | W | addr + stride |
| `25` | `bb_mvout` | Mem | R | addr + stride |
| `31` | `bb_fence` | FE | -- | 0 |
| `32` | `bb_mul_warp16` | Ball | RR+W | mode |
| `33` | `bb_im2col` | Ball | R+W | conv params |
| `34` | `bb_transpose` | Ball | R+W | mode |
| `38` | `bb_relu` | Ball | R+W | 0 |
| `39` | `bb_BFP` | Ball | RR+W | mode |
| `40` | `bb_quant` | Ball | R+W | scale\_fp32 |
| `41` | `bb_dequant` | Ball | R+W | scale\_fp32 |
| `42` | `bb_gemmini_config` | Ball | -- | config params |
| `43` | `bb_gemmini_preload` | Ball | R+W | 0 |
| `44` | `bb_gemmini_compute_preloaded` | Ball | RR+W | 0 |
| `45` | `bb_gemmini_compute_accumulated` | Ball | RR+W | 0 |
| `46` | `bb_gemmini_flush` | Ball | -- | 0 |

</div>

## Mem Domain Instructions

<details open>
<summary><b><code>bb_shared_mvin</code> — Shared Memory Load &nbsp;&nbsp; <code>funct7 = 21</code></b></summary>

Load data from DRAM into a **shared** SRAM bank.

```c
bb_shared_mvin(mem_addr, bank_id, depth, stride)
```

| Reg | Field | Bits | Description |
|:---:|-------|:----:|-------------|
| rs1 | `bank_0` | `[14:0]` | Target bank ID |
| rs1 | `wr_valid` | `[47]` | Write enable |
| rs1 | `iter` | `[63:48]` | Number of rows to load |
| rs2 | `mem_addr` | `[38:0]` | DRAM virtual address (39-bit) |
| rs2 | `stride` | `[57:39]` | Row stride (bytes) |

</details>

<details>
<summary><b><code>bb_shared_mvout</code> — Shared Memory Store &nbsp;&nbsp; <code>funct7 = 22</code></b></summary>

Store data from a **shared** SRAM bank back to DRAM.

```c
bb_shared_mvout(mem_addr, bank_id, depth, stride)
```

| Reg | Field | Bits | Description |
|:---:|-------|:----:|-------------|
| rs1 | `bank_0` | `[14:0]` | Source bank ID |
| rs1 | `rd0_valid` | `[45]` | Read enable |
| rs1 | `iter` | `[63:48]` | Number of rows to store |
| rs2 | `mem_addr` | `[38:0]` | DRAM virtual address |
| rs2 | `stride` | `[57:39]` | Row stride |

</details>

<details>
<summary><b><code>bb_mset</code> — Bank Allocate/Release &nbsp;&nbsp; <code>funct7 = 23</code></b></summary>

Allocate or release SRAM bank space.

```c
bb_mset(bank_id, alloc, row, col)
bb_mem_alloc(bank_id, row, col)   // Shorthand for alloc=1
bb_mem_release(bank_id)           // Shorthand for alloc=0
```

| Reg | Field | Bits | Description |
|:---:|-------|:----:|-------------|
| rs1 | `bank_0` | `[14:0]` | Target bank ID |
| rs1 | `wr_valid` | `[47]` | Write enable |
| rs2 | `row` | `[4:0]` | Number of rows |
| rs2 | `col` | `[9:5]` | Number of columns (>1 triggers multi-bank alloc) |
| rs2 | `alloc` | `[10]` | 1=allocate, 0=release |

</details>

<details>
<summary><b><code>bb_mvin</code> — Private Memory Load &nbsp;&nbsp; <code>funct7 = 24</code></b></summary>

Load data from DRAM into a **private** SRAM bank. Encoding identical to `bb_shared_mvin`; hardware distinguishes shared/private by funct7.

```c
bb_mvin(mem_addr, bank_id, depth, stride)
```

| Reg | Field | Bits | Description |
|:---:|-------|:----:|-------------|
| rs1 | `bank_0` | `[14:0]` | Target bank ID |
| rs1 | `wr_valid` | `[47]` | Write enable |
| rs1 | `iter` | `[63:48]` | Number of rows to load |
| rs2 | `mem_addr` | `[38:0]` | DRAM virtual address |
| rs2 | `stride` | `[57:39]` | Row stride |

</details>

<details>
<summary><b><code>bb_mvout</code> — Private Memory Store &nbsp;&nbsp; <code>funct7 = 25</code></b></summary>

Store data from a **private** SRAM bank back to DRAM. Encoding identical to `bb_shared_mvout`.

```c
bb_mvout(mem_addr, bank_id, depth, stride)
```

| Reg | Field | Bits | Description |
|:---:|-------|:----:|-------------|
| rs1 | `bank_0` | `[14:0]` | Source bank ID |
| rs1 | `rd0_valid` | `[45]` | Read enable |
| rs1 | `iter` | `[63:48]` | Number of rows to store |
| rs2 | `mem_addr` | `[38:0]` | DRAM virtual address |
| rs2 | `stride` | `[57:39]` | Row stride |

</details>

---

## Frontend Domain Instructions

<details open>
<summary><b><code>bb_fence</code> — Pipeline Fence &nbsp;&nbsp; <code>funct7 = 31</code></b></summary>

Stalls subsequent instruction dispatch until all in-flight instructions in the ROB have completed.

```c
bb_fence()
```

rs1 = 0, rs2 = 0. No bank access, no parameters.

</details>

## Ball Domain Instructions

<details open>
<summary><b><code>bb_mul_warp16</code> — 16-Element Vector Multiply &nbsp;&nbsp; <code>funct7 = 32</code></b></summary>

Element-wise vector multiplication with configurable data type modes.

```c
bb_mul_warp16(op1_bank_id, op2_bank_id, wr_bank_id, iter, mode)
```

| Reg | Field | Bits | Description |
|:---:|-------|:----:|-------------|
| rs1 | `bank_0` | `[14:0]` | Operand 1 |
| rs1 | `bank_1` | `[29:15]` | Operand 2 |
| rs1 | `bank_2` | `[44:30]` | Result |
| rs1 | enables | `[47:45]` | RD0 + RD1 + WR |
| rs1 | `iter` | `[63:48]` | Row count |
| rs2 | `mode` | `[63:0]` | Operation mode |

</details>

<details>
<summary><b><code>bb_im2col</code> — Im2Col Transform &nbsp;&nbsp; <code>funct7 = 33</code></b></summary>

Rearrange convolution input into column form (Toeplitz matrix construction).

```c
bb_im2col(op1_bank_id, wr_bank_id, krow, kcol, inrow, incol, startrow, startcol)
```

| Reg | Field | Bits | Description |
|:---:|-------|:----:|-------------|
| rs1 | `bank_0` | `[14:0]` | Input bank |
| rs1 | `bank_2` | `[44:30]` | Output bank |
| rs1 | enables | `[45],[47]` | RD0 + WR |
| rs2 | `kcol` | `[3:0]` | Kernel columns |
| rs2 | `krow` | `[7:4]` | Kernel rows |
| rs2 | `incol` | `[12:8]` | Input columns |
| rs2 | `inrow` | `[22:13]` | Input rows |
| rs2 | `startcol` | `[27:23]` | Start column offset |
| rs2 | `startrow` | `[37:28]` | Start row offset |

</details>

<details>
<summary><b><code>bb_transpose</code> — Matrix Transpose &nbsp;&nbsp; <code>funct7 = 34</code></b></summary>

```c
bb_transpose(op1_bank_id, wr_bank_id, iter, mode)
```

| Reg | Field | Bits | Description |
|:---:|-------|:----:|-------------|
| rs1 | `bank_0` | `[14:0]` | Input bank |
| rs1 | `bank_2` | `[44:30]` | Output bank |
| rs1 | enables | `[45],[47]` | RD0 + WR |
| rs1 | `iter` | `[63:48]` | Row count |
| rs2 | `mode` | `[63:0]` | Transpose mode |

</details>

<details>
<summary><b><code>bb_relu</code> — ReLU Activation &nbsp;&nbsp; <code>funct7 = 38</code></b></summary>

Element-wise ReLU: `out = max(0, in)`.

```c
bb_relu(bank_id, wr_bank_id, iter)
```

| Reg | Field | Bits | Description |
|:---:|-------|:----:|-------------|
| rs1 | `bank_0` | `[14:0]` | Input bank |
| rs1 | `bank_2` | `[44:30]` | Output bank |
| rs1 | enables | `[45],[47]` | RD0 + WR |
| rs1 | `iter` | `[63:48]` | Row count |
| rs2 | -- | -- | 0 |

</details>

<details>
<summary><b><code>bb_BFP</code> — Block Floating Point &nbsp;&nbsp; <code>funct7 = 39</code></b></summary>

Encoding identical to `bb_mul_warp16` (dual-read + write + iter + mode), differs only in funct7.

```c
bb_BFP(op1_bank_id, op2_bank_id, wr_bank_id, iter, mode)
```

| Reg | Field | Bits | Description |
|:---:|-------|:----:|-------------|
| rs1 | `bank_0` | `[14:0]` | Operand 1 |
| rs1 | `bank_1` | `[29:15]` | Operand 2 |
| rs1 | `bank_2` | `[44:30]` | Result |
| rs1 | enables | `[47:45]` | RD0 + RD1 + WR |
| rs1 | `iter` | `[63:48]` | Row count |
| rs2 | `mode` | `[63:0]` | Operation mode |

</details>

<details>
<summary><b><code>bb_quant</code> / <code>bb_dequant</code> — Quantize / Dequantize &nbsp;&nbsp; <code>funct7 = 40 / 41</code></b></summary>

Scaling conversion between FP32 and fixed-point. Both instructions share identical encoding.

```c
bb_quant(bank_id, wr_bank_id, iter, scale_fp32)
bb_dequant(bank_id, wr_bank_id, iter, scale_fp32)
```

| Reg | Field | Bits | Description |
|:---:|-------|:----:|-------------|
| rs1 | `bank_0` | `[14:0]` | Input bank |
| rs1 | `bank_2` | `[44:30]` | Output bank |
| rs1 | enables | `[45],[47]` | RD0 + WR |
| rs1 | `iter` | `[63:48]` | Row count |
| rs2 | `scale` | `[31:0]` | FP32 scale factor (bit pattern) |

</details>

## Gemmini Systolic Array Instructions

> The Gemmini instruction group shares **Ball ID = 7**. The hardware decoder injects a sub-command
> tag into `special[3:0]`, which `GemminiExCtrl` uses for state machine dispatch.

<details open>
<summary><b><code>bb_gemmini_config</code> — Configure Systolic Array &nbsp;&nbsp; <code>funct7 = 42</code></b></summary>

Configure dataflow mode, activation function, and other parameters. No bank access; completes immediately.

```c
bb_gemmini_config(dataflow, activation, a_transpose, b_transpose, in_shift)
```

| Reg | Field | Bits | Description |
|:---:|-------|:----:|-------------|
| rs1 | -- | -- | 0 |
| rs2 | `dataflow` | `[4]` | 0=OS, 1=WS |
| rs2 | `activation` | `[6:5]` | 0=none, 1=ReLU |
| rs2 | `a_transpose` | `[7]` | Transpose A matrix |
| rs2 | `b_transpose` | `[8]` | Transpose B matrix |
| rs2 | `in_shift` | `[40:9]` | Output right-shift amount |

> **Decode detail**: Hardware reassembles rs2 as `Cat(rs2[63:4], 0.U(4.W))`, replacing `special[3:0]`
> with sub-command `CONFIG = 0`. The C macro therefore encodes config parameters starting at bit 4
> to avoid collision with the sub-command tag.

</details>

<details>
<summary><b><code>bb_gemmini_preload</code> — Preload Matrix &nbsp;&nbsp; <code>funct7 = 43</code></b></summary>

Preload the D matrix (OS mode) or B matrix (WS mode) into the systolic array.

```c
bb_gemmini_preload(op1_bank_id, wr_bank_id, iter)
```

| Reg | Field | Bits | Description |
|:---:|-------|:----:|-------------|
| rs1 | `bank_0` | `[14:0]` | Source bank |
| rs1 | `bank_2` | `[44:30]` | Output bank |
| rs1 | enables | `[45],[47]` | RD0 + WR |
| rs1 | `iter` | `[63:48]` | Rows to preload |
| rs2 | -- | -- | 0 |

`special[3:0]` = `PRELOAD = 1` (injected by decoder)

</details>

<details>
<summary><b><code>bb_gemmini_compute_preloaded</code> — Compute with Preloaded Data &nbsp;&nbsp; <code>funct7 = 44</code></b></summary>

Execute C = A * B + D(preloaded).

```c
bb_gemmini_compute_preloaded(op1_bank_id, op2_bank_id, wr_bank_id, iter)
```

| Reg | Field | Bits | Description |
|:---:|-------|:----:|-------------|
| rs1 | `bank_0` | `[14:0]` | A matrix bank |
| rs1 | `bank_1` | `[29:15]` | B/D matrix bank |
| rs1 | `bank_2` | `[44:30]` | C output bank |
| rs1 | enables | `[47:45]` | RD0 + RD1 + WR |
| rs1 | `iter` | `[63:48]` | Row count |
| rs2 | -- | -- | 0 |

`special[3:0]` = `COMPUTE_PRELOADED = 2`

</details>

<details>
<summary><b><code>bb_gemmini_compute_accumulated</code> — Accumulated Compute &nbsp;&nbsp; <code>funct7 = 45</code></b></summary>

Reuse previously accumulated results for continued computation. Encoding identical to `compute_preloaded`.

```c
bb_gemmini_compute_accumulated(op1_bank_id, op2_bank_id, wr_bank_id, iter)
```

`special[3:0]` = `COMPUTE_ACCUMULATED = 3`

</details>

<details>
<summary><b><code>bb_gemmini_flush</code> — Flush Systolic Array &nbsp;&nbsp; <code>funct7 = 46</code></b></summary>

Clear internal systolic array state.

```c
bb_gemmini_flush()
```

rs1 = 0, rs2 = 0. `special[3:0]` = `FLUSH = 4`.

</details>

## Hardware Decode Pipeline

<details>
<summary><b>Click to expand decode pipeline</b></summary>

### Stage 1: GlobalDecoder

Receives instructions from the RISC-V core and extracts common fields:

| Extracted Field | Source | Purpose |
|-----------------|--------|---------|
| `rd0_valid` | `rs1[45]` | Bank scoreboard hazard detection |
| `rd1_valid` | `rs1[46]` | Bank scoreboard hazard detection |
| `wr_valid` | `rs1[47]` | Bank scoreboard hazard detection |
| `rd_bank_0_id` | `rs1[14:0]` | Read bank 0 routing |
| `rd_bank_1_id` | `rs1[29:15]` | Read bank 1 routing |
| `wr_bank_id` | Mem: `rs1[14:0]`, Ball: `rs1[44:30]` | Write bank routing |
| `domain_id` | `funct7` range | Domain routing |

### Stage 2: Domain Decoders

**MemDomainDecoder**: Extracts `rs2[38:0]` as `mem_addr`, full `rs2` as `special`, `rs1[63:48]` as `iter`.

**BallDomainDecoder**: Extracts `rs1[14:0]/[29:15]/[44:30]` as three bank IDs, full `rs2` as `special` (Gemmini instructions inject sub-command into `special[3:0]`), `rs1[63:48]` as `iter`.

### Bank Scoreboard

Uses the three enable bits (`rd0_valid`, `rd1_valid`, `wr_valid`) for bank-level RAW/WAW/WAR hazard detection, enabling out-of-order dispatch across different Balls.

</details>
