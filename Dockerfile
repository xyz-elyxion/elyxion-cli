# =============================================================================
# Elyxion CLI - Multi-stage Docker Build
# Uses CMake instead of node-gyp for native compilation
# =============================================================================

# ---- Builder Stage ----
FROM node:22-slim AS builder

# Install build dependencies (cmake, compiler, curl for headers)
RUN apt-get update && apt-get install -y \
    cmake \
    g++ \
    make \
    curl \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first (for layer caching)
COPY package.json package-lock.json ./

# Install JavaScript dependencies (no native builds needed)
RUN npm install --ignore-scripts

# Copy source code
COPY CMakeLists.txt ./
COPY src/ ./src/
COPY lib/ ./lib/
COPY bin/ ./bin/
COPY test/ ./test/
COPY examples/ ./examples/
COPY package.json package-lock.json ./

# Build with CMake (no node-gyp needed!)
RUN cmake -B build -DCMAKE_BUILD_TYPE=Release \
    && cmake --build build --config Release

# Verify build succeeded
RUN ls -la build/Release/elyxion.node 2>/dev/null || \
    ls -la build/elyxion.node 2>/dev/null || \
    (echo "Build failed - .node file not found" && exit 1)

# Run tests
RUN node test/basic.test.js

# ---- Production Stage ----
FROM node:22-slim AS production

# Install minimal runtime dependencies
RUN apt-get update && apt-get install -y \
    libstdc++6 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built addon and JavaScript files
COPY --from=builder /app/build/Release/elyxion.node ./build/Release/ 2>/dev/null || true
COPY --from=builder /app/build/elyxion.node ./build/ 2>/dev/null || true
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/bin ./bin
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./
COPY --from=builder /app/examples ./examples

# Make binaries executable
RUN chmod +x bin/*

# Set PATH
ENV PATH="/app/bin:${PATH}"

# Verify installation
RUN node bin/elyxion --version

# Default command
CMD ["node", "bin/elyxion", "--version"]
