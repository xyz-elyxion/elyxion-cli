#!/usr/bin/env bash
# build-v8.sh
# Builds a standalone V8 SDK (headers + v8_monolith) for Linux/macOS.
# Mirrors scripts/build-v8.ps1 on Windows.
# Caches the checkout and build output for fast repeat runs.
#
# Usage:
#   ./scripts/build-v8.sh -v 12.2.281.28 -o /path/to/v8-sdk
#
# First run: ~1-3 hours (clone + build)
# Cached run: seconds (copies from cache)
#
# The output directory contains include/v8.h and libv8_monolith.a. Pass it to
# CMake via -DV8_DIR=... (or drop it in the repo's .v8/ directory, which
# cmake/FindV8.cmake auto-detects).
#
# To produce the tarball uploaded by the V8 SDK release workflow:
#   tar -cJf v8-sdk-<version>-<os>-<arch>.tar.xz -C /path/to/v8-sdk .
#
# Notes:
# - The version must be a real V8 release tag (e.g. 12.2.281.28). The repo's
#   old build-v8.ps1 default "12.2.282" does not exist as a tag.
# - Linux builds with use_custom_libcxx=false so the SDK links against the
#   same libstdc++ that g++ uses to build elyxion. macOS keeps the libc++
#   default, which is what clang uses there anyway.
# - v8_use_external_startup_data=false embeds the snapshot in the binary, so
#   no snapshot_blob.bin is needed at runtime.
# - v8_enable_sandbox=false is required for this V8 12.2 embedder, which has no
#   public runtime sandbox initialization API.
# - v8_enable_pointer_compression=false matches Elyxion's default compiler ABI.

set -euo pipefail

VERSION="12.2.281.28"
OUT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/build/v8"
CACHE_DIR="${HOME}/.v8-cache"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -v|--version) VERSION="$2"; shift 2 ;;
    -o|--out)     OUT_DIR="$2"; shift 2 ;;
    -c|--cache)   CACHE_DIR="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [-v VERSION] [-o OUT_DIR] [-c CACHE_DIR]"
      exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

OS="$(uname -s)"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) ARCH="x64" ;;
  aarch64|arm64) ARCH="arm64" ;;
esac

# Include the embedder compatibility profile so an older sandbox-enabled SDK
# cannot be reused accidentally.
CACHE_KEY="v8-${VERSION}-${OS}-${ARCH}-nosandbox-nopointercompression-clean"
CACHED_BUILD="${CACHE_DIR}/${CACHE_KEY}"

echo "=== V8 standalone SDK build for Elyxion ==="
echo "Version: $VERSION"
echo "OS/arch: ${OS}/${ARCH}"
echo "Output:  $OUT_DIR"
echo ""

# ---- Cache hit ----
if [[ -f "${CACHED_BUILD}/include/v8.h" ]]; then
  echo "[CACHE HIT] Using cached V8 from ${CACHED_BUILD}"
  mkdir -p "$OUT_DIR"
  cp -R "${CACHED_BUILD}/." "$OUT_DIR/"
  echo "[DONE] V8 is ready at $OUT_DIR"
  exit 0
fi

# ---- Install depot_tools ----
if [[ ! -x "${CACHE_DIR}/depot_tools/fetch" ]]; then
  echo "Installing depot_tools..."
  git clone --depth=1 \
    https://chromium.googlesource.com/chromium/tools/depot_tools.git \
    "${CACHE_DIR}/depot_tools"
fi
export PATH="${CACHE_DIR}/depot_tools:$PATH"

# Bootstrap the gn/ninja wrappers (creates python3_bin_reldir.txt).
# Must run before DEPOT_TOOLS_UPDATE=0, otherwise the update is skipped
# and gn/ninja fail with "python3_bin_reldir.txt not found".
(cd "${CACHE_DIR}/depot_tools" && ./update_depot_tools)

export DEPOT_TOOLS_UPDATE=0

# ---- Clone V8 and configure dependencies ----
V8_SRC="${CACHE_DIR}/v8-src"
if [[ ! -f "${V8_SRC}/.gclient" ]]; then
  echo "Cloning V8 from https://chromium.googlesource.com/v8/v8 (this takes a while)..."
  rm -rf "$V8_SRC"
  mkdir -p "$V8_SRC"
  (cd "$V8_SRC" && git clone https://chromium.googlesource.com/v8/v8 v8)
  (cd "$V8_SRC" && gclient config https://chromium.googlesource.com/v8/v8)
fi

# ---- Checkout version ----
echo "Checking out V8 ${VERSION}..."
(cd "${V8_SRC}/v8" && git fetch --tags --quiet)
if (cd "${V8_SRC}/v8" && git rev-parse -q --verify "refs/tags/${VERSION}" >/dev/null); then
  (cd "${V8_SRC}/v8" && git checkout "tags/${VERSION}" -B "elyxion-${VERSION}")
else
  echo "Tag ${VERSION} not found; falling back to branch-heads/${VERSION%.*}"
  (cd "${V8_SRC}/v8" && git checkout "branch-heads/${VERSION%.*}" -B "elyxion-${VERSION}")
fi

# ---- Sync dependencies ----
echo "Syncing dependencies..."
(cd "$V8_SRC" && gclient sync -D --with_branch_heads)

# ---- Generate build ----
GN_ARGS=(
  'is_debug = false'
  "target_cpu = \"${ARCH}\""
  'v8_monolithic = true'
  'v8_enable_sandbox = false'
  'v8_enable_pointer_compression = false'
  'v8_use_external_startup_data = false'
  'v8_enable_i18n_support = false'
  'treat_warnings_as_errors = false'
  'symbol_level = 0'
)
# Linux: elyxion links with g++/libstdc++, so build V8 with the same stdlib.
# macOS: keep the libc++ default (clang uses libc++ there anyway).
if [[ "$OS" == "Linux" ]]; then
  GN_ARGS+=('use_custom_libcxx = false')
fi

BUILD_DIR="out/${ARCH}.release"
echo "Generating build files..."
# GN argument changes are ABI-sensitive. Remove the previous output directory
# so Ninja cannot combine objects from different V8 feature profiles.
rm -rf "${V8_SRC}/v8/${BUILD_DIR}"
(cd "${V8_SRC}/v8" && gn gen "$BUILD_DIR" --args="${GN_ARGS[*]}")

# ---- Build ----
# Parallelism: default to core count, override with JOBS env var
# (e.g. JOBS=4 to cap memory usage).
if [[ -z "${JOBS:-}" ]]; then
  JOBS="$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 2)"
fi
echo "Building v8_monolith with -j${JOBS} (30-90+ minutes)..."
(cd "${V8_SRC}/v8" && ninja -C "$BUILD_DIR" -j"$JOBS" v8_monolith)

# ---- Collect output ----
echo "Collecting build artifacts..."
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR/include"
(cd "${V8_SRC}/v8" && cp -R include/* "$OUT_DIR/include/")
if [[ -f "${V8_SRC}/v8/${BUILD_DIR}/obj/libv8_monolith.a" ]]; then
  cp "${V8_SRC}/v8/${BUILD_DIR}/obj/libv8_monolith.a" "$OUT_DIR/"
elif [[ -f "${V8_SRC}/v8/${BUILD_DIR}/libv8_monolith.a" ]]; then
  cp "${V8_SRC}/v8/${BUILD_DIR}/libv8_monolith.a" "$OUT_DIR/"
else
  echo "ERROR: libv8_monolith.a not found in the build output" >&2
  exit 1
fi

# ---- Save to cache ----
echo "Saving to cache..."
rm -rf "$CACHED_BUILD"
mkdir -p "$(dirname "$CACHED_BUILD")"
cp -R "$OUT_DIR" "$CACHED_BUILD"

echo ""
echo "[DONE] V8 SDK built at $OUT_DIR"
echo "  Headers:  $OUT_DIR/include/v8.h"
echo "  Library:  $OUT_DIR/libv8_monolith.a"
echo ""
echo "Build elyxion with:"
echo "  cmake -B build -DV8_DIR=\"$OUT_DIR\""
echo ""
echo "Package for the V8 SDK release workflow:"
echo "  tar -cJf v8-sdk-${VERSION}-${OS}-${ARCH}.tar.xz -C \"$OUT_DIR\" ."
