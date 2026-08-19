#!/usr/bin/env bash
set -euo pipefail

# Phase 3D: build a browser-only mbelib decoder proof.
# The generated Emscripten bundle stays local under tools/phase3d/generated/.
# Nothing is installed on or copied to the hotspot by this helper.

MBELIB_REPO="https://github.com/szechyjs/mbelib.git"
MBELIB_PIN="9a04ed5c78176a9965f3d43f7aa1b1f5330e771f"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CACHE_ROOT="${XDG_CACHE_HOME:-$HOME/.cache}/ywd-hotspot-plugins/phase3d"
SRC="$CACHE_ROOT/mbelib"
OUT_DIR="$HERE/generated"
OUT_JS="$OUT_DIR/ywd-mbelib.js"
WRAPPER="$HERE/ywd_mbe_wrapper.c"

for cmd in git emcc python3; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[FAIL] Missing required tool: $cmd" >&2
    if [[ "$cmd" == "emcc" ]]; then
      echo "Install the Emscripten SDK/toolchain so emcc is on PATH, then rerun this helper." >&2
    fi
    exit 2
  fi
done

mkdir -p "$CACHE_ROOT" "$OUT_DIR"

if [[ ! -d "$SRC/.git" ]]; then
  echo "[Phase3D] Cloning pinned mbelib source..."
  git clone "$MBELIB_REPO" "$SRC"
else
  remote="$(git -C "$SRC" remote get-url origin 2>/dev/null || true)"
  if [[ "$remote" != "$MBELIB_REPO" ]]; then
    echo "[FAIL] Cached source has unexpected origin: $remote" >&2
    echo "Remove $SRC and rerun this helper." >&2
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

mapfile -t sources < <(find "$SRC" -maxdepth 1 -type f -name '*.c' -print | sort)
if ((${#sources[@]} == 0)); then
  echo "[FAIL] No mbelib C sources found under $SRC" >&2
  exit 5
fi

if [[ ! -s "$WRAPPER" ]]; then
  echo "[FAIL] Missing wrapper: $WRAPPER" >&2
  exit 6
fi

echo "[Phase3D] Building single-file browser decoder @ ${MBELIB_PIN:0:12}..."
emcc -O3 -I"$SRC" "${sources[@]}" "$WRAPPER" -o "$OUT_JS" -lm \
  --no-entry \
  -sWASM=1 \
  -sSINGLE_FILE=1 \
  -sMODULARIZE=1 \
  -sEXPORT_NAME=createYwdMbeModule \
  -sENVIRONMENT=web \
  -sFILESYSTEM=0 \
  -sALLOW_MEMORY_GROWTH=0 \
  -sEXPORTED_FUNCTIONS='["_ywd_mbe_reset","_ywd_mbe_bits_ptr","_ywd_mbe_pcm_ptr","_ywd_mbe_decode"]' \
  -sEXPORTED_RUNTIME_METHODS='["setValue","getValue"]'

if [[ ! -s "$OUT_JS" ]]; then
  echo "[FAIL] Browser decoder build did not produce $OUT_JS" >&2
  exit 7
fi

cp "$SRC/COPYRIGHT" "$OUT_DIR/MBELIB-COPYRIGHT.txt"
printf '%s\n' "$actual" > "$OUT_DIR/MBELIB-COMMIT.txt"

printf '\n[OK] Phase 3D browser decoder ready\n'
printf '     commit : %s\n' "$actual"
printf '     bundle : %s\n' "$OUT_JS"
printf '     size   : %s bytes\n' "$(wc -c < "$OUT_JS")"
printf '\nNext:\n  %s/SERVE.sh\n' "$HERE"
