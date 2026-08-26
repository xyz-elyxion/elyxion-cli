# Changelog

All notable changes to Elyxion CLI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-08-25

### Fixed
- `net`/`tcp` now bind real sockets: `require('net').createServer(...).listen(port)`
  uses the native `__elyxion_tcp_*` libuv bindings instead of simulating a listen.
- `setTimeout`/`setInterval` are wired into `uv_timer`, so timers actually fire and
  keep the event loop alive (the process no longer exits while a server or timer
  is pending).
- `http.ServerResponse` now writes the response to the client socket, so
  `http.createServer(...).listen(port)` actually serves responses (`res.write`/`res.end`
  previously only accumulated the body and never sent bytes).
- `process` is now an EventEmitter, so `process.on('SIGINT', ...)` and other process
  event APIs work instead of throwing `process.on is not a function`.

### Changed
- The installer now pins a known-good release (`v1.1.0`) instead of defaulting to
  `latest`, so a stale or broken tagged binary is never silently installed.

## [1.0.0] - 2026-08-22

### Added

#### Runtime
- Initial release of Elyxion JavaScript runtime
- V8 engine integration for JavaScript execution
- libuv event loop for async I/O
- Native C++ bindings for performance

#### Core Modules
- `events` - Event emitter implementation
- `stream` - Readable, Writable, Transform streams
- `buffer` - Binary data handling
- `path` - Path utilities (cross-platform)
- `fs` - File system operations (async/sync)
- `net` - TCP networking
- `http` - HTTP client and server
- `crypto` - Cryptographic functions
- `os` - Operating system information
- `url` - URL parsing and utilities
- `util` - Utility functions
- `child_process` - Child process spawning

#### CLI
- Command-line interface for running scripts
- REPL (Read-Eval-Print Loop) with history
- Script execution via `elyxion script.js`
- Code evaluation via `elyxion -e "code"`
- Stdin support for piping code

#### Package Manager (elyx)
- Custom package manager using GitHub as registry
- Package installation from https://github.com/xyz-elyxion/packages
- Package publishing with GitHub authentication
- Package search functionality
- Configuration management
- Lock file support

### Commands
- `elyxion` - Main runtime CLI
- `elyx` - Package manager CLI

### Built-in Commands
- `elyx init` - Initialize new package
- `elyx install` / `elyx i` / `elyx add` - Install packages
- `elyx uninstall` / `elyx rm` - Remove packages
- `elyx update` / `elyx upgrade` - Update packages
- `elyx list` / `elyx ls` - List installed packages
- `elyx search` / `elyx find` - Search packages
- `elyx publish` / `elyx pub` - Publish packages
- `elyx login` - Authenticate with GitHub
- `elyx config` - Manage configuration

### Examples
- Hello World example
- HTTP server example
- File system operations example
- Timers and async example
- Crypto operations example

### Documentation
- Comprehensive README with usage examples
- Contributing guide (CONTRIBUTING.md)
- This changelog (CHANGELOG.md)
- Example scripts in examples/ directory

### Testing
- Basic test suite with assertions
- Event emitter tests
- Path module tests
- Util module tests

## [Unreleased]

### Planned Features
- Worker threads support
- Cluster mode for multi-core processing
- DNS resolution module
- TLS/SSL support
- Module hot reloading
- Debugger integration
- Profiler support
- Coverage reporting
- Package auditing
- Package signing
- Private registries
- Workspace support
- Monorepo support

### Known Limitations
- Some fs operations are stubs (awaiting native implementation)
- Crypto module uses simplified implementations
- HTTP server is basic (no keep-alive, etc.)
- Package manager requires GitHub authentication for publishing
- The package manager uses the custom GitHub-based registry and is independent of npm

---

## Version History

- **1.1.0** - Real TCP sockets and working timers
- **1.0.0** - Initial release with core runtime and package manager
- **0.x.x** - Pre-release development versions

---

## Release Process

1. Update the version constants in the native runtime and release metadata
2. Update `CHANGELOG.md` with new version
3. Create git tag: `git tag v1.1.0`
4. Push changes: `git push && git push --tags`
5. Create GitHub release with changelog

---

## Links

- [Repository](https://github.com/xyz-elyxion/elyxion-cli)
- [Package Registry](https://github.com/xyz-elyxion/packages)
- [Issues](https://github.com/xyz-elyxion/elyxion-cli/issues)
