#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CACHE_ROOT="${XDG_CACHE_HOME:-$HOME/.cache}/ywd-hotspot-plugins/phase3c"
PATH_FILE="$CACHE_ROOT/libmbe-path"

usage() {
  cat <<'EOF'
Usage:
  ./tools/phase3c/PHASE3C-DECODE.sh CAPTURE.json [OUTPUT_BASE.wav]

Builds the pinned mbelib dependency in the user's cache when needed, validates
an RX Monitor v0.3.0 capture, and decodes RF and NETWORK AMBE49 streams into
separate 8 kHz mono WAV files.

Examples:
  ./tools/phase3c/PHASE3C-DECODE.sh ~/Downloads/ywd-dmr-rx-capture-....json
  ./tools/phase3c/PHASE3C-DECODE.sh capture.json ~/tmp/parrot.wav
EOF
}

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage >&2
  exit 2
fi

CAPTURE="$1"
OUTPUT="${2:-}"

if [[ ! -f "$CAPTURE" ]]; then
  echo "[FAIL] Capture not found: $CAPTURE" >&2
  exit 2
fi

# Always do a cheap parser/storage-format check before building anything.
python3 "$HERE/decode_capture.py" "$CAPTURE" --inspect-only

lib=""
if [[ -f "$PATH_FILE" ]]; then
  lib="$(cat "$PATH_FILE" 2>/dev/null || true)"
fi
if [[ -z "$lib" || ! -f "$lib" ]]; then
  echo
echo "[Phase3C] Decoder library is not prepared yet. Building it now..."
  bash "$HERE/setup-mbelib.sh"
  lib="$(cat "$PATH_FILE")"
fi

args=("$CAPTURE" --library "$lib" --path both)
if [[ -n "$OUTPUT" ]]; then
  args+=(--output "$OUTPUT")
fi

echo
python3 "$HERE/decode_capture.py" "${args[@]}"
