#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PLUGIN_SRC="$ROOT/plugins/dmr-rx-monitor"
PHASE3E="$ROOT/tools/phase3e"
STAGE_ROOT="$HERE/stage"
STAGE="$STAGE_ROOT/dmr-rx-monitor"
DIST="$ROOT/dist"
VERSION="0.4.0-alpha19"
CONFIG_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/ywd-hotspot-plugins/build.json"
DEFAULT_CORE="$(cd "$ROOT/.." && pwd)/ywd-hotspot"
MAX_UI_JS=$((256 * 1024))

fail() { echo "[FAIL] $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"; }
for cmd in python3 openssl; do need "$cmd"; done

[[ -d "$PLUGIN_SRC" ]] || fail "RX Monitor source not found: $PLUGIN_SRC"
[[ -s "$HERE/streamed-live-audio.js" ]] || fail "Missing streamed-live-audio.js"
[[ -s "$HERE/stream-polish.js" ]] || fail "Missing stream-polish.js"
[[ -s "$HERE/alpha19-playout-patch.py" ]] || fail "Missing alpha19-playout-patch.py"
[[ -s "$PHASE3E/live-audio.css" ]] || fail "Missing live-audio.css"

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
required_caps={'ui:section','read:dmr-voice','use:vocoder'}
caps=set(manifest.get('capabilities') or [])
missing=sorted(required_caps-caps)
if missing:
    raise SystemExit('canonical RX manifest is missing required capabilities: '+', '.join(missing))
required_dep='mmdvm-cap-demand-gated-dmr-voice'
if required_dep not in set(manifest.get('dependencies') or []):
    raise SystemExit(f'canonical RX manifest is missing dependency: {required_dep}')
manifest['version']=version
manifest['description']='Passive DMR RX Monitor with trusted frame diagnostics plus Phase 3J streamed PCM audio. Live audio recovery, bounded 10-frame batching, and external YWD Vocoder Protocol v1 decode run in trusted core; the sandbox receives PCM stream events only. Alpha19 keeps the proven 400 ms reservoir and gentle clock correction while preserving already-buffered PCM across normal decoder-state resets; explicit drop/error events still rebuffer. The plugin contains no AMBE software vocoder and has no direct RF, serial, MQTT, or network access.'
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')

ui_path=stage/'ui.js'
ui=ui_path.read_text()
marker="version:'0.3.0'"
if ui.count(marker) != 1:
    raise SystemExit('RX Monitor capture version marker changed; expected exactly one v0.3.0 marker')
ui=ui.replace(marker, f"version:'{version}'")
ui_path.write_text(ui)
PY

cat "$HERE/streamed-live-audio.js" "$HERE/stream-polish.js" >> "$STAGE/ui.js"
python3 "$HERE/alpha19-playout-patch.py" "$STAGE/ui.js"
cat "$PHASE3E/live-audio.css" >> "$STAGE/ui.css"

if find "$STAGE" -type f \( -iname '*mbelib*' -o -name '*.wasm' \) -print -quit | grep -q .; then
  fail "Phase 3J plugin must not contain mbelib or Wasm decoder files"
fi
if grep -Eiq 'createYwdMbeModule|_ywd_mbe_' "$STAGE/ui.js"; then
  fail "Phase 3J ui.js contains embedded-decoder executable symbols"
fi
if grep -Eq 'vocoderDecode|vocoderReset|ywdRxAudioFrame' "$STAGE/ui.js"; then
  fail "Phase 3J ui.js unexpectedly contains the legacy browser decode path"
fi
if ! grep -q 'startRxAudioStream' "$STAGE/ui.js"; then
  fail "Phase 3J streamed audio API hook is missing"
fi
if ! grep -q 'DEFAULT_BUFFER_MS = 400' "$STAGE/ui.js"; then
  fail "Alpha19 400 ms browser reservoir default is missing"
fi
if ! grep -q 'MAX_SCHEDULED_DEPTH_MS = 700' "$STAGE/ui.js"; then
  fail "Alpha19 700 ms browser reservoir ceiling is missing"
fi
if ! grep -q 'RESERVOIR_DEADBAND_MS = 40' "$STAGE/ui.js"; then
  fail "Alpha19 40 ms reservoir deadband is missing"
fi
if ! grep -q 'RESERVOIR_GAIN_MS = 6000' "$STAGE/ui.js"; then
  fail "Alpha19 gentler reservoir gain is missing"
fi
if ! grep -q 'MIN_PLAYBACK_RATE = 0.99' "$STAGE/ui.js" || ! grep -q 'MAX_PLAYBACK_RATE = 1.01' "$STAGE/ui.js"; then
  fail "Alpha19 +/-1 percent playback correction bounds are missing"
fi
if ! grep -q 'Decoder state resets are normal at DMR talker/route boundaries' "$STAGE/ui.js"; then
  fail "Alpha19 reset-tolerant playout patch is missing"
fi
if ! grep -q '>HEARTBEATS<' "$STAGE/ui.js"; then
  fail "Alpha19 heartbeat label is missing"
fi

echo "[OK] No embedded AMBE decoder material"
echo "[OK] Legacy browser poll/decode audio worker absent"
echo "[OK] Alpha19 browser reservoir: 400 ms default / 700 ms ceiling"
echo "[OK] Alpha19 playback correction: +/-1% with 40 ms deadband"
echo "[OK] Alpha19 preserves buffered PCM across decoder-state resets"
UI_BYTES="$(wc -c < "$STAGE/ui.js")"
echo "[Phase3J] Combined ui.js : $UI_BYTES bytes"
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

echo "[Phase3J] Building signed streamed-audio candidate..."
python3 "$CORE/tools/ywdplugin-build.py" "$STAGE" "$OUT" \
  --publisher "$PUBLISHER" --sign-key "$PRIVATE_KEY" --key-id "$KEY_ID"

if [[ -f "$PUBLIC_KEY" ]]; then
  bash "$ROOT/PLUGIN-DEV.sh" verify "$OUT"
fi
bash "$ROOT/PLUGIN-DEV.sh" inspect "$OUT"

echo
echo "[OK] RX Monitor Phase 3J candidate ready"
echo "     plugin    : dmr-rx-monitor v$VERSION"
echo "     output    : $OUT"
echo "     core      : $CORE"
echo "     audio     : one trusted NDJSON PCM stream"
echo "     batching  : trusted core 10 frames / 200 ms"
echo "     browser   : 400 ms reservoir; reset-tolerant playout; gentle +/-1% correction"
echo "     decoder   : NONE (external YWD Vocoder Protocol v1 backend only)"