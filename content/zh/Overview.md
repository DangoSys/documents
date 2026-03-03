<p align="center">
    <img src="https://raw.githubusercontent.com/DangoSys/documents/refs/heads/main/content/zh/images/logo.png" width = "100%" height = "70%">
</p>

<div align="center" style="margin-top: -10pt;">

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/DangoSys/buckyball)
[![zread](https://img.shields.io/badge/Ask_Zread-_.svg?style=flat&color=00b0aa&labelColor=000000&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTQuOTYxNTYgMS42MDAxSDIuMjQxNTZDMS44ODgxIDEuNjAwMSAxLjYwMTU2IDEuODg2NjQgMS42MDE1NiAyLjI0MDFWNC45NjAxQzEuNjAxNTYgNS4zMTM1NiAxLjg4ODEgNS42MDAxIDIuMjQxNTYgNS42MDAxSDQuOTYxNTZDNS4zMTUwMiA1LjYwMDEgNS42MDE1NiA1LjMxMzU2IDUuNjAxNTYgNC45NjAxVjIuMjQwMUM1LjYwMTU2IDEuODg2NjQgNS4zMTUwMiAxLjYwMDEgNC45NjE1NiAxLjYwMDFaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik00Ljk2MTU2IDEwLjM5OTlIMi4yNDE1NkMxLjg4ODEgMTAuMzk5OSAxLjYwMTU2IDEwLjY4NjQgMS42MDE1NiAxMS4wMzk5VjEzLjc1OTlDMS42MDE1NiAxNC4xMTM0IDEuODg4MSAxNC4zOTk5IDIuMjQxNTYgMTQuMzk5OUg0Ljk2MTU2QzUuMzE1MDIgMTQuMzk5OSA1LjYwMTU2IDE0LjExMzQgNS42MDE1NiAxMy43NTk5VjExLjAzOTlDNS42MDE1NiAxMC42ODY0IDUuMzE1MDIgMTAuMzk5OSA0Ljk2MTU2IDEwLjM5OTlaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik0xMy43NTg0IDEuNjAwMUgxMS4wMzg0QzEwLjY4NSAxLjYwMDEgMTAuMzk4NCAxLjg4NjY0IDEwLjM5ODQgMi4yNDAxVjQuOTYwMUMxMC4zOTg0IDUuMzEzNTYgMTAuNjg1IDUuNjAwMSAxMS4wMzg0IDUuNjAwMUgxMy43NTg0QzE0LjExMTkgNS42MDAxIDE0LjM5ODQgNS4zMTM1NiAxNC4zOTg0IDQuOTYwMVYyLjI0MDFDMTQuMzk4NCAxLjg4NjY0IDE0LjExMTkgMS42MDAxIDEzLjc1ODQgMS42MDAxWiIgZmlsbD0iI2ZmZiIvPgo8cGF0aCBkPSJNNCAxMkwxMiA0TDQgMTJaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik00IDEyTDEyIDQiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8L3N2Zz4K&logoColor=ffffff)](https://zread.ai/DangoSys/buckyball)
[![Document](https://github.com/DangoSys/buckyball/actions/workflows/doc.yml/badge.svg?branch=main)](https://dangosys.github.io/buckyball)
[![buckyball CI](https://github.com/DangoSys/buckyball/actions/workflows/test.yml/badge.svg)](https://github.com/DangoSys/buckyball/actions/workflows/test.yml)

</div>

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
