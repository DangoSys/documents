<p align="center">
    <img src="https://raw.githubusercontent.com/DangoSys/documents/refs/heads/main/content/zh/images/logo.png" width = "100%" height = "70%">
</p>

## What is Buckyball

Buckyball is a scalable framework for Domain Specific Architecture, built on RISC-V architecture and optimized for high-performance computing and machine learning accelerator design.

The buckyball framework provides a complete hardware design, simulation verification, and software development toolchain, supporting the full development process from RTL design to system-level verification. The framework adopts a modular design that supports flexible configuration and extension, suitable for various specialized computing scenarios.

## Quick Start

### Installation in Nix
We use Nix Flake as our main build system. If you have not installed nix, install it following the [guide](https://nix.dev/manual/nix/2.28/installation/installing-binary.html), and enable flake following the [wiki](https://nixos.wiki/wiki/Flakes#Enable_flakes). Or you can try the [installer](https://github.com/DeterminateSystems/nix-installer) provided by Determinate Systems, which enables flake by default.


**1. Clone Repository**

```bash
git clone https://github.com/DangoSys/buckyball.git
```

**2. Initialize Environment**
```bash
cd buckyball
./scripts/nix/build-all.sh
```

After the first time installation, you can enter the environment anytime by running:

```bash
nix develop
```

**3. Verify Installation**

Run Verilator simulation test to verify installation:
```bash
bbdev verilator --run '--jobs 16 --binary ctest_vecunit_matmul_ones_singlecore-baremetal --config sims.verilator.BuckyballToyVerilatorConfig --batch'
```


<!-- ### Buckyball as a library
  We support providing a streamlined version of buckyball installation, integrated as a generator within Chipyard.

**Notice**:
- buckyball-as-a-lib are maintained only for specific release versions.

> We do not provide support for this version as it is not a stable release. -->


## Tutorial
You can start to learn ball and blink from [here](https://github.com/DangoSys/buckyball/blob/main/docs/bb-note/src/tutorial/tutorial.md)

## Additional Resources

You can learn more from [DeepWiki](https://deepwiki.com/DangoSys/buckyball) and [Zread](https://zread.ai/DangoSys/buckyball)


## Contributors
Thank you for considering contributing to buckyball!

<a href="https://github.com/DangoSys/buckyball/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=DangoSys/buckyball" />
</a>
