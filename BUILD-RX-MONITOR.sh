#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_ROOT="${XDG_CONFIG_HOME:-$HOME/.config}/ywd-hotspot-plugins"
CONFIG_FILE="$CONFIG_ROOT/build.json"
BUILDER="$ROOT/tools/phase3j/BUILD-STREAMED-LIVE-CANDIDATE.sh"
EXPECTED_OUT="$ROOT/dist/dmr-rx-monitor-0.4.0-alpha19.ywdplugin"

fail(){ printf '[FAIL] %s\n' "$*" >&2; exit 1; }

[[ -x "$BUILDER" || -f "$BUILDER" ]] || fail "Phase 3J RX Monitor builder not found: $BUILDER"
command -v python3 >/dev/null 2>&1 || fail "python3 is required"
command -v openssl >/dev/null 2>&1 || fail "openssl is required"

mapfile -t cfg < <(python3 - "$CONFIG_FILE" <<'PY'
import json, pathlib, sys
p=pathlib.Path(sys.argv[1])
try: d=json.loads(p.read_text())
except Exception: d={}
if not isinstance(d,dict): d={}
for key in ('core_path','publisher','key_id','private_key','public_key'):
    print(str(d.get(key,'') or ''))
PY
)

CORE="${cfg[0]:-}"
PUBLISHER="${cfg[1]:-}"
KEY_ID="${cfg[2]:-}"
PRIVATE_KEY="${cfg[3]:-}"
PUBLIC_KEY="${cfg[4]:-}"

if [[ -z "$CORE" ]]; then
  CORE="$(cd "$ROOT/.." && pwd)/ywd-hotspot"
fi

[[ -f "$CORE/tools/ywdplugin-build.py" && -d "$CORE/lib" ]] || {
  cat >&2 <<EOF
[FAIL] Matching YWD-Hotspot core checkout not found.

Expected by default:
  $CORE

Clone the core repository beside this one on dev-plugins, or run:
  ./PLUGIN-DEV.sh
and set the core checkout path.
EOF
  exit 1
}

if [[ -z "$KEY_ID" || -z "$PRIVATE_KEY" || ! -f "$PRIVATE_KEY" ]]; then
  cat >&2 <<'EOF'
[FAIL] RX Monitor is a signed UI plugin and no signing key is configured.

Run once on your development machine:
  ./PLUGIN-DEV.sh keys

Then run this builder again. Keep the private key off the hotspot and out of Git.
EOF
  exit 1
fi

printf '\n============================================================\n'
printf ' YWD-Hotspot DMR RX Monitor Builder\n'
printf '============================================================\n'
printf ' Core      : %s\n' "$CORE"
printf ' Publisher : %s\n' "${PUBLISHER:-not set}"
printf ' Key ID    : %s\n' "$KEY_ID"
printf ' Output    : %s\n' "$EXPECTED_OUT"
printf '============================================================\n\n'

bash "$BUILDER"

[[ -f "$EXPECTED_OUT" ]] || fail "Builder completed but expected package was not found: $EXPECTED_OUT"

printf '\n[OK] RX Monitor package is ready:\n  %s\n' "$EXPECTED_OUT"
if [[ -n "$PUBLIC_KEY" && -f "$PUBLIC_KEY" ]]; then
  printf '\nNext useful checks:\n'
  printf '  ./PLUGIN-DEV.sh verify %q\n' "$EXPECTED_OUT"
  printf '  ./PLUGIN-DEV.sh inspect %q\n' "$EXPECTED_OUT"
  printf '  ./PLUGIN-DEV.sh trust-command\n'
else
  printf '\nConfigured public key was not found; package build succeeded, but local signature verification is unavailable.\n'
fi
