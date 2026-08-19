#!/usr/bin/env bash
set -euo pipefail

# Build mbelib in a user cache for the RX Monitor Phase 3C offline decoder.
# Nothing is installed system-wide and nothing is copied to the hotspot.

MBELIB_REPO="https://github.com/szechyjs/mbelib.git"
MBELIB_PIN="9a04ed5c78176a9965f3d43f7aa1b1f5330e771f"
CACHE_ROOT="${XDG_CACHE_HOME:-$HOME/.cache}/ywd-hotspot-plugins/phase3c"
SRC="$CACHE_ROOT/mbelib"
LIB="$CACHE_ROOT/libmbe-ywd.so"
PATH_FILE="$CACHE_ROOT/libmbe-path"

need=()
for cmd in git cc python3; do
  command -v "$cmd" >/dev/null 2>&1 || need+=("$cmd")
done
if ((${#need[@]})); then
  echo "[FAIL] Missing build tools: ${need[*]}" >&2
  echo "On Ubuntu/Debian install them with:" >&2
  echo "  sudo apt-get update && sudo apt-get install -y git build-essential python3" >&2
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

# Upstream's CMake build glob-compiles the root *.c files into libmbe. For this
# disposable development harness we do the same thing directly with the host C
# compiler. That avoids installing anything and avoids old-CMake-policy issues
# on newer Ubuntu releases while retaining the exact pinned source set.
mapfile -t sources < <(find "$SRC" -maxdepth 1 -type f -name '*.c' -print | sort)
if ((${#sources[@]} == 0)); then
  echo "[FAIL] No mbelib C sources found under $SRC" >&2
  exit 5
fi

echo "[Phase3C] Building mbelib @ ${MBELIB_PIN:0:12} (${#sources[@]} C files)..."
cc -O3 -fPIC -shared -I"$SRC" "${sources[@]}" -o "$LIB" -lm

if [[ ! -s "$LIB" ]]; then
  echo "[FAIL] mbelib shared-library build failed: $LIB" >&2
  exit 6
fi

printf '%s\n' "$LIB" > "$PATH_FILE"

echo
echo "[OK] Phase 3C mbelib ready"
echo "     commit : $actual"
echo "     library: $LIB"
echo "     marker : $PATH_FILE"
