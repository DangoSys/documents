# 开发工作流和构建系统

## 概述

Buckyball 使用 Nix Flakes 提供简化的开发环境，使用 `bbdev` 等工具来管理硬件模拟、编译和测试。本指南涵盖构建系统、常见工作流和故障排除。

## 初始设置

### 使用 Nix Flakes

Nix Flakes 使用所有必需的工具提供可重复的开发环境：

```bash
# 安装 Nix（如果尚未安装）
curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh

# 启用 Flakes（如果默认未启用）
nix flake update
```

### 进入开发环境

```bash
nix develop
```

此命令设置：
- Scala/Chisel RTL 开发工具
- 硬件模拟用的 Verilator
- 代码生成和工具的 Rust 工具链
- 软件用的 C/C++ 编译器
- RISC-V ISA 模拟器（Spike）
- 设备树编译器（dtc）
- 跨平台构建用的 CMake
- 测试框架和依赖项
- 预提交钩子
- 系统实用程序（用于部署的 rsync、用于文档生成的 Node.js）

### 完整存储库初始化

`build-all.sh` 脚本自动化完整的设置过程：

```bash
cd buckyball
./scripts/nix/build-all.sh
```

**设置步骤**（可以用 `--skip N` 跳过）：

1. 安装 bbdev
2. 编译编译器工具链
3. 预编译 RTL 源
4. 预编译测试工作负载
5. 构建 waveform-mcp 模块
6. 安装预提交钩子

**选项：**

```bash
# 跳过特定步骤
./scripts/nix/build-all.sh --skip 2 --skip 4

# 详细输出
./scripts/nix/build-all.sh --verbose

# 在 Nix 存储中安装依赖项（默认）
./scripts/nix/build-all.sh --install-in-nix
```

## bbdev 工具

`bbdev` 是 Buckyball 中硬件模拟和构建管理的主要接口。它支持多个模拟后端，并为编译和测试工具提供统一的访问。

### 基本用法

```bash
bbdev <command> [options]
```

### 可用后端

`bbdev` 抽象不同的模拟和构建后端：

- **Verilator**: 快速开源 RTL 模拟器用于验证
- **Spike**: Bebop 协同模拟验证用的 RISC-V 功能模拟器
- **Compiler**: 硬件代码生成用的基于 MLIR 的工具链

对 `bbdev` 的最近更新包括改进的与 `iii` 工具集的基于 Python 的集成，以及通过 `sardine` 框架增强的测试编排。

### Verilator 模拟

使用 Verilator 后端运行 RTL 模拟：

```bash
# 基本模拟运行
bbdev verilator --run '<simulation-options>'

# 常见模拟选项
bbdev verilator --run \
  '--jobs 16 \
    --binary <workload-name> \
    --config sims.verilator.BuckyballToyVerilatorConfig \
    --batch'
```

**工作负载示例：**

- `ctest_vecunit_matmul_ones_singlecore-baremetal`: 单核矩阵乘法测试
- `ctest_toy_add-baremetal`: 玩具向量加法测试
- 模型测试: `ModelTest-<model>`（例如 `ModelTest-LeNet`）

### 模拟配置

`sims/verilator/` 中的可用配置：

- `BuckyballToyVerilatorConfig`: 用于单元测试的单核配置
- `BuckyballGobanVerilatorConfig`: 多核配置（1 瓦片，4 核）具有共享加速器
- `BuckyballGoban2TileVerilatorConfig`: 多瓦片配置（2 瓦片，8 核）用于 SPMD 工作负载
- `BebopSpikeVerilatorCosimConfig`: Bebop 向量加速器与 Spike 耦合
- 自定义配置: 在 Scala 配置文件中定义

**多核模拟：**

对于基于 Goban 的配置，工作负载必须实现具有硬件屏障同步的 SPMD 模式：

```bash
# 运行 Goban 多核测试
bbdev verilator --run \
  '--binary barrier_test-baremetal \
    --config sims.verilator.BuckyballGobanVerilatorConfig \
    --batch'
```

**Bebop 向量加速器：**

使用 Spike 耦合运行 Bebop 协同模拟测试：

```bash
bbdev verilator --run \
  '--jobs 16 \
    --binary ctest_bebop_cosim_matmul \
    --config sims.bebop.BebopSpikeVerilatorCosimConfig \
    --batch'
```

详见 [Bebop Spike-Verilator 协同模拟](../Architecture/Bebop%20Spike-Verilator%20Cosimulation.md)。

## 构建工具和依赖

### 核心工具

最新 Buckyball 版本在 Nix 开发环境中包含新的构建和模拟工具：

| 工具 | 用途 | 版本 |
|------|------|------|
| Spike | RISC-V ISA 模拟器 | 最新 |
| CMake | 构建配置 | 3.28+ |
| 设备树编译器 (dtc) | 设备树处理 | 1.7+ |
| Java (OpenJDK) | Java 工具（编译器后端） | 17+ |

进入 `nix develop` 时这些工具自动可用。

### 配置和构建

要重建 Spike 或重新生成设备树：

```bash
# 重建 Spike 模拟器
nix develop --command -- which spike

# 设备树编译示例
nix develop --command -- dtc -I dts -O dtb my_design.dts -o my_design.dtb
```

## 代码组织

### 目录结构

```
buckyball/
├── arch/                    # RTL 设计（Chisel/Scala）
│   ├── src/main/scala/
│   │   ├── examples/        # 参考设计
│   │   ├── framework/       # 核心框架
│   │   └── sims/            # 模拟框架
│   └── tests/               # RTL 单元测试
├── bb-tests/                # 软件工作负载和测试
│   ├── workloads/src/       # 测试应用程序
│   │   ├── ModelTest/       # 机器学习模型推理测试
│   │   ├── OpTest/          # 操作测试
│   │   └── custom/          # 用户定义的工作负载
│   └── sardine/             # 测试框架
├── compiler/                # 基于 MLIR 的编译器
├── frontend/                # 软件框架
├── backend/                 # 系统支持库
└── scripts/                 # 构建和实用脚本
```

### 关键子系统

| 子系统 | 用途 |
|--------|------|
| `framework.balldomain` | 加速器模块（Ball）框架 |
| `framework.top.GlobalConfig` | 系统级配置 |
| `sims.verilator` | Verilator 模拟框架 |
| `bb-tests.sardine` | 测试编排 |
| `bbAgent` | 软件代理/编排 |

## 常见开发任务

### 修改 RTL

1. 编辑 `arch/src/main/scala/` 中的 Chisel 文件
2. 重建模拟：
   ```bash
   cd arch
   mill arch.test  # 运行单元测试
   ```
3. 使用 Verilator 模拟验证

### 添加自定义测试工作负载

1. 在 `bb-tests/workloads/src/<category>/` 中创建源文件
2. 如果需要，添加 CMakeLists.txt
3. 如果使用测试框架，在 `sardine/` 中更新测试配置
4. 使用 `bbdev verilator --run '--binary <workload-name> ...'` 运行

### 调试模拟

**启用波形捕获：**

```bash
bbdev verilator --run '--vcd out.vcd --binary <workload> --batch'
```

**打开波形：**

```bash
gtkwave out.vcd &
```

**追踪特定信号：**
- 在 Chisel 中添加 `dontTouch` 或 `debug` 注解
- 验证生成 RTL 中的信号名称

## 测试和验证

### 单元测试

RTL 单元测试：

```bash
cd arch
mill arch.test
```

### 集成测试

使用 Verilator 的完整系统测试：

```bash
./scripts/nix/test-suite.sh  # 运行完整测试套件（如果可用）
```

### 覆盖率驱动测试

启用覆盖率追踪（如果支持）：

```bash
bbdev verilator --run '--coverage --binary <test> --batch'
```

## 持续集成

### 预提交钩子

安装的钩子验证：
- 代码格式化
- Lint 检查（Scala、C++）
- CMake 语法

```bash
# 手动预提交检查
pre-commit run --all-files
```

### CI 工作流

GitHub Actions 工作流（`.github/workflows/`）：
- `test.yml`: 在推送时运行 Verilator 测试
- `lint.yml`: 代码质量检查
- `build.yml`: 编译器和 RTL 构建

## 故障排除

### 构建问题

| 问题 | 解决方案 |
|------|---------|
| `nix develop` 失败 | 更新 flake：`nix flake update` |
| Scala 编译错误 | 确保 `mill` 是最新的：`mill --version` |
| 缺少依赖项 | 再次运行 `./scripts/nix/build-all.sh` |

### 模拟问题

| 问题 | 解决方案 |
|------|---------|
| 测试超时 | 减少工作负载大小或增加超时 |
| 内存不足 | 检查工作负载数据大小，减小测试规模 |
| 结果不正确 | 启用波形捕获用于调试 |

### 环境问题

```bash
# 重置环境
rm -rf .mill-cache
nix flake update
nix develop --impure
```

## 参见

- [Verilator 模拟和 CI](Verilator%20Simulation%20and%20CI.md)
- [Bebop Spike-Verilator 协同模拟](../Architecture/Bebop%20Spike-Verilator%20Cosimulation.md)
- [向量计算支持](../Architecture/Vector%20Computation%20Support.md)
- [GemminiBall 架构](../Architecture/GemminiBall%20Architecture.md)
- [Buckyball ISA 文档](../Overview/Buckyball%20ISA.md)
- [前端指令调度和库别名表](Frontend%20Instruction%20Scheduling%20and%20Bank%20Aliasing.md)
- [执行追踪和性能分析](Execution%20Tracing%20and%20Performance%20Analysis.md)
