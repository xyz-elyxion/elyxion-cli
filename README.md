# Elyxion CLI

Elyxion is a standalone JavaScript runtime and package manager built with V8 and libuv.
The distributed commands are native executables or native-executable launchers. Running Elyxion does not require Node.js, npm, node-gyp, or a `node_modules` directory.

## Requirements

Runtime distributions need only the files shipped in the release archive and the platform's normal C/C++ runtime libraries.

Building from source requires:

- CMake 3.15 or newer
- A C++17 compiler
- A standalone V8 SDK containing `include/v8.h` and `v8_monolith`
- libuv, or network access so CMake can download and build libuv

The V8 SDK is deliberately separate from Node.js. Set its location with `-DV8_DIR=/path/to/v8-sdk`.

## Build

```bash
cmake -B build \
  -DCMAKE_BUILD_TYPE=Release \
  -DV8_DIR=/path/to/standalone-v8-sdk
cmake --build build --config Release
```

Or:

```bash
V8_DIR=/path/to/standalone-v8-sdk make build
```
The executable is written to `build/elyxion`. CMake copies the JavaScript runtime to `build/runtime/lib`.

To install the runtime and commands:

```bash
cmake --install build --prefix /usr/local
```

This installs `elyxion`, `elyx`, and the bundled runtime files. On Windows, use the generated `elyxion.exe` and `elyx.cmd` launchers.

## Usage

```bash
elyxion script.js
elyxion --eval "console.log('Hello, World!')"
elyxion --repl
elyx install example-package
```

The package manager command is `elyx`; it dispatches to the same standalone executable:

```bash
elyx init
elyx install lodash
elyx list
elyx search http
elyx login
elyx publish --dry-run
```

## CLI Options

| Option | Description |
| --- | --- |
| `-e`, `--eval <code>` | Evaluate JavaScript |
| `-p`, `--print <code>` | Evaluate and print a result |
| `-i`, `--interactive` | Start the REPL |
| `-v`, `--version` | Print the runtime version |
| `-h`, `--help` | Print help |
| `-r`, `--require <module>` | Load a module before the script |

## Built-in Modules

The runtime includes JavaScript implementations for `events`, `stream`, `buffer`, `path`, `fs`, `http`, `net`, `crypto`, `os`, `url`, `util`, `child_process`, and related compatibility modules.

## Project Files

- `src/`: native V8 and libuv runtime
- `lib/`: bundled JavaScript runtime and package manager
- `bin/`: platform launchers for `elyxion` and `elyx`
- `cmake/FindV8.cmake`: standalone V8 SDK discovery
- `examples/`: example programs
- `test/`: JavaScript test sources

`package.json` is a user-project format created by `elyx init`; it is not a dependency of the Elyxion source tree and is not used to build or run Elyxion.

## GitHub Actions

The repository uses three Actions workflows:

- `V8 SDK Release` clones `https://chromium.googlesource.com/v8/v8` on Linux, macOS, and Windows, builds the monolithic SDK, removes source-only content by packaging only `include/` and the library, and publishes the three SDK archives to the `v8-sdk-12.2.281.28` release.
- `Build` downloads those SDK release assets and uploads native Linux, macOS, and Windows build artifacts.
- `Release` downloads those same SDK assets when a `v*` tag is pushed, then publishes executable archives.

Run `V8 SDK Release` manually once before running `Build` or pushing an application release. It requires no SDK URL environment variables. Its optional inputs are the V8 version and SDK release tag. The V8 checkout stays on the runner; `.git`, source files, and build objects are not included in the SDK archives.

## Development

```bash
make help
make build V8_DIR=/path/to/standalone-v8-sdk
make test V8_DIR=/path/to/standalone-v8-sdk
make clean
```

## License

MIT License. See [LICENSE](LICENSE).
