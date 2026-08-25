#!/usr/bin/env bash
# install.sh — Elyxion one-line installer for Linux and macOS
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/xyz-elyxion/elyxion-cli/main/scripts/install.sh | bash
#
# Or download and run:
#   chmod +x install.sh && ./install.sh
#
# What it does:
#   1. Detects your OS and architecture
#   2. Downloads the latest Elyxion release from GitHub
#   3. Extracts it to ~/.elyxion/
#   4. Makes 'elyxion' and 'elyx' available on your PATH
#
# Set ELYXION_VERSION to pin a specific release (e.g. v1.0.0).
# Set ELYXION_INSTALL_DIR to change the install directory.
#
# A full log is saved to ~/.elyxion/install.log

set -euo pipefail

# ---- Configuration ------------------------------------------------
ELYXION_REPO="${ELYXION_REPO:-xyz-elyxion/elyxion-cli}"
ELYXION_VERSION="${ELYXION_VERSION:-latest}"
ELYXION_INSTALL_DIR="${ELYXION_INSTALL_DIR:-$HOME/.elyxion}"
ELYXION_BIN_DIR="${ELYXION_BIN_DIR:-}"
ELYXION_LOG="${ELYXION_LOG:-$ELYXION_INSTALL_DIR/install.log}"

# ---- Logging setup ------------------------------------------------
# Create install dir early so the log can live there
mkdir -p "$(dirname "$ELYXION_LOG")" 2>/dev/null || true

# Redirect all output to both the terminal and the log file
if command -v tee >/dev/null 2>&1; then
  exec > >(tee -a "$ELYXION_LOG") 2>&1
else
  # Fallback: just log; terminal output is lost but log is saved
  exec >> "$ELYXION_LOG" 2>&1
fi

echo "=== Elyxion Installer Log ==="
echo "Date:       $(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u)"
echo "User:       $(whoami 2>/dev/null || echo unknown)"
echo "OS:         $(uname -s)"
echo "Arch:       $(uname -m)"
echo "Repo:       $ELYXION_REPO"
echo "Version:    $ELYXION_VERSION"
echo "Install:    $ELYXION_INSTALL_DIR"
echo "Log:        $ELYXION_LOG"
echo "PWD:        $(pwd)"
echo "=============================="
echo ""

# ---- Color helpers -------------------------------------------------
BOLD=""; RED=""; GREEN=""; CYAN=""; NC=""
if [ -t 2 ] && command -v tput >/dev/null 2>&1; then
  BOLD="$(tput bold)"
  RED="$(tput setaf 1)"
  GREEN="$(tput setaf 2)"
  CYAN="$(tput setaf 6)"
  NC="$(tput sgr0)"
fi

info()  { printf "%b" "${CYAN}${BOLD}[elyxion]${NC} $1\n" >&2 || printf "%b" "[elyxion] $1\n"; }
ok()    { printf "%b" "${GREEN}${BOLD}[elyxion]${NC} $1\n" >&2 || printf "%b" "[elyxion] $1\n"; }
err()   { printf "%b" "${RED}${BOLD}[elyxion]${NC} $1\n" >&2 || printf "%b" "[elyxion] $1\n"; }

# ---- Platform detection --------------------------------------------
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Linux)  PLATFORM="linux" ;;
  Darwin) PLATFORM="macos"  ;;
  *)
    err "Unsupported OS: $OS"
    err "Elyxion currently supports Linux and macOS."
    echo ""; echo "Log saved to: $ELYXION_LOG"
    exit 1
    ;;
esac

case "$ARCH" in
  x86_64|amd64) ARCH="x64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *)
    err "Unsupported architecture: $ARCH"
    echo ""; echo "Log saved to: $ELYXION_LOG"
    exit 1
    ;;
esac

# On macOS, the universal binary is just "macos" (no arch suffix).
if [ "$PLATFORM" = "macos" ]; then
  ARCHIVE_NAME="elyxion-macos"
elif [ "$PLATFORM" = "linux" ] && [ "$ARCH" = "arm64" ]; then
  ARCHIVE_NAME="elyxion-linux-arm64"
else
  ARCHIVE_NAME="elyxion-linux-x64"
fi

info "Platform: ${PLATFORM}/${ARCH}"
info "Install directory: ${ELYXION_INSTALL_DIR}"

# ---- Determine release URL -----------------------------------------
RELEASE_URL="https://github.com/${ELYXION_REPO}/releases"
if [ "$ELYXION_VERSION" = "latest" ]; then
  DOWNLOAD_URL="${RELEASE_URL}/latest/download/${ARCHIVE_NAME}.tar.gz"
else
  DOWNLOAD_URL="${RELEASE_URL}/download/${ELYXION_VERSION}/${ARCHIVE_NAME}.tar.gz"
fi

info "Download URL: $DOWNLOAD_URL"

# ---- Download & extract --------------------------------------------
TMPDIR="$(mktemp -d)"

info "Downloading Elyxion..."
if command -v curl >/dev/null 2>&1; then
  if ! curl -fL --progress-bar -o "$TMPDIR/elyxion.tar.gz" "$DOWNLOAD_URL" 2>&1; then
    # Try without progress bar for older curl
    if ! curl -fL -o "$TMPDIR/elyxion.tar.gz" "$DOWNLOAD_URL" 2>&1; then
      err "Download failed. Check your internet connection or try a specific version:"
      err "  ELYXION_VERSION=v1.0.0 ./install.sh"
      echo ""; echo "Log saved to: $ELYXION_LOG"
      rm -rf "$TMPDIR"
      exit 1
    fi
  fi
elif command -v wget >/dev/null 2>&1; then
  if ! wget -q --show-progress -O "$TMPDIR/elyxion.tar.gz" "$DOWNLOAD_URL" 2>&1; then
    err "Download failed."
    echo ""; echo "Log saved to: $ELYXION_LOG"
    rm -rf "$TMPDIR"
    exit 1
  fi
else
  err "Neither curl nor wget found. Install one of them and try again."
  echo ""; echo "Log saved to: $ELYXION_LOG"
  rm -rf "$TMPDIR"
  exit 1
fi

# Verify the download looks valid
DOWNLOAD_SIZE="$(wc -c < "$TMPDIR/elyxion.tar.gz")"
info "Downloaded: ${DOWNLOAD_SIZE} bytes"
if [ "$DOWNLOAD_SIZE" -lt 1024 ]; then
  err "Downloaded file is too small (${DOWNLOAD_SIZE} bytes) — it may be a GitHub error page."
  if [ "$ELYXION_VERSION" = "latest" ]; then
    err "Try pinning a version: ELYXION_VERSION=v1.0.0 ./install.sh"
  fi
  echo ""; echo "Log saved to: $ELYXION_LOG"
  rm -rf "$TMPDIR"
  exit 1
fi

# Remove any previous install
if [ -d "$ELYXION_INSTALL_DIR" ]; then
  info "Removing previous installation at ${ELYXION_INSTALL_DIR}"
  rm -rf "$ELYXION_INSTALL_DIR"
fi

mkdir -p "$ELYXION_INSTALL_DIR"

info "Extracting to ${ELYXION_INSTALL_DIR}..."
tar -xzf "$TMPDIR/elyxion.tar.gz" -C "$ELYXION_INSTALL_DIR" --strip-components=0

# ---- Flatten nested archive layout ----------------------------------
# GitHub's "latest/download" may wrap the archive in a single folder.
# If the extracted top-level is one directory with no files, shift up.
FLAT_ITEMS="$(ls -A "$ELYXION_INSTALL_DIR" 2>/dev/null || true)"
FLAT_DIRS="$(ls -d "$ELYXION_INSTALL_DIR"/*/ 2>/dev/null || true)"
FLAT_FILES="$(find "$ELYXION_INSTALL_DIR" -maxdepth 1 -type f 2>/dev/null | wc -l)"
FLAT_DIR_COUNT="$(echo "$FLAT_DIRS" | wc -l)"
if [ "$FLAT_DIR_COUNT" -eq 1 ] && [ "$FLAT_FILES" -eq 0 ]; then
  NESTED_DIR="$(echo "$FLAT_DIRS" | tr -d ' ')"
  info "Archive is nested under $(basename "$NESTED_DIR") — flattening..."
  FLAT_TEMP="${ELYXION_INSTALL_DIR}._flat"
  mv "$NESTED_DIR" "$FLAT_TEMP"
  rm -rf "${ELYXION_INSTALL_DIR:?}"/*
  mv "$FLAT_TEMP"/* "$ELYXION_INSTALL_DIR/" 2>/dev/null || true
  mv "$FLAT_TEMP"/.* "$ELYXION_INSTALL_DIR/" 2>/dev/null || true
  rmdir "$FLAT_TEMP" 2>/dev/null || true
  info "Flattened."
fi

# Rename elyxion.bin → elyxion (the actual binary)
if [ -f "$ELYXION_INSTALL_DIR/elyxion.bin" ]; then
  mv "$ELYXION_INSTALL_DIR/elyxion.bin" "$ELYXION_INSTALL_DIR/elyxion"
  chmod +x "$ELYXION_INSTALL_DIR/elyxion"
fi

# Make launcher scripts executable
if [ -d "$ELYXION_INSTALL_DIR/bin" ]; then
  chmod +x "$ELYXION_INSTALL_DIR/bin/elyxion" 2>/dev/null || true
  chmod +x "$ELYXION_INSTALL_DIR/bin/elyx"    2>/dev/null || true
fi

# Show what was extracted
info "Extracted files:"
find "$ELYXION_INSTALL_DIR" -type f | sort | while read -r f; do
  printf "  %s (%s bytes)\n" "$f" "$(wc -c < "$f")"
done

# ---- Setup PATH ----------------------------------------------------
setup_path() {
  local bindir="${1:-}"

  # If user specified a bin dir, use it
  if [ -n "$ELYXION_BIN_DIR" ]; then
    mkdir -p "$ELYXION_BIN_DIR"
    create_wrappers "$ELYXION_BIN_DIR"
    ELYXION_BIN_USED="$ELYXION_BIN_DIR"
    return
  fi

  # Try common system/user bin directories
  local candidates=()

  # $HOME/.local/bin (XDG standard, no sudo needed)
  candidates+=("$HOME/.local/bin")

  # /usr/local/bin (system-wide, may need sudo)
  if [ -w /usr/local/bin ] || [ -w /usr/local ]; then
    candidates+=("/usr/local/bin")
  fi

  for cand in "${candidates[@]}"; do
    if mkdir -p "$cand" 2>/dev/null && [ -w "$cand" ]; then
      create_wrappers "$cand"
      ok "Commands installed to ${cand}/"
      ELYXION_BIN_USED="$cand"
      return
    fi
  done

  # Fallback: ~/.local/bin (create if needed)
  mkdir -p "$HOME/.local/bin"
  create_wrappers "$HOME/.local/bin"
  ok "Commands installed to ${HOME}/.local/bin/"
  ELYXION_BIN_USED="$HOME/.local/bin"
}

create_wrappers() {
  local bindir="$1"
  local install_dir="$ELYXION_INSTALL_DIR"

  # Create elyxion wrapper
  cat > "$bindir/elyxion" <<WRAPPER
#!/bin/sh
# Elyxion wrapper — installed by install.sh
export ELYXION_HOME="\${ELYXION_HOME:-${install_dir}}"
exec "\${ELYXION_HOME}/elyxion" "\$@"
WRAPPER
  chmod +x "$bindir/elyxion"

  # Create elyx wrapper
  cat > "$bindir/elyx" <<WRAPPER
#!/bin/sh
# Elyx wrapper — installed by install.sh
export ELYXION_HOME="\${ELYXION_HOME:-${install_dir}}"
exec "\${ELYXION_HOME}/elyxion" --package-manager "\$@"
WRAPPER
  chmod +x "$bindir/elyx"
}

# Remove old wrappers from common locations (avoid stale installs)
clean_old_wrappers() {
  for d in /usr/local/bin "$HOME/.local/bin" "$HOME/bin"; do
    for cmd in elyxion elyx; do
      if [ -f "$d/$cmd" ] && grep -q "install.sh" "$d/$cmd" 2>/dev/null; then
        rm -f "$d/$cmd" 2>/dev/null || true
      fi
    done
  done
}

clean_old_wrappers
setup_path

# ---- Verify installation -------------------------------------------
info "Verifying installation..."
if ! "$ELYXION_INSTALL_DIR/elyxion" --version >/dev/null 2>&1; then
  err "Installation verification failed."
  err "The binary may be incompatible with your system."
  echo ""; echo "Log saved to: $ELYXION_LOG"
  rm -rf "$TMPDIR"
  exit 1
fi

# ---- PATH guidance -------------------------------------------------
BIN_DIR_USED="${ELYXION_BIN_USED:-$HOME/.local/bin}"

# Check if the bin dir is on PATH
case ":$PATH:" in
  *:"$BIN_DIR_USED":*)
    # Already on PATH
    ;;
  *)
    SHELL_RC=""
    case "${SHELL:-}" in
      */zsh)  SHELL_RC="$HOME/.zshrc" ;;
      */bash) SHELL_RC="$HOME/.bashrc" ;;
      */fish) SHELL_RC="$HOME/.config/fish/config.fish" ;;
      *)      SHELL_RC="$HOME/.profile" ;;
    esac

    printf "%b" "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║  Add ${BIN_DIR_USED} to your PATH to use elyxion anywhere:"
    echo "║"
    echo "║    export PATH=\"${BIN_DIR_USED}:\$PATH\""
    echo "║"
    echo "║  Add the line above to ${SHELL_RC}"
    echo "║  Then restart your terminal, or run:"
    echo "║"
    echo "║    source ${SHELL_RC}"
    echo "╚══════════════════════════════════════════════════════════════╝"
    printf "%b" "${NC}"
    ;;
esac

# ---- Done ----------------------------------------------------------
VERSION="$("$ELYXION_INSTALL_DIR/elyxion" --version 2>&1 || echo "unknown")"
echo ""
ok "Elyxion ${VERSION} installed successfully!"
echo ""
echo "  Quick start:"
echo "    elyxion --version"
echo "    elyxion --repl"
echo "    elyx init"
echo "    elyx install <package>"
echo ""
echo "  Install log: ${ELYXION_LOG}"
echo ""
echo "  To uninstall:"
echo "    rm -rf ${ELYXION_INSTALL_DIR}"
echo "    rm -f ${BIN_DIR_USED}/elyxion ${BIN_DIR_USED}/elyx"
echo ""

# Clean up temp
rm -rf "$TMPDIR"

echo "=== Install complete at $(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u) ==="