.PHONY: all build clean test install help repl hello server crypto fs timers init elyx-install elyx-publish elyx-login

BUILD_TYPE ?= Release

all: build

build:
	cmake -B build -DCMAKE_BUILD_TYPE=$(BUILD_TYPE) -DV8_DIR="$(V8_DIR)" -DLIBUV_DIR="$(LIBUV_DIR)"
	cmake --build build --config $(BUILD_TYPE)
	@echo "Build complete: build/elyxion"

clean:
	rm -rf build

install: build
	cmake --install build

# Runtime smoke tests. A V8 SDK must be supplied to CMake for the build.
test: build
	./build/elyxion --version
	./build/elyxion --help
	./build/elyxion examples/hello.js
	./build/elyxion test/basic.test.js

repl: build
	./build/elyxion --repl

hello: build
	./build/elyxion examples/hello.js

server: build
	./build/elyxion examples/server.js

crypto: build
	./build/elyxion examples/crypto.js

fs: build
	./build/elyxion examples/fs.js

timers: build
	./build/elyxion examples/timers.js

init: build
	./bin/elyx init

elyx-install: build
	./bin/elyx install $(PKG)

elyx-publish: build
	./bin/elyx publish

elyx-login: build
	./bin/elyx login

help:
	@echo "Elyxion standalone build"
	@echo "  make build       Build the native executable"
	@echo "  make install     Install elyxion and elyx"
	@echo "  make test        Run runtime smoke tests"
	@echo "  make repl        Start the REPL"
	@echo "  make hello       Run the hello example"
	@echo "  make clean       Remove build output"
	@echo ""
	@echo "Optional variables:"
	@echo "  BUILD_TYPE=Debug"
	@echo "  V8_DIR=/path/to/standalone-v8-sdk"
	@echo "  LIBUV_DIR=/path/to/libuv"
