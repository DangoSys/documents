# buckyball 教程

本文档讲解一个完整的 `buckyball` 开发流程的步骤和问题解决思路。我们以构建一个执行 `relu()` 函数的球算子模块为例：

首先，需要完成该模块的硬件代码编写，即用 Scala 的 Chisel 语言编写硬件代码，并生成对应的 `verilog` 代码。

其次，需要编写测试软件来实现 `relu()`，可以是在 `CPU` 上运行软件代码的参考函数，以及运行在第一步所写专用硬件上的软件代码的实验函数。如果测试结果一致则成功，否则进入第三步测试。

第三，在硬件层面进行仿真，查看波形图进行调试。此外，还有编译器文档修改、指令集更新等其他细节，将在下文说明。

开发过程中遇到问题时，可以访问 [DangoSys/buckyball | DeepWiki](https://deepwiki.com/DangoSys/buckyball) 或 [项目概览 - Buckyball 技术文档](https://dangosys.github.io/buckyball/index.html)

Chisel 学习资源：[binder](https://mybinder.org/v2/gh/freechipsproject/chisel-bootcamp/master)

正式开始前，我们先初始化环境：

```
cd /path/to/buckyball
source env.sh
// 如果报错，尝试 source ./env.sh
// 本文档所有路径均为从 ./buckyball 开始的相对路径
```

## I. 编写 Chisel 硬件模块

在 `arch/src/main/scala/prototype/` 目录下创建 `ReLU` 加速器的 Chisel 实现。参考已有的加速器结构，建议在 `prototype/` 下新建子目录，例如 `prototype/relu/Relu.scala`，并编写硬件代码。

## II. 硬件指令解码

接下来，进行硬件指令解码。需要在**硬件侧**添加对 ReLU 指令的支持，使得硬件解码器能识别该指令，并为该球注册指令集。

这项工作主要分为以下五个方面：

- 指令枚举 (DISA) 定义 func7 → 指令名 (RELU)
- 解码器 (DomainDecoder) 定义 func7 → 解码规则 (读/写/地址/iter) → BID (例如 4)
- 总线注册 (busRegister) 定义 BID → 实际的 Ball 实例 (索引为 4 的 ReluBall)
- 保留站注册 (rsRegister) 用于 RS/issue 描述，与 BID 对齐，便于系统 issue/完成管理和调试
如果任一环节缺失或不一致，ReLU 指令将无法在实际硬件上被正确识别/路由/执行。
- 创建新的 Ball 执行单元 `class ReluUnit` 来处理 ReLU 操作。

#### 1. 在 DISA.scala 中定义 RELU_BITPAT

`arch/src/main/scala/examples/toy/balldomain/DISA.scala` 定义了 Ball 指令的 funct7 编码 (BitPat)，例如 TRANSPOSE, IM2COL 等。可以看作是解码器匹配的“指令集枚举表”。

在此文件中添加 ReLU 指令的位模式定义：

```scala
val RELU = BitPat("b0110010") // funct7 = 50 (0x32) — enable=011, opcode=2
```

#### 2. 将 ReLU 指令添加到 Ball 域解码器

`arch/src/main/scala/examples/toy/balldomain/DomainDecoder.scala` 是 Ball 域解码器。
其功能如下：
- 输入：来自全局解码的 PostGDCmd (已确定为 Ball 类命令)。
- 输出：结构化的 BallDecodeCmd，包括：
  - 是否使用 op1/op2，是否写回暂存器，操作数是否来自暂存器
  - 操作数/写回 bank 和地址
  - 迭代次数 iter
  - 目标 Ball ID (BID)
  - 其他专用字段 special 等。
- 内部通过 ListLookup(func7, ...) 将不同的 funct7 指令映射到一组布尔开关和字段提取规则。

在此文件的解码列表中添加 ReLU 指令的解码入口。参考其他指令的实现 (例如 TRANSPOSE = 49，enable=011, opcode=1)，需要：

```
// 添加到 BallDecodeFields ListLookup
RELU                 -> List(Y,N,Y,Y,N, rs1(spAddrLen-1,0), 0.U(spAddrLen.W), rs2(spAddrLen-1,0), rs2(spAddrLen + 9,spAddrLen), 7.U, rs2(63,spAddrLen + 10), Y) // 根据具体的 ReLU 指令需求填写解码字段，list 参数数量必须一致，可以参考其他指令
```

#### 3. 添加 ReLuBall 生成器并注册

a. `arch/src/main/scala/examples/toy/balldomain/bbus/busRegister.scala` 是 Ball 总线注册表，使用 `Seq(() => new SomeBall(...))` 来注册系统中要实例化的实际 Ball 模块。

在此文件中查找并添加 ReLuBall 的新 ID。

```
class BBusModule(implicit b: CustomBuckyballConfig, p: Parameters)
    extends BBus(
      // 定义要注册的 Ball 设备生成器
      Seq(
        () => new examples.toy.balldomain.vecball.VecBall(0),
        () => new examples.toy.balldomain.matrixball.MatrixBall(1),
        () => new examples.toy.balldomain.im2colball.Im2colBall(2),
        () => new examples.toy.balldomain.transposeball.TransposeBall(3),
        ...
        () =>new examples.toy.balldomain.reluball.ReluBall(7) // Ball ID 7 - 新增
      )
    ) {
  override lazy val desiredName = "BBusModule"
}
```

b. `arch/src/main/scala/examples/toy/balldomain/rs/rsRegister.scala` 是“Ball 保留站”注册表，使用一个列表来注册系统中存在哪些 Ball (通过 ballId 指定 ID 和名称)。保留站 (RS) 负责管理 Ball 的发射、占用、完成等元数据，通常也用于可视化/统计、命名和日志记录。

在此文件中注册 ReluBall：

```
class BallRSModule(implicit b: CustomBuckyballConfig, p: Parameters)
    extends BallReservationStation(
      // 定义要注册的 Ball 设备信息
      Seq(
        BallRsRegist(ballId = 0, ballName = "VecBall"),
        BallRsRegist(ballId = 1, ballName = "MatrixBall"),
        BallRsRegist(ballId = 2, ballName = "Im2colBall"),
        BallRsRegist(ballId = 3, ballName = "TransposeBall"),
        ...
        BallRsRegist(ballId = 7, ballName = "ReluBall") // Ball ID 7 - 新增
      )
    ) {
  override lazy val desiredName = "BallRSModule"
}
```
#### 4. 编写 ReluBall 接口文件

在 `arch/src/main/scala/examples/toy/balldomain` 目录下创建 `reluball` 文件夹，进入该文件夹并创建 `ReluBall.scala` 来编写接口代码。

## III. 编写测试软件及编译设置

### 1. 创建测试文件

在 `bb-tests/workloads/src/CTest/toy/` 下创建 `relu_test.c`，编写测试代码。代码中的核心函数将执行 `void bb_relu(uint32_t op1_addr, uint32_t wr_addr, uint32_t iter);` 注意下面该函数的声明和定义。

### 2. 修改 CMakeLists.txt

在 `bb-tests/workloads/src/CTest/toy/CMakeLists.txt` 中添加测试目标：CMakeLists.txt:120-127

```
add_cross_platform_test_target(ctest_relu_test relu_test.c)
```

并添加到主构建目标中：CMakeLists.txt:137-162

```
add_custom_target(buckyball-CTest-build ALL DEPENDS
  # ... 其他测试 ...
  ctest_relu_test
  COMMENT "Building all workloads for Buckyball"
  VERBATIM)
```

### 3. 需要添加 ReLU 指令 API

#### a. isa.h

- 在 `bb-tests/workloads/lib/bbhw/isa/isa.h` 中添加 `ReLU` 指令的声明：`isa.h:33-43`

- 添加到 `InstructionType` 枚举：

```
RELU_FUNC7 = 38,  // 0x26 - ReLU 功能码 (或你选择的其他值)
```

- 添加到函数声明部分：`isa.h:72-73`

```
void bb_relu(uint32_t op1_addr, uint32_t wr_addr, uint32_t iter);
```

#### b. isa.c

- 在 `bb-tests/workloads/lib/bbhw/isa` 中添加 `38_relu.c`，在其中实现 `void bb_relu(uint32_t op1_addr, uint32_t wr_addr, uint32_t iter)`

- 在 `bb-tests/workloads/lib/bbhw/isa/isa.c` 中添加声明：`isa.c:53-76`

```
case RELU_FUNC7:
	return &relu_config;
```

- 在 `isa.c:37-47`

```
extern const InstructionConfig relu_config;
```

### 4. 更新 CMakeLists.txt

在 `bb-tests/workloads/lib/bbhw/isa/CMakeLists.txt` 中的所有三个编译命令中添加 `38_relu.c` 的编译和链接：

1. **Linux 版本**：在 `add_custom_command` 的 `COMMAND` 中添加：

   ```
   && riscv64-unknown-linux-gnu-gcc -c ${CMAKE_CURRENT_SOURCE_DIR}/38_relu.c -march=rv64gc -I${CMAKE_CURRENT_SOURCE_DIR} -I${CMAKE_CURRENT_SOURCE_DIR}/.. -o linux-38_relu.o
   ```

   并将 `linux-38_relu.o` 添加到 `ar rcs` 命令中

2. **裸机版本**：在 `add_custom_command` 的 `COMMAND` 中添加：

   ```
   && riscv64-unknown-elf-gcc -c ${CMAKE_CURRENT_SOURCE_DIR}/38_relu.c -g -fno-common -O2 -static -march=rv64gc -mcmodel=medany -fno-builtin-printf -D__BAREMETAL__ -I${CMAKE_CURRENT_SOURCE_DIR} -I${CMAKE_CURRENT_SOURCE_DIR}/.. -o baremetal-38_relu.o
   ```

   并将 `baremetal-38_relu.o` 添加到 `ar rcs` 命令中

3. **x86 版本**：在 `add_custom_command` 的 `COMMAND` 中添加：

   ```
   && gcc -c ${CMAKE_CURRENT_SOURCE_DIR}/38_relu.c -fPIC -D__x86_64__ -I${CMAKE_CURRENT_SOURCE_DIR} -I${CMAKE_CURRENT_SOURCE_DIR}/.. -o x86-38_relu.o
   ```

   并将 `x86-38_relu.o` 添加到 `ar rcs` 命令中

4. 开头的 ISA 子模块库需要添加对应的 **38_relu.c** 文件。


## IV. 测试运行步骤

### 步骤一：编译测试程序

```
cd bb-tests/build
rm -rf *
cmake -G Ninja ../
```

**警告**：在执行 `rm -rf *` 之前，请确保你在 `bb-tests/build` 目录下，否则在错误文件夹强制删除将是灾难性的！

如果发生灾难，可以从 GitHub 重新拉取初始文档，但服务器端更新的文件无法恢复。

```
ninja ctest_relu_test // 软件编译
```

如果执行 `ninja ctest_relu_test` 后报错，说明软件编译失败，请检查 **“III. 编写测试软件”** 及相关文件。

```
bbdev workload --build
```

将选定的工作负载源代码或配置编译/打包成可在仿真或运行时环境中使用的工件（如可执行文件、镜像、运行时脚本、输入数据包等），以便后续在 Verilator/仿真平台或主机端运行。

### 步骤二：生成 Verilog

```
cd buckyball
bbdev verilator --verilog '--config sims.verilator.BuckyballToyVerilatorConfig'
```

如果执行 `bbdev verilator --verilog` 后报错，说明硬件编译失败，请检查 **“I. 编写 Chisel 硬件模块 II. 编译适配准备”** 相关文件。


### 步骤三：运行仿真

```
bbdev verilator --run '--jobs 16 --binary ctest_relu_test_singlecore-baremetal --config sims.verilator.BuckyballToyVerilatorConfig --batch'
```

如果执行 `bbdev verilator --verilog` 后报错，说明硬件系统存在超时、死锁等问题，请检查 **I. 编写 Chisel 硬件模块** 相关文件。

### 步骤五：查看仿真文件

在 `arch/waveform/SimulationFileName(例如 2025-10-08-00-03-ctest_vecunit_matmul_random1_singlecore-baremetal)` 中，使用 `Filezilla` 等软件将 `waveform.fst` 文件下载到本地系统，并使用本地仿真波形查看器（例如 GTKWave）查看波形。

注意，仿真文件文件夹应只包含 `waveform.fst` 文件。如果存在 `waveform.fst.hier` 文件，则说明仿真失败。

如果波形不符合理论条件，在软件测试代码正确的情况下，请检查 **I. 编写 Chisel 硬件模块** 相关文件。

要检查软件代码是否有问题，可以参考其在 `CPU` 上的执行结果。可以暂时从 `relu_test.c` 文件中完全移除硬件加速器调用，只测试 CPU 版本。

## V. 仿真波形
在本地导入 `waveform.fst` 后，使用 [GTKWAVE](https://zhuanlan.zhihu.com/p/647533706) 在项目索引中找到：
`TOP.TestHarness.chiptop0.system.tile_prci_domain.element_reset_domain_tile.buckyball.ballDomain.bbus.balls_4.reluUnit` 该文件下的常量均为 Relu.scala 使用的硬件常量，双击即可查看波形！

> 不同例程的命名可能不完全相同，但基本类似

## VI. 性能测试

### 查询使用的时钟周期数 - 速度性能指标
```Scala
cat /home/MikeNotFound/code/buckyball/arch/log/2025-10-24-16-59-ctest_relu_test_singlecore-baremetal/disasm.log | grep "PMC"
```

### DC 测试 - 检查时序、频率、面积及相关参数

* **准备工作**

1. 在 `/home/<server_name>/bash.sh` 文件中，末尾添加所需的环境变量：

   ```bash
   export SNPSLMD_LICENSE_FILE=27000@amax
   export PATH="$PATH:/opt/riscv/bin"
   export VCS_HOME="/data0/tools/Synopsys/vcs/vcs/W-2024.09-SP1"
   export PATH="$PATH:$VCS_HOME/bin"
   export VERDI_HOME="/data0/tools/Synopsys/verdi/verdi/W-2024.09-SP1"
   export PATH="$PATH:$VERDI_HOME/bin"
   export SCL_HOME="/data0/tools/Synopsys/scl/scl/2024.06"
   export PATH="$PATH:$SCL_HOME/linux64/bin"
   export DC_HOME="/data0/tools/Synopsys/dc/syn/W-2024.09-SP1"
   export PATH="$PATH:$DC_HOME/bin"
   export PT_HOME="/data0/tools/Synopsys/ptpx/prime/W-2024.09-SP1/"
   export PATH="$PATH:$PT_HOME/bin"

   export LM_LICENSE_FILE=/data0/tools/Synopsys/lic/Synopsys.dat

   alias vcs="vcs -full64"
   alias lmli="lmgrd -c /data0/tools/Synopsys/lic/Synopsys.dat"
   ```

2. 在 `/home/<server_name>/code/buckyball/evals/run-dc.sh` 文件中，移除第 126 行左右的 `-retime` 选项。

---

* **正式测试**

1. 回到 `buckyball` 目录，直接运行统一命令：

  ```bash
  bbdev dc --srcdir arch/ReluBall_1 --top ReluBall
  ```

  该命令会调用 `evals/run-dc.sh` 执行 DC 综合。

2. 如果需要把“生成 Ball Verilog + DC 综合”合并成一步，可使用：

  ```bash
  bbdev dc --srcdir arch/ReluBall_1 --top ReluBall --balltype ReluBall --output-dir ReluBall_1 --config sims.verilator.BuckyballToyVerilatorConfig
  ```

  该命令会先生成 `arch/ReluBall_1` 下的 Verilog，再执行 DC 综合。

4. 可以在以下位置找到测试结果

   ```
   /home/<server_name>/buckyball/bb-tests/output/dc/reports
   ```