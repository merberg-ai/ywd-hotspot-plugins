#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PLUGIN_SRC="$ROOT/plugins/dmr-rx-monitor"
STAGE_ROOT="$HERE/stage"
STAGE="$STAGE_ROOT/dmr-rx-monitor"
DIST="$ROOT/dist"
VERSION="0.4.0-alpha10"
CONFIG_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/ywd-hotspot-plugins/build.json"
DEFAULT_CORE="$(cd "$ROOT/.." && pwd)/ywd-hotspot"
MAX_UI_JS=$((256 * 1024))

fail() { echo "[FAIL] $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"; }

for cmd in python3 openssl; do need "$cmd"; done
[[ -d "$PLUGIN_SRC" ]] || fail "RX Monitor source not found: $PLUGIN_SRC"
[[ -s "$HERE/vocoder-diagnostics.js" ]] || fail "Missing vocoder-diagnostics.js"
[[ -s "$HERE/vocoder-diagnostics.css" ]] || fail "Missing vocoder-diagnostics.css"

mapfile -t cfg < <(python3 - "$CONFIG_FILE" "$DEFAULT_CORE" <<'PY'
import json, pathlib, sys
p=pathlib.Path(sys.argv[1]); default_core=sys.argv[2]
try: d=json.loads(p.read_text())
except Exception: d={}
if not isinstance(d,dict): d={}
for key, default in (
    ('core_path', default_core),
    ('publisher', 'KJ6YWD'),
    ('key_id', ''),
    ('private_key', ''),
    ('public_key', ''),
):
    print(str(d.get(key, default) or default))
PY
)
CORE="${cfg[0]}"; PUBLISHER="${cfg[1]}"; KEY_ID="${cfg[2]}"; PRIVATE_KEY="${cfg[3]}"; PUBLIC_KEY="${cfg[4]}"
[[ -f "$CORE/tools/ywdplugin-build.py" && -d "$CORE/lib" ]] || fail "Canonical YWD-Hotspot checkout not found at $CORE"

rm -rf "$STAGE_ROOT"
mkdir -p "$STAGE" "$DIST"
cp -a "$PLUGIN_SRC/." "$STAGE/"

python3 - "$STAGE" "$VERSION" <<'PY'
import json, pathlib, sys
stage=pathlib.Path(sys.argv[1]); version=sys.argv[2]
manifest_path=stage/'plugin.json'
manifest=json.loads(manifest_path.read_text())

caps=set(manifest.get('capabilities') or [])
required_caps={'ui:section','read:dmr-voice','use:vocoder'}
missing=sorted(required_caps-caps)
if missing:
    raise SystemExit('canonical RX manifest is missing required capabilities: '+', '.join(missing))

deps=set(manifest.get('dependencies') or [])
required_dep='mmdvm-cap-demand-gated-dmr-voice'
if required_dep not in deps:
    raise SystemExit(f'canonical RX manifest is missing dependency: {required_dep}')

manifest['version']=version
manifest['description']='Passive DMR receive monitor with browser-side AMBE+2 FEC/49-bit recovery plus a trusted YWD Vocoder Protocol v1 diagnostic boundary for separately installed decoder backends. This candidate contains no AMBE software vocoder and has no direct RF, serial, MQTT, or network access.'
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')

ui_path=stage/'ui.js'
ui=ui_path.read_text()
needle="version:'0.3.0'"
if ui.count(needle) != 1:
    raise SystemExit('RX Monitor capture version marker changed; expected exactly one v0.3.0 marker')
ui=ui.replace(needle, f"version:'{version}'")
ui_path.write_text(ui)
PY

cat "$STAGE/ui.js" "$HERE/vocoder-diagnostics.js" > "$STAGE/ui.combined.js"
mv "$STAGE/ui.combined.js" "$STAGE/ui.js"
cat "$HERE/vocoder-diagnostics.css" >> "$STAGE/ui.css"

if find "$STAGE" -type f \( -iname '*mbelib*' -o -name '*.wasm' \) -print -quit | grep -q .; then
  fail "Phase 3F must not contain mbelib or Wasm decoder files"
fi

UI_BYTES="$(wc -c < "$STAGE/ui.js")"
echo "[Phase3F] Combined ui.js : $UI_BYTES bytes"
if (( UI_BYTES > MAX_UI_JS )); then
  fail "Combined ui.js exceeds Plugin UI v1's 256 KiB limit ($UI_BYTES > $MAX_UI_JS)"
fi

if command -v node >/dev/null 2>&1; then
  node --check "$STAGE/ui.js"
  echo "[OK] JavaScript syntax"
fi

PYTHONPATH="$CORE/lib" python3 - "$STAGE/plugin.json" <<'PY'
import json, pathlib, sys
path=pathlib.Path(sys.argv[1]); raw=json.loads(path.read_text())
if str(raw.get('kind') or '') != 'ui': raise SystemExit('candidate is not a UI plugin')
import plugin_ui_manager
plugin=plugin_ui_manager.validate_manifest(path)
print(f"[OK] VALID: {plugin['id']} v{plugin['version']} ({plugin['kind']})")
print('[OK] Capabilities: ' + ', '.join(plugin.get('capabilities') or []))
print('[OK] Dependencies: ' + ', '.join(plugin.get('dependencies') or []))
PY

[[ -n "$KEY_ID" && -f "$PRIVATE_KEY" ]] || fail "UI plugins require signing. Configure the normal PLUGIN-DEV.sh signing key first."
OUT="$DIST/dmr-rx-monitor-$VERSION.ywdplugin"

echo "[Phase3F] Building signed no-decoder vocoder-boundary candidate..."
python3 "$CORE/tools/ywdplugin-build.py" "$STAGE" "$OUT" \
  --publisher "$PUBLISHER" --sign-key "$PRIVATE_KEY" --key-id "$KEY_ID"

if [[ -f "$PUBLIC_KEY" ]]; then
  bash "$ROOT/PLUGIN-DEV.sh" verify "$OUT"
fi
bash "$ROOT/PLUGIN-DEV.sh" inspect "$OUT"

echo
echo "[OK] RX Monitor Phase 3F candidate ready"
echo "     plugin : dmr-rx-monitor v$VERSION"
echo "     output : $OUT"
echo "     core   : $CORE"
echo "     decoder: NONE (external YWD Vocoder Protocol v1 backend only)"
echo
echo "This candidate adds STATUS / RESET / STATUS+RESET+DECODE 5-frame diagnostics only."
echo "It does not yet route live RX audio through the backend."
