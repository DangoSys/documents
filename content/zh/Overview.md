<p align="center">
    <img src="https://raw.githubusercontent.com/DangoSys/documents/refs/heads/main/content/zh/images/logo.png" width = "100%" height = "70%">
</p>



# Buckyball

Buckyball 是一个基于 RISC-V 架构构建的可扩展领域专用架构框架，专为高性能计算和机器学习加速器设计而优化。

## 项目概述

Buckyball 框架提供了一套完整的硬件设计、仿真验证和软件开发工具链，支持从 RTL 设计到系统级验证的全流程开发。该框架采用模块化设计，支持灵活配置和扩展，适用于各种专用计算场景。

## 快速开始

### 在 Nix 中安装
我们使用 Nix Flake 作为主要的构建系统。如果您尚未安装 nix，请按照[指南](https://nix.dev/manual/nix/2.28/installation/installing-binary.html)进行安装，并按照[维基](https://nixos.wiki/wiki/Flakes#Enable_flakes)启用 flake。或者，您可以尝试使用由 Determinate Systems 提供的[安装程序](https://github.com/DeterminateSystems/nix-installer)，该程序默认启用 flake。

**1. 克隆仓库**

```bash
git clone https://github.com/DangoSys/buckyball.git
```

**2. 初始化环境**
```bash
cd buckyball
./scripts/nix/build-all.sh
```

首次安装后，您可以通过运行以下命令随时进入环境：

```bash
nix develop
```

**3. 验证安装**

运行 Verilator 仿真测试以验证安装：
```bash
bbdev verilator --run '--jobs 16 --binary ctest_vecunit_matmul_ones_singlecore-baremetal --config sims.verilator.BuckyballToyVerilatorConfig --batch'
```


<!-- ### Buckyball 作为库
  我们支持提供精简版的 buckyball 安装，将其作为 Chipyard 内的一个生成器集成。

**注意**：
- buckyball-as-a-lib 仅针对特定的发布版本进行维护。

> 我们不为此版本提供支持，因为它不是稳定版本。 -->


## 教程
您可以从[这里](https://github.com/DangoSys/buckyball/blob/main/docs/bb-note/src/tutorial/tutorial.md)开始学习 ball 和 blink。

## 额外资源

您可以从 [DeepWiki](https://deepwiki.com/DangoSys/buckyball) 和 [Zread](https://zread.ai/DangoSys/buckyball) 了解更多信息。

## 贡献者
感谢您考虑为 buckyball 做出贡献！

<a href="https://github.com/DangoSys/buckyball/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=DangoSys/buckyball" />
</a>
