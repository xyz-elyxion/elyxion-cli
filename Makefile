.PHONY: all build clean test install uninstall publish help

# Default target
all: build

# Build the native addon
build:
	npx node-gyp rebuild

# Clean build artifacts
clean:
	npx node-gyp clean
	rm -rf build/
	rm -rf node_modules/

# Run tests
test:
	node test/basic.test.js

# Install dependencies (use npm for build tools)
install:
	npm install

# Install globally
link:
	npm link

# Unlink global installation
unlink:
	npm unlink -g elyxion-cli

# Start REPL
repl:
	./bin/elyxion --repl

# Run hello example
hello:
	./bin/elyxion examples/hello.js

# Run server example
server:
	./bin/elyxion examples/server.js

# Run crypto example
crypto:
	./bin/elyxion examples/crypto.js

# Run fs example
fs:
	./bin/elyxion examples/fs.js

# Run timers example
timers:
	./bin/elyxion examples/timers.js

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

# Docker build
docker-build:
	docker build -t elyxion-cli .

# Docker run
docker-run:
	docker run --rm elyxion-cli elyxion --version

# Docker compose up
docker-up:
	docker-compose up -d

# Docker compose down
docker-down:
	docker-compose down

# Format JavaScript
format:
	find lib/ -name "*.js" -exec prettier --write {} \;

# Lint JavaScript
lint:
	eslint lib/

# Check types
typecheck:
	tsc --noEmit

# Generate documentation
docs:
	echo "Documentation generation not implemented yet"

# Show help
help:
	@echo ""
	@echo "Elyxion CLI - Available Commands:"
	@echo ""
	@echo "Build Commands:"
	@echo "  make build          - Build native addon"
	@echo "  make clean          - Clean build artifacts"
	@echo "  make test           - Run tests"
	@echo "  make install        - Install dependencies"
	@echo ""
	@echo "Development Commands:"
	@echo "  make repl           - Start REPL"
	@echo "  make hello          - Run hello example"
	@echo "  make server         - Run server example"
	@echo "  make crypto         - Run crypto example"
	@echo "  make fs             - Run fs example"
	@echo "  make timers         - Run timers example"
	@echo ""
	@echo "Package Manager Commands:"
	@echo "  make init           - Initialize new package"
	@echo "  make elyx-install PKG=<name> - Install package"
	@echo "  make elyx-publish   - Publish package"
	@echo "  make elyx-login     - Login to registry"
	@echo ""
	@echo "Docker Commands:"
	@echo "  make docker-build   - Build Docker image"
	@echo "  make docker-run     - Run in Docker"
	@echo "  make docker-up      - Start Docker Compose"
	@echo "  make docker-down    - Stop Docker Compose"
	@echo ""
	@echo "  make help           - Show this help"
	@echo ""
