# Elyxion CLI

Elyxion is a standalone JavaScript runtime and package manager built with V8 and libuv.
The distributed commands are native executables or native-executable launchers. Running Elyxion does not require Node.js, npm, node-gyp, or a `node_modules` directory.

## Quick Install

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/xyz-elyxion/elyxion-cli/main/scripts/install.sh | bash
```

```powershell
# Windows (PowerShell)
iwr -useb https://raw.githubusercontent.com/xyz-elyxion/elyxion-cli/main/scripts/install.ps1 | iex
```

After installing, restart your terminal — then `elyxion` and `elyx` are available globally:

```bash
elyxion --version
elyxion --repl
elyx init
elyx install <package>
```

To pin a specific version:

```bash
ELYXION_VERSION=v1.1.0 curl -fsSL https://raw.githubusercontent.com/xyz-elyxion/elyxion-cli/main/scripts/install.sh | bash
```

The installer defaults to a pinned, known-good release (`v1.1.0`) instead of `latest`, so a stale or broken tagged binary is never silently installed.

## Manual Download

Download the latest archive from [GitHub Releases](https://github.com/xyz-elyxion/elyxion-cli/releases), extract it, and add the `bin/` directory to your PATH.

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

## Package Registry

The Elyxion registry is hosted at **https://xyz-elyxion.onrender.com** — the `site/` folder in this repo is the server. It serves the marketing site *and* the registry API: accounts, tokens, package metadata, and search all live there. It runs on the Elyxion runtime itself (native TCP + fs — no Node.js, no Python).

Create an account (or log in):

```bash
elyx login
```

Publish a package from a folder with a `package.json`:

```bash
elyx init        # or write package.json yourself
elyx publish
```

Search and install:

```bash
elyx search http
elyx install <package>
elyx logout
```

### Registry API

| Method | Route | Description |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Create an account `{ username, password }` → token |
| `POST` | `/api/auth/login` | Log in `{ username, password }` → token |
| `POST` | `/api/auth/logout` | Invalidate the token |
| `GET` | `/api/auth/me` | Current user info (Bearer token) |
| `GET` | `/api/packages` | List all packages |
| `GET` | `/api/packages/:name` | Package metadata (all versions) |
| `GET` | `/api/packages/:name/:version` | Single version metadata |
| `POST` | `/api/packages` | Publish `{ package, readme? }` (Bearer token) |
| `DELETE` | `/api/packages/:name/:version` | Unpublish a version (owner only) |
| `GET` | `/api/search?q=` | Search packages |
| `GET` | `/api/stats` | Package/user counts |
| `GET` | `/health` | Health check |

Use a different registry:

```bash
elyx config set registry https://your-registry.example.com
```

### Running the registry server

```bash
elyxion site/build.js         # build the static site into dist/
elyxion site/server.js        # serve site + registry API on :3000
```

`DATA_DIR` (default `site/data/`) holds `users.json`, `tokens.json`, and `packages.json`. Set `PUBLIC_URL` to the public base URL used in package metadata.

The server is self-contained — deploy `site/` anywhere that can run the Elyxion binary (a VPS, a container, or a host like Render/Fly/Railway). Point the CLI at it with `elyx config set registry <url>`.

## CLI Options

| Option | Description |
| --- | --- |
| `-e`, `--eval <code>` | Evaluate JavaScript |
| `-p`, `--print <code>` | Evaluate and print a result |
| `-i`, `--interactive` | Start the REPL |
| `-v`, `--version` | Print the runtime version |
| `-h`, `--help` | Print help |
| `-r`, `--require <module>` | Load a module before the script |
| `--upgrade`, `--update` | Check for updates and install the latest version |

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
