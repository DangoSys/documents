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
- C/C++ compiler for software
- Test frameworks and dependencies
- Pre-commit hooks

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
4. Install bebop (simulation framework)
5. Pre-compile test workloads
6. Build waveform-mcp module
7. Install pre-commit hooks

**Options:**

```bash
# Skip specific steps
./scripts/nix/build-all.sh --skip 2 --skip 5

# Verbose output
./scripts/nix/build-all.sh --verbose

# Install dependencies in Nix store (default)
./scripts/nix/build-all.sh --install-in-nix
```

## bbdev Tool

`bbdev` is the primary interface for hardware simulation and build management in Buckyball.

### Basic Usage

```bash
bbdev <command> [options]
```

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
- Custom configs: Define in Scala configuration files

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

## Recent Changes

- **bbdev updates**: Improved tool performance and added new simulation options
- **Build system**: Enhanced CMake support for workload compilation
- **Nix setup**: Added Yosys and OpenSTA for optional synthesis flows
- **Test framework**: Updated sardine framework for new simulation semantics

## See Also

- [Verilator Simulation and CI](Verilator%20Simulation%20and%20CI.md)
- [GemminiBall Architecture](GemminiBall%20Architecture.md)
- [Buckyball ISA Documentation](../Overview/Buckyball%20ISA.md)
