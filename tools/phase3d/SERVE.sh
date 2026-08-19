#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${1:-8787}"
BUNDLE="$HERE/generated/ywd-mbelib.js"

if [[ ! -s "$BUNDLE" ]]; then
  echo "[FAIL] Browser decoder has not been built yet." >&2
  echo "Run:" >&2
  echo "  $HERE/BUILD-BROWSER-DECODER.sh" >&2
  exit 2
fi

host_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo "[Phase3D] Serving browser decoder proof from $HERE"
echo "Local: http://127.0.0.1:$PORT/"
if [[ -n "$host_ip" ]]; then
  echo "LAN:   http://$host_ip:$PORT/"
fi
echo "Ctrl-C to stop."
exec python3 -m http.server "$PORT" --bind 0.0.0.0 --directory "$HERE"
