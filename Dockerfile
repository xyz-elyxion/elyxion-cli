FROM node:22-slim AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Copy elyx package manager
COPY bin/ bin/
COPY lib/pkg/ lib/pkg/

# Install dependencies using elyx
RUN node bin/elyx install

# Copy source code
COPY . .

# Build native addon
RUN node-gyp rebuild

# Run tests
RUN node bin/elyxion test/basic.test.js

# Production stage
FROM node:22-slim AS production

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built files
COPY --from=builder /app/build ./build
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/bin ./bin
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./

# Make binaries executable
RUN chmod +x bin/*

# Set PATH
ENV PATH="/app/bin:${PATH}"

# Default command
CMD ["elyxion", "--version"]
