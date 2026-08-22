# Elyxion CLI

A high-performance JavaScript runtime built on V8 and libuv, with a custom package manager.

## Features

- **Fast Execution**: Built on V8 JavaScript engine for fast JS execution
- **Async I/O**: Non-blocking I/O powered by libuv
- **Rich Standard Library**: Includes fs, path, http, net, crypto, and more
- **REPL**: Interactive command-line interface for experimentation
- **Custom Package Manager**: `elyx` - publish and install packages from GitHub

## Installation

```bash
# Install dependencies
npm install

# Build with CMake (no node-gyp required!)
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release

# Or use make
make build

# Or link globally
npm link
```

## Usage

### Running Scripts

```bash
elyxion script.js
elyxion --eval "console.log('Hello, World!')"
elyxion -e "console.log('Hello!')"
```

### Interactive REPL

```bash
elyxion --repl
elyxion -i
```

### REPL Commands

| Command | Description |
|---------|-------------|
| `.help` | Show available commands |
| `.exit` | Exit the REPL |
| `.clear` | Clear the context |
| `.history` | Show command history |
| `.save [file]` | Save history to file |
| `.load <file>` | Load and execute file |

## CLI Options

| Option | Description |
|--------|-------------|
| `-e, --eval <code>` | Evaluate code |
| `-p, --print <code>` | Evaluate and print result |
| `-i, --interactive` | Start REPL |
| `-v, --version` | Print version |
| `-h, --help` | Print help |
| `-r, --require <mod>` | Require module |

---

# Elyx - Package Manager

`elyx` is a custom package manager that uses GitHub as the package registry.

## Registry

- **Registry URL**: https://github.com/xyz-elyxion/packages
- **Authentication**: GitHub personal access token
- **Storage**: Packages stored directly in GitHub repository

## Quick Start

```bash
# Initialize a new package
elyx init

# Install packages
elyx install lodash
elyx install express@4.18.0

# Publish your package
elyx login
elyx publish
```

## Commands

### Package Initialization

```bash
elyx init
```

Creates a new `package.json` with interactive prompts.

### Installing Packages

```bash
elyx install lodash              # Install latest
elyx install lodash@4.17.21      # Install specific version
elyx add lodash                  # Alias for install
elyx i lodash                    # Short alias
```

### Uninstalling Packages

```bash
elyx uninstall lodash
elyx remove lodash
elyx rm lodash
```

### Updating Packages

```bash
elyx update lodash               # Update specific package
elyx update                      # Update all packages
elyx upgrade lodash              # Alias for update
```

### Listing Packages

```bash
elyx list
elyx ls
```

### Searching Packages

```bash
elyx search http
elyx search express
elyx find lodash
```

### Publishing Packages

```bash
# First, authenticate
elyx login

# Publish your package
elyx publish
elyx pub                         # Short alias

# Dry run (preview without publishing)
elyx publish --dry-run
```

### Configuration

```bash
elyx config list                 # List all config
elyx config get registry         # Get a value
elyx config set registry URL     # Set a value
```

## Package Structure

Packages are stored in the GitHub repository at:
```
https://github.com/xyz-elyxion/packages/
├── lodash/
│   └── package.json
├── express/
│   └── package.json
└── my-package/
    ├── package.json
    ├── index.js
    └── README.md
```

Each package must have:
- `package.json` with name, version, main, etc.
- Entry point file (default: `index.js`)

## Authentication

To publish packages, you need a GitHub personal access token:

1. Go to https://github.com/settings/tokens
2. Create a new token with `repo` scope
3. Run `elyx login` and enter your token

## Configuration File

Config is stored at `~/.elyx/config.json`:

```json
{
  "registry": "https://github.com/xyz-elyxion/packages",
  "token": "ghp_xxxxxxxxxxxx"
}
```

---

# Built-in Modules

## Core Modules

| Module | Description |
|--------|-------------|
| `events` | Event emitter |
| `stream` | Stream handling |
| `buffer` | Binary data |
| `util` | Utility functions |
| `path` | Path utilities |

## File System

| Module | Description |
|--------|-------------|
| `fs` | File system operations |
| `path` | Path utilities |

## Networking

| Module | Description |
|--------|-------------|
| `http` | HTTP client/server |
| `net` | TCP networking |
| `dns` | DNS resolution |
| `tls` | TLS/SSL support |

## Crypto

| Module | Description |
|--------|-------------|
| `crypto` | Cryptographic functions |

## Process

| Module | Description |
|--------|-------------|
| `child_process` | Child process spawning |
| `os` | Operating system info |

---

# Examples

## Hello World

```javascript
console.log('Hello, World!');
```

## HTTP Server

```javascript
const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hello from Elyxion!\n');
});

server.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
```

## File Operations

```javascript
const fs = require('fs');

// Read file
const data = fs.readFileSync('example.txt', 'utf-8');
console.log(data);

// Write file
fs.writeFileSync('output.txt', 'Hello from Elyxion!');
```

## Crypto

```javascript
const crypto = require('crypto');

const hash = crypto.createHash('sha256');
hash.update('Hello, World!');
console.log(hash.digest('hex'));
```

## Using Packages

```javascript
// After installing with elyx install lodash
const _ = require('lodash');

console.log(_.chunk([1, 2, 3, 4], 2));
// Output: [[1, 2], [3, 4]]
```

---

# Development

```bash
# Build with CMake (recommended)
make build

# Or use cmake directly
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release

# Run tests
make test

# Start REPL
make repl

# Run examples
make hello
make server

# Debug build
BUILD_TYPE=Debug make build
```

## Build System

Elyxion uses **CMake** instead of node-gyp for building native addons. This provides:

- ✅ Cross-platform builds (Linux, macOS, Windows)
- ✅ Automatic V8 header download
- ✅ Visual Studio auto-detection on Windows
- ✅ No dependency on node-gyp
- ✅ Support for CMake generators (Make, Ninja, Visual Studio, Xcode)

### CMake Options

| Option | Default | Description |
|--------|---------|-------------|
| `ELYXION_AUTO_DOWNLOAD` | ON | Auto-download Node.js headers |
| `ELYXION_AS_ADDON` | ON | Build as .node addon (vs standalone) |
| `NODE_VERSION` | 22.23.2 | Node.js version for V8 headers |
| `NODE_HEADERS_DIR` | (auto) | Path to V8 headers |

### Examples

```bash
# Basic build
cmake -B build
cmake --build build

# Debug build
cmake -B build -DCMAKE_BUILD_TYPE=Debug
cmake --build build

# Windows (auto-detects Visual Studio)
cmake -B build -A x64
cmake --build build --config Release

# macOS universal binary
cmake -B build -DCMAKE_OSX_ARCHITECTURES="arm64;x86_64"
cmake --build build
```

## Project Structure

```
elyxion-cli/
├── bin/
│   ├── elyxion           # Runtime CLI
│   └── elyx              # Package manager CLI
├── src/                  # C++ core
│   ├── core/            # V8 bindings
│   └── loop/            # libuv event loop
├── lib/
│   ├── index.js         # Runtime entry
│   ├── bootstrap.js     # Runtime initialization
│   ├── cli/             # CLI interface
│   ├── modules/         # Core modules
│   └── pkg/             # Package manager
├── test/                # Tests
└── examples/            # Example scripts
```

## Architecture

- **V8 Engine**: JavaScript execution
- **libuv**: Async I/O and event loop
- **C++ Bindings**: Native module integration
- **JavaScript Runtime**: Core modules and bootstrap

---

# Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License

## Acknowledgments

Inspired by Node.js and built with V8 and libuv.
