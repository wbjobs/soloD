# Dependency Security Scanner

A multi-language dependency security scanning command-line tool built with Rust.

## Features

- **Multi-package manager support**:
  - npm (package.json, package-lock.json)
  - pip (requirements.txt, Pipfile, pyproject.toml)
  - Maven (pom.xml)
  - Go modules (go.mod)

- **Vulnerability data sources**:
  - OSV (Open Source Vulnerabilities)
  - NVD (National Vulnerability Database)

- **Multiple output formats**:
  - Text (console output)
  - JSON (machine-readable)
  - HTML (visual report)

- **Configuration options**:
  - Ignore specific vulnerabilities
  - Configure scan depth
  - Enable/disable data sources

## Installation

### Prerequisites

- Rust 1.70 or higher

### Build from source

```bash
# Clone the repository
git clone <repository-url>
cd dep-scanner

# Build in release mode
cargo build --release

# The binary will be available at target/release/dep-scanner
```

## Cross-Platform Compilation

### Linux (from Windows)

```bash
# Install Linux target
rustup target add x86_64-unknown-linux-gnu

# Install cross-compilation toolchain (using cross)
cargo install cross
cross build --release --target x86_64-unknown-linux-gnu
```

### macOS (from Windows)

```bash
# Install macOS target
rustup target add x86_64-apple-darwin

# Note: macOS cross-compilation from Windows requires additional setup
# Consider using a macOS CI/CD environment or cross tool
```

### Windows (native)

```bash
cargo build --release
```

## Usage

### Basic scan

```bash
# Scan current directory
dep-scanner

# Scan a specific directory
dep-scanner --path /path/to/project
```

### Output formats

```bash
# Text output (default)
dep-scanner --format text

# JSON output
dep-scanner --format json --output report.json

# HTML output
dep-scanner --format html --output report.html
```

### Configuration options

```bash
# Ignore specific vulnerabilities
dep-scanner --ignore CVE-2023-1234 --ignore GHSA-5678

# Set scan depth (default: 3)
dep-scanner --depth 5

# Disable specific data sources
dep-scanner --no-nvd --no-osv
```

### Configuration file

Create a `.dep-scanner.yaml` file:

```yaml
ignore:
  - CVE-2023-1234
  - GHSA-5678
depth: 5
```

Use the config file:

```bash
dep-scanner --config .dep-scanner.yaml
```

## Command Line Options

```
Usage: dep-scanner [OPTIONS]

Options:
  -p, --path <PATH>          Path to scan [default: .]
  -f, --format <FORMAT>      Output format [default: text] [possible values: text, json, html]
  -o, --output <OUTPUT>      Output file path
      --ignore <IGNORE>      Vulnerability IDs to ignore
      --depth <DEPTH>        Directory scan depth [default: 3]
      --nvd                  Enable NVD source [default: true]
      --osv                  Enable OSV source [default: true]
      --config <CONFIG>      Path to config file
  -h, --help                 Print help
  -V, --version              Print version
```

## Examples

### Scan a Node.js project

```bash
dep-scanner --path /path/to/node-app --format html --output report.html
```

### Scan a Python project with ignored vulnerabilities

```bash
dep-scanner --path /path/to/python-app --ignore CVE-2023-1234 --ignore CVE-2023-5678
```

### Scan a Go project with deep recursion

```bash
dep-scanner --path /path/to/go-app --depth 10 --format json --output results.json
```

## Project Structure

```
dep-scanner/
├── src/
│   ├── main.rs          # Entry point
│   ├── cli.rs           # Command-line interface
│   ├── config.rs        # Configuration handling
│   ├── models.rs        # Data structures
│   ├── parsers.rs       # Dependency file parsers
│   ├── scanners.rs      # Vulnerability scanning logic
│   └── reporters.rs     # Report generators
├── Cargo.toml
└── README.md
```

## License

MIT
