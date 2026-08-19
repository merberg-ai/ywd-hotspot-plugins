#!/usr/bin/env bash
set -euo pipefail

# Build mbelib in a user cache for the RX Monitor Phase 3C offline decoder.
# Nothing is installed system-wide and nothing is copied to the hotspot.

MBELIB_REPO="https://github.com/szechyjs/mbelib.git"
MBELIB_PIN="9a04ed5c78176a9965f3d43f7aa1b1f5330e771f"
CACHE_ROOT="${XDG_CACHE_HOME:-$HOME/.cache}/ywd-hotspot-plugins/phase3c"
SRC="$CACHE_ROOT/mbelib"
BUILD="$CACHE_ROOT/mbelib-build"
PATH_FILE="$CACHE_ROOT/libmbe-path"

need=()
for cmd in git cmake cc python3; do
  command -v "$cmd" >/dev/null 2>&1 || need+=("$cmd")
done
if ((${#need[@]})); then
  echo "[FAIL] Missing build tools: ${need[*]}" >&2
  echo "On Ubuntu/Debian install them with:" >&2
  echo "  sudo apt-get update && sudo apt-get install -y git cmake build-essential python3" >&2
  exit 2
fi

mkdir -p "$CACHE_ROOT"

if [[ ! -d "$SRC/.git" ]]; then
  echo "[Phase3C] Cloning pinned mbelib source..."
  git clone "$MBELIB_REPO" "$SRC"
else
  echo "[Phase3C] Reusing cached mbelib source..."
  remote="$(git -C "$SRC" remote get-url origin 2>/dev/null || true)"
  if [[ "$remote" != "$MBELIB_REPO" ]]; then
    echo "[FAIL] Cached source has unexpected origin: $remote" >&2
    echo "Remove $SRC and run this helper again." >&2
    exit 3
  fi
  git -C "$SRC" fetch --tags --prune origin
fi

git -C "$SRC" checkout --detach "$MBELIB_PIN"
actual="$(git -C "$SRC" rev-parse HEAD)"
if [[ "$actual" != "$MBELIB_PIN" ]]; then
  echo "[FAIL] mbelib pin mismatch: $actual" >&2
  exit 4
fi

echo "[Phase3C] Configuring mbelib @ ${MBELIB_PIN:0:12}..."
cmake \
  -S "$SRC" \
  -B "$BUILD" \
  -DDISABLE_TEST=ON \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_POLICY_VERSION_MINIMUM=3.5

echo "[Phase3C] Building mbelib..."
jobs="$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 2)"
cmake --build "$BUILD" -j "$jobs"

lib=""
for candidate in \
  "$BUILD/libmbe.so" \
  "$BUILD/libmbe.so.1" \
  "$BUILD/libmbe.so.1.3"; do
  if [[ -f "$candidate" ]]; then
    lib="$candidate"
    break
  fi
done
if [[ -z "$lib" ]]; then
  lib="$(find "$BUILD" -maxdepth 2 -type f -name 'libmbe.so*' -print -quit 2>/dev/null || true)"
fi
if [[ -z "$lib" || ! -f "$lib" ]]; then
  echo "[FAIL] mbelib build completed but libmbe.so was not found under $BUILD" >&2
  exit 5
fi

printf '%s\n' "$lib" > "$PATH_FILE"

echo
echo "[OK] Phase 3C mbelib ready"
echo "     commit : $actual"
echo "     library: $lib"
echo "     marker : $PATH_FILE"
