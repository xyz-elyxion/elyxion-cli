# Contributing to Elyxion CLI

## Prerequisites

- CMake 3.15 or newer
- A C++17 compiler
- A standalone V8 SDK containing `include/v8.h` and `v8_monolith`
- libuv, or network access for CMake's libuv FetchContent fallback

Node.js, npm, node-gyp, and Python are not required by the project.

## Build and Test

```bash
cmake -B build \
  -DCMAKE_BUILD_TYPE=Debug \
  -DV8_DIR=/path/to/standalone-v8-sdk
cmake --build build --config Debug
./build/elyxion --version
./build/elyxion --help
./build/elyxion examples/hello.js
```

The same workflow is available through `make`:

```bash
V8_DIR=/path/to/standalone-v8-sdk make build
V8_DIR=/path/to/standalone-v8-sdk make test
```

## Project Structure

- `src/core/`: V8 isolate, process globals, module loader, and CLI dispatch
- `src/loop/`: libuv event-loop integration
- `lib/`: bundled JavaScript runtime and package manager implementation
- `lib/modules/`: runtime modules loaded by the native CommonJS loader
- `lib/pkg/`: `elyx` package-manager commands
- `bin/`: POSIX and Windows launchers
- `cmake/`: CMake dependency discovery
- `examples/`: example programs
- `test/`: runtime test sources

## Runtime Changes

When changing a runtime module, verify it can be loaded by the standalone executable. Keep CommonJS module behavior compatible with the native loader, including `module.exports`, `require`, `__filename`, and `__dirname`.

When changing native code, run a Debug build and the smoke tests. Add focused tests for user-visible behavior where practical.

## Pull Requests

1. Keep changes scoped to the requested behavior.
2. Update README or build instructions when the standalone contract changes.
3. Run the native build and smoke tests.
4. Describe any required V8 SDK layout or platform-specific limitation.
