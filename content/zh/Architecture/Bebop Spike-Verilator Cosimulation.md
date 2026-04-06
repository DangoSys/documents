# Bebop Spike-Verilator 协同模拟

## 概述

Bebop 是与 Buckyball 集成的向量计算加速器，针对高性能机器学习工作负载进行优化。Spike-Verilator 协同模拟框架通过将 Spike RISC-V 功能模拟器与基于 Verilator 的 RTL 模拟耦合，实现对 Bebop 操作的周期精确硬件验证。

这种设置使开发人员能够针对参考 ISA 模型测试复杂的向量操作，确保硅片前的正确性，并在硬件设计迭代期间加速 RTL 验证。

## 架构

### 组件布局

协同模拟基础设施包含三个主要组件：

1. **Spike 功能模型**: 提供黄金参考执行的 RISC-V ISA 模拟器
2. **Bebop RTL**: Chisel 生成的 RTL，用于向量计算单元，包括前端和内存域
3. **协同模拟框架**: 在 Spike 和 RTL 之间同步指令执行，验证结果

### 集成点

Bebop 作为专用加速器域集成到 Buckyball 中，具有专用内存后端和向量计算单元。协同模拟在自定义指令（RoCC）边界处耦合 Spike，验证执行语义和内存访问模式。

**关键模块：**

- `BebopBuckyballSubsystemCosim`: 完整系统包装器，组合 Spike 接口、内存层次和向量计算块
- `BebopSpikeCosimTop`: 顶层 Verilator 模块，执行 RoCC 指令并返回结果
- `BebopCosimBlocks`: 实现向量操作的功能块（矩阵乘法、向量长度、库操作）
- `VecComputeTop`: 集成矩阵乘法和其他 SIMD 操作的向量计算单元

## Spike-Verilator 通信协议

### 指令格式

自定义 RoCC 指令通过 `custom3` 操作码（0x7B）路由到 Bebop：

```
指令布局：
[funct7(7) | rs2(5) | rs1(5) | funct3(3) | rd(5) | opcode(7)]
opcode = 0x7B (custom3)
funct3 = 0x3 (固定用于 Bebop)
```

Bebop 操作在 7 位 `funct` 字段中编码，最多支持 128 个不同的操作。

### 结果编码

执行结果遵循确定性编码：

```
- 如果执行成功且返回值为 0: rd = funct (操作 ID)
- 如果执行产生非零值或失败: rd = 0
```

可选的 64 位库摘要窥视允许比较 RTL 和黄金模型之间的内部状态，用于高级验证。

## 运行 Bebop 协同模拟

### 环境设置

确保安装了所有 Bebop 依赖项：

```bash
nix develop
```

这提供了 Spike、Verilator 和编译的 Bebop 工具链。

### 基本协同模拟测试

执行单个向量操作通过 Spike-Verilator：

```bash
bbdev verilator --run \
  '--jobs 16 \
    --binary ctest_bebop_cosim_matmul \
    --config sims.bebop.BebopSpikeVerilatorCosimConfig \
    --batch'
```

### 配置类

| 配置 | 用途 |
|------|------|
| `BebopSpikeVerilatorCosimConfig` | 带有 Spike 耦合和向量计算块的标准协同模拟 |
| `BebopSpikeCosimToyConfig` | 轻量级协同模拟，用于开发期间的快速验证 |
| `BebopBuckyballFullCosimConfig` | 完整系统，包含所有域（如果可用） |

## 向量操作

### 支持的操作

Bebop 实现了受 RISC-V 向量扩展启发的操作，针对矩阵和张量工作负载进行优化：

- **MATMUL**: 块矩阵乘法，可配置平铺大小
- **VLEN**: 向量长度归约操作
- **BANK_OPS**: 内部库访问，用于调试和验证
- **VPADD**: 向量并行加法
- **VSHUFFLE**: 向量单元内的数据混洗

每个操作在 `rs1` 和 `rs2` 寄存器值中编码功能参数（例如，平铺大小、数据类型）。

### 示例：矩阵乘法

验证具有 int32 数据的 64×64 矩阵乘法：

```bash
# 测试工作负载使用 funct=MATMUL_INT32 调用 RoCC 指令
# rs1 = 矩阵 A 指针，rs2 = 矩阵 B 指针
# Spike 执行参考计算 C = A × B
# RTL 执行相同操作，比较结果
```

## 内存集成

### 地址转换

Bebop 通过统一的 TileLink 内存结构与 Buckyball 核共享主内存层次。虚拟到物理的转换在前端进行；Bebop 对 DMA 和加载/存储操作使用物理地址。

**典型地址映射：**
- 代码和数据：0x80000000 – 0x8FFFFFFF
- Bebop 工作内存：在堆中动态分配
- 栈：0x9FFF0000 – 0x9FFFFFFF

### 内存后端

向量操作使用共享内存后端，支持：
- 中间结果的一致读/写
- 大矩阵块的突发传输（缓存行对齐）
- 在拥塞期间通过停顿信号进行反压

### DMA 考虑

Bebop 包含可选的 DMA 支持，用于预取矩阵数据。DMA 操作与计算操作序列化；在协同模拟中检查内存冲突。

## 调试工作流

### 波形捕获

生成 VCD 波形用于信号检查：

```bash
bbdev verilator --run \
  '--batch --vcd bebop_cosim.vcd \
    --binary ctest_bebop_cosim_matmul'
```

在波形查看器中打开（GTKWave、Verdi）：

```bash
gtkwave bebop_cosim.vcd
```

### 追踪分析

启用执行追踪：

```bash
bbdev verilator --run \
  '--batch --verbose \
    --binary ctest_bebop_cosim_matmul' 2>&1 | tee cosim.log
```

日志包含：
- 指令取指/译码事件
- RoCC 操作调用（funct、xs1、xs2）
- 执行结果和延迟
- 内存访问模式

### 不匹配诊断

如果 RTL 结果与 Spike 参考不同：

1. **比较 funct 编码**: 验证 RoCC 指令操作码与操作定义匹配
2. **检查数据路由**: 跟踪 rs1/rs2 值通过内存层次
3. **检查内部状态**: 使用 `bankDigestPeek` 比较操作前后的库状态
4. **查看波形**: 识别出现分歧的周期

## 性能和扩展

### 模拟速度

单个向量操作（例如 64×64 矩阵乘法）：
- RTL 模拟：~10–50K 周期
- 模拟墙钟时间：~1–5 秒（现代 CPU）
- 瓶颈：内存延迟和验证开销

### 扩展注意事项

- **多核**: 每增加一个 Buckyball 核都会降低模拟速度
- **更大矩阵**: 模拟时间随矩阵维度的平方缩放
- **库冲突**: 如果内部库访问模式复杂，使用 `--jobs` 并行化编译

### 优化建议

- 减少测试矩阵大小以快速迭代（例如 16×16 而不是 256×256）
- 跨运行缓存编译的模拟器二进制文件
- 通过调用单独的 `bbdev` 进程并行运行多个测试
- 使用玩具配置进行早期阶段验证

## 故障排除

### 协同模拟挂起

**症状**: Verilator 进程无限期运行而没有输出

**解决方案：**
1. 验证 Spike 已安装：`which spike`
2. 检查 RoCC 指令编码（funct、xs1、xs2 值）
3. 确保内存后端响应（检查 DMA 死锁）
4. 增加测试运行器中的超时

### 结果不匹配

**症状**: RTL 和 Spike 产生不同的 rd 值

**解决方案：**
1. 验证 funct 编码与 `BebopCosimBlocks` 中的操作定义匹配
2. 检查 xs1/xs2 对齐（必须与向量元素宽度匹配）
3. 检查操作前后的内存内容以检测损坏
4. 在出现分歧的周期比较波形

### 内存不足

**症状**: Verilator 进程被杀死或崩溃

**解决方案：**
1. 减少矩阵大小或测试复杂性
2. 禁用不必要的追踪（例如，如果不需要库摘要）
3. 在内存更充足的机器上运行（建议最少 4 GB）
4. 使用单独的测试运行而不是绑定许多测试

## 与 CI/CD 集成

协同模拟框架集成到 Buckyball CI 流水线中以实现持续验证：

```yaml
- name: Bebop Cosimulation Tests
  run: |
    nix develop --command bash -c \
      'bbdev verilator --run "--batch --jobs 16 --binary ctest_bebop_cosim_*"'
```

测试按测试二进制名称并行运行。如果任何协同模拟测试产生不正确的结果，CI 失败。

## 参见

- [开发工作流和构建系统](Development%20Workflow%20and%20Build%20System.md)
- [Verilator 模拟和 CI](Verilator%20Simulation%20and%20CI.md)
- [执行追踪和性能分析](Execution%20Tracing%20and%20Performance%20Analysis.md)
- [Buckyball ISA 文档](../Overview/Buckyball%20ISA.md)
