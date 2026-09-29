#!/usr/bin/env bash
# Run cargo commands for src-tauri inside the Linux dev image
# (host Smart App Control blocks unsigned build-script/test binaries).
# Usage: scripts/cargo-test.sh [cargo args...]   e.g. scripts/cargo-test.sh test
set -euo pipefail
SRC_TAURI="$(cd "$(dirname "$0")/../src-tauri" && pwd)"
command -v cygpath >/dev/null 2>&1 && SRC_TAURI="$(cygpath -m "$SRC_TAURI")"
MSYS_NO_PATHCONV=1 docker run --rm \
  -v "$SRC_TAURI:/app" \
  -v edge-cargo-registry:/usr/local/cargo/registry \
  -v edge-cargo-target:/target \
  -e CARGO_TARGET_DIR=/target \
  parkvision-edge-dev cargo "$@"
