# Development Workflow and Build System

## Overview

Buckyball provides a streamlined development environment using Nix Flakes, with tools like `bbdev` for managing hardware simulation, compilation, and testing. This guide covers the build system, common workflows, and troubleshooting.

## Initial Setup

### Using Nix Flakes

Nix Flakes provides reproducible development environments with all required tools:

```bash
# Install Nix (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh

# Enable Flakes (if not enabled by default)
nix flake update
```

### Entering the Development Environment

```bash
nix develop
```

This command sets up:
- Scala/Chisel RTL development tools
- Verilator for hardware simulation
- Rust toolchain for code generation and utilities
- C/C++ compiler for software
- RISC-V ISA simulator (Spike)
- Device tree compiler (dtc)
- CMake for cross-platform builds
- Test frameworks and dependencies
- Pre-commit hooks
- System utilities (rsync for deployment, Node.js for documentation generation)

### Full Repository Initialization

The `build-all.sh` script automates the complete setup process:

```bash
cd buckyball
./scripts/nix/build-all.sh
```

**Setup Steps** (can be skipped with `--skip N`):

1. Install bbdev
2. Compile the compiler toolchain
3. Pre-compile RTL sources
4. Pre-compile test workloads
5. Build waveform-mcp module
6. Install pre-commit hooks

**Options:**

```bash
# Skip specific steps
./scripts/nix/build-all.sh --skip 2 --skip 4

# Verbose output
./scripts/nix/build-all.sh --verbose

# Install dependencies in Nix store (default)
./scripts/nix/build-all.sh --install-in-nix
```

## bbdev Tool

`bbdev` is the primary interface for hardware simulation and build management in Buckyball. It supports multiple simulation backends and provides unified access to tools for compilation and testing.

### Basic Usage

```bash
bbdev <command> [options]
```

### Available Backends

`bbdev` abstracts different simulation and build backends:

- **Verilator**: Fast open-source RTL simulator for verification
- **Spike**: RISC-V functional simulator for Bebop cosimulation verification
- **Compiler**: MLIR-based toolchain for hardware code generation

Recent updates to `bbdev` include improved Python-based integration with the `iii` toolset and enhanced test orchestration via the `sardine` framework.

### Verilator Simulation

Run RTL simulations using the Verilator backend:

```bash
# Basic simulation run
bbdev verilator --run '<simulation-options>'

# Common simulation options
bbdev verilator --run \
  '--jobs 16 \
    --binary <workload-name> \
    --config sims.verilator.BuckyballToyVerilatorConfig \
    --batch'
```

**Workload Examples:**

- `ctest_vecunit_matmul_ones_singlecore-baremetal`: Single-core matrix multiplication test
- `ctest_toy_add-baremetal`: Toy vector add test
- Model tests: `ModelTest-<model>` (e.g., `ModelTest-LeNet`)

### Simulation Configuration

Available configurations in `sims/verilator/`:

- `BuckyballToyVerilatorConfig`: Single-core configuration for unit testing
- `BuckyballGobanVerilatorConfig`: Multi-core configuration (1 tile, 4 cores) with shared accelerators
- `BuckyballGoban2TileVerilatorConfig`: Multi-tile configuration (2 tiles, 8 cores) for SPMD workloads
- `BebopSpikeVerilatorCosimConfig`: Bebop vector accelerator with Spike coupling
- Custom configs: Define in Scala configuration files

**Multi-core Simulation:**

For Goban-based configurations, workloads must implement SPMD patterns with hardware barrier synchronization:

```bash
# Run Goban multi-core test
bbdev verilator --run \
  '--binary barrier_test-baremetal \
    --config sims.verilator.BuckyballGobanVerilatorConfig \
    --batch'
```

**Bebop Vector Accelerator:**

Run Bebop cosimulation tests using Spike coupling:

```bash
bbdev verilator --run \
  '--jobs 16 \
    --binary ctest_bebop_cosim_matmul \
    --config sims.bebop.BebopSpikeVerilatorCosimConfig \
    --batch'
```

See [Bebop Spike-Verilator Cosimulation](../Architecture/Bebop%20Spike-Verilator%20Cosimulation.md) for detailed Bebop verification.

## Build Tools and Dependencies

### Core Tools

Recent Buckyball releases include new build and simulation tools in the Nix development environment:

| Tool | Purpose | Version |
|------|---------|---------|
| Spike | RISC-V ISA simulator | Latest |
| CMake | Build configuration | 3.28+ |
| Device Tree Compiler (dtc) | Device tree processing | 1.7+ |
| Java (OpenJDK) | Java-based tools (compiler backends) | 17+ |

These tools are automatically available when entering `nix develop`.

### Configuration and Build

To rebuild Spike or regenerate device trees:

```bash
# Rebuild Spike simulator
nix develop --command -- which spike

# Device tree compilation example
nix develop --command -- dtc -I dts -O dtb my_design.dts -o my_design.dtb
```

## Simulation Configuration

## Code Organization

### Directory Structure

```
buckyball/
├── arch/                    # RTL design (Chisel/Scala)
│   ├── src/main/scala/
│   │   ├── examples/        # Reference designs
│   │   ├── framework/       # Core framework
│   │   └── sims/            # Simulation harness
│   └── tests/               # RTL unit tests
├── bb-tests/                # Software workloads and tests
│   ├── workloads/src/       # Test applications
│   │   ├── ModelTest/       # ML model inference tests
│   │   ├── OpTest/          # Operation tests
│   │   └── custom/          # User-defined workloads
│   └── sardine/             # Test framework
├── compiler/                # MLIR-based compiler
├── frontend/                # Software framework
├── backend/                 # System support libraries
└── scripts/                 # Build and utility scripts
```

### Key Subsystems

| Subsystem | Purpose |
|-----------|---------|
| `framework.balldomain` | Accelerator module (Ball) framework |
| `framework.top.GlobalConfig` | System-wide configuration |
| `sims.verilator` | Verilator simulation harness |
| `bb-tests.sardine` | Test orchestration |
| `bbAgent` | Software agent/orchestration |

## Common Development Tasks

### Modifying RTL

1. Edit Chisel files in `arch/src/main/scala/`
2. Rebuild simulations:
   ```bash
   cd arch
   mill arch.test  # Run unit tests
   ```
3. Verify with Verilator simulation

### Adding Custom Test Workload

1. Create source files in `bb-tests/workloads/src/<category>/`
2. Add CMakeLists.txt if needed
3. Update test configuration in `sardine/` if using test framework
4. Run with `bbdev verilator --run '--binary <workload-name> ...'`

### Debugging Simulations

**Enable waveform capture:**

```bash
bbdev verilator --run '--vcd out.vcd --binary <workload> --batch'
```

**Open waveforms:**

```bash
gtkwave out.vcd &
```

**Trace specific signals:**
- Add `dontTouch` or `debug` annotations in Chisel
- Verify signal names in generated RTL

## Testing and Validation

### Unit Tests

RTL unit tests:

```bash
cd arch
mill arch.test
```

### Integration Tests

Full system tests using Verilator:

```bash
./scripts/nix/test-suite.sh  # Run full test suite (if available)
```

### Coverage-Driven Testing

Enable coverage tracking (if supported):

```bash
bbdev verilator --run '--coverage --binary <test> --batch'
```

## Continuous Integration

### Pre-commit Hooks

Installed hooks validate:
- Code formatting
- Lint checks (Scala, C++)
- CMake syntax

```bash
# Manual pre-commit check
pre-commit run --all-files
```

### CI Workflows

GitHub Actions workflows (`.github/workflows/`):
- `test.yml`: Runs Verilator tests on push
- `lint.yml`: Code quality checks
- `build.yml`: Compiler and RTL builds

## Troubleshooting

### Build Issues

| Problem | Solution |
|---------|----------|
| `nix develop` fails | Update flake: `nix flake update` |
| Scala compilation errors | Ensure `mill` is up-to-date: `mill --version` |
| Missing dependencies | Run `./scripts/nix/build-all.sh` again |

### Simulation Issues

| Problem | Solution |
|---------|----------|
| Test timeout | Reduce workload size or increase timeout |
| Out-of-memory | Check workload data size, reduce test scale |
| Incorrect results | Enable waveform capture for debugging |

### Environment Issues

```bash
# Reset environment
rm -rf .mill-cache
nix flake update
nix develop --impure
```

## See Also

- [Verilator Simulation and CI](Verilator%20Simulation%20and%20CI.md)
- [Bebop Spike-Verilator Cosimulation](../Architecture/Bebop%20Spike-Verilator%20Cosimulation.md)
- [Vector Computation Support](../Architecture/Vector%20Computation%20Support.md)
- [GemminiBall Architecture](../Architecture/GemminiBall%20Architecture.md)
- [Buckyball ISA Documentation](../Overview/Buckyball%20ISA.md)
- [Frontend Instruction Scheduling and Bank Aliasing](Frontend%20Instruction%20Scheduling%20and%20Bank%20Aliasing.md)
- [Execution Tracing and Performance Analysis](Execution%20Tracing%20and%20Performance%20Analysis.md)
