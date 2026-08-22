.PHONY: all build clean test install uninstall help

# =============================================================================
# Elyxion CLI - Build System using CMake
# =============================================================================

# Default build type
BUILD_TYPE ?= Release

# Default target
all: build

# ---- Build Commands ----

# Build native addon using CMake
build:
	@echo "Building elyxion with CMake..."
	cmake -B build -DCMAKE_BUILD_TYPE=$(BUILD_TYPE)
	cmake --build build --config $(BUILD_TYPE)
	@echo "Build complete! Output: build/Release/elyxion.node"

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	rm -rf build/
	rm -rf CMakeFiles/
	rm -f CMakeCache.txt
	rm -f cmake_install.cmake
	rm -f Makefile
	@echo "Clean complete!"

# Full clean (includes node_modules)
distclean: clean
	rm -rf node_modules/

# ---- Test Commands ----

# Run tests
test:
	@echo "Running tests..."
	node test/basic.test.js

# Run tests with verbose output
test-verbose:
	@echo "Running tests (verbose)..."
	node test/basic.test.js --verbose

# ---- Development Commands ----

# Install npm dependencies
install:
	npm install

# Install globally via npm link
link:
	npm link

# Unlink global installation
unlink:
	npm unlink -g elyxion-cli

# Start REPL
repl:
	./bin/elyxion --repl

# Run examples
hello:
	./bin/elyxion examples/hello.js

server:
	./bin/elyxion examples/server.js

crypto:
	./bin/elyxion examples/crypto.js

fs:
	./bin/elyxion examples/fs.js

timers:
	./bin/elyxion examples/timers.js

# ---- Package Manager Commands ----

# Initialize a new package
init:
	./bin/elyx init

# Install package via elyx
elyx-install:
	./bin/elyx install $(PKG)

# Publish package via elyx
elyx-publish:
	./bin/elyx publish

# Login to registry
elyx-login:
	./bin/elyx login

# ---- Docker Commands ----

# Build Docker image
docker-build:
	docker build -t elyxion-cli .

# Run in Docker
docker-run:
	docker run --rm elyxion-cli elyxion --version

# Start Docker Compose
docker-up:
	docker-compose up -d

# Stop Docker Compose
docker-down:
	docker-compose down

# ---- Code Quality Commands ----

# Format JavaScript files
format:
	find lib/ -name "*.js" -exec prettier --write {} \; 2>/dev/null || echo "prettier not installed"

# Lint JavaScript files
lint:
	@echo "Checking JavaScript syntax..."
	find lib/ -name "*.js" -exec node --check {} \;
	@echo "Syntax check passed!"

# Check C++ syntax (requires clang-tidy)
lint-cpp:
	@echo "Checking C++ syntax..."
	clang-tidy src/core/*.cc src/loop/*.cc -- -std=c++17 2>/dev/null || echo "clang-tidy not available"

# ---- Documentation Commands ----

# Generate documentation
docs:
	@echo "Documentation generation not implemented yet"

# Show help
help:
	@echo ""
	@echo "╔══════════════════════════════════════════════════════════╗"
	@echo "║            Elyxion CLI - Build System                   ║"
	@echo "╠══════════════════════════════════════════════════════════╣"
	@echo "║                                                          ║"
	@echo "║  Build Commands:                                         ║"
	@echo "║    make build          Build native addon (CMake)       ║"
	@echo "║    make clean          Clean build artifacts            ║"
	@echo "║    make distclean      Clean everything                 ║"
	@echo "║    make test           Run tests                        ║"
	@echo "║                                                          ║"
	@echo "║  Development:                                            ║"
	@echo "║    make repl           Start REPL                       ║"
	@echo "║    make hello          Run hello example                ║"
	@echo "║    make server         Run server example               ║"
	@echo "║    make crypto         Run crypto example               ║"
	@echo "║    make fs             Run fs example                   ║"
	@echo "║    make timers         Run timers example               ║"
	@echo "║                                                          ║"
	@echo "║  Package Manager:                                        ║"
	@echo "║    make init           Initialize new package           ║"
	@echo "║    make elyx-install PKG=<name>  Install package        ║"
	@echo "║    make elyx-publish   Publish package                  ║"
	@echo "║    make elyx-login     Login to registry                ║"
	@echo "║                                                          ║"
	@echo "║  Docker:                                                 ║"
	@echo "║    make docker-build   Build Docker image               ║"
	@echo "║    make docker-run     Run in Docker                    ║"
	@echo "║    make docker-up      Start Docker Compose             ║"
	@echo "║    make docker-down    Stop Docker Compose              ║"
	@echo "║                                                          ║"
	@echo "║  Options:                                                ║"
	@echo "║    BUILD_TYPE=Debug make build  Build with debug info   ║"
	@echo "║                                                          ║"
	@echo "╚══════════════════════════════════════════════════════════╝"
	@echo ""
