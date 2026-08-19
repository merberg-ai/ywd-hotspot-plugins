#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PLUGIN_SRC="$ROOT/plugins/dmr-rx-monitor"
PHASE3D="$ROOT/tools/phase3d"
DECODER="$PHASE3D/generated/ywd-mbelib.js"
STAGE_ROOT="$HERE/stage"
STAGE="$STAGE_ROOT/dmr-rx-monitor"
DIST="$ROOT/dist"
VERSION="0.4.0-alpha4"
CONFIG_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/ywd-hotspot-plugins/build.json"
DEFAULT_CORE="$(cd "$ROOT/.." && pwd)/ywd-hotspot"
MAX_UI_JS=$((256 * 1024))

fail() { echo "[FAIL] $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"; }

for cmd in python3 openssl; do need "$cmd"; done
[[ -d "$PLUGIN_SRC" ]] || fail "RX Monitor source not found: $PLUGIN_SRC"
[[ -s "$HERE/live-audio.js" ]] || fail "Missing Phase 3E live-audio.js"
[[ -s "$HERE/live-audio.css" ]] || fail "Missing Phase 3E live-audio.css"

if [[ ! -s "$DECODER" ]]; then
  echo "[Phase3E] Phase 3D browser decoder is missing; building it first..."
  bash "$PHASE3D/BUILD-BROWSER-DECODER.sh"
fi
[[ -s "$DECODER" ]] || fail "Browser decoder build did not produce $DECODER"

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
cp "$PLUGIN_SRC"/* "$STAGE"/
cp "$HERE/live-audio.js" "$STAGE/live-audio.js"
cp "$HERE/live-audio.css" "$STAGE/live-audio.css"
cp "$DECODER" "$STAGE/ywd-mbelib.js"

python3 - "$STAGE" "$VERSION" <<'PY'
import json, pathlib, sys
stage=pathlib.Path(sys.argv[1]); version=sys.argv[2]

manifest_path=stage/'plugin.json'
manifest=json.loads(manifest_path.read_text())
manifest['version']=version
manifest['description']='Passive DMR receive monitor with live browser-side AMBE+2 decode, adaptive 100 ms frame polling, 450 ms AUTO single-call route lock, 100 ms chunked PCM Web Audio playback, FEC diagnostics, and bounded capture export. No direct RF, serial, MQTT, or network access.'
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')

ui_path=stage/'ui.js'
ui=ui_path.read_text()
needle='        pushCapture(frame, recovered, index);'
if ui.count(needle) != 1:
    raise SystemExit('RX Monitor ui.js hook point changed; expected exactly one pushCapture call')
hook="""        pushCapture(frame, recovered, index);\n        if (typeof window.ywdRxAudioFrame === 'function') {\n          try {\n            window.ywdRxAudioFrame({\n              path: frame.source,\n              slot: Number(frame.slot),\n              src: Number(frame.src_id),\n              dst: Number(frame.dst_id),\n              group: !!frame.group,\n              burst_seq: Number(frame.seq),\n              dmr_seq: Number(frame.seq_no),\n              n: Number(frame.n),\n              index,\n              ambe49: recovered.hex,\n              fec: recovered.corrected\n            });\n          } catch (_) {}\n        }"""
ui=ui.replace(needle, hook)

poll_needle='      pollTimer = setTimeout(poll, 250);'
if ui.count(poll_needle) != 1:
    raise SystemExit('RX Monitor poll hook point changed; expected exactly one 250 ms success poll')
poll_hook="""      const requestedPollMs = typeof window.ywdRxPollIntervalMs === 'function'\n        ? Number(window.ywdRxPollIntervalMs())\n        : 250;\n      pollTimer = setTimeout(poll, Math.max(75, Math.min(1000, requestedPollMs || 250)));"""
ui=ui.replace(poll_needle, poll_hook)

ui=ui.replace("version:'0.3.0'", f"version:'{version}'")
ui=ui.replace('PHASE 3B · 49-BIT AMBE+2 FRAME RECOVERY', 'PHASE 3B/3E · AMBE+2 RECOVERY + LIVE AUDIO')
ui=ui.replace('Browser-side FEC, de-scrambling, continuity diagnostics, and bounded capture export. Still no audio decoding.', 'Browser-side FEC, de-scrambling, continuity diagnostics, capture export, and live-audio handoff.')
ui_path.write_text(ui)

css_path=stage/'ui.css'
css=css_path.read_text()
css += (stage/'live-audio.css').read_text()
css_path.write_text(css)
PY

cat "$STAGE/ywd-mbelib.js" "$STAGE/live-audio.js" "$STAGE/ui.js" > "$STAGE/ui.combined.js"
mv "$STAGE/ui.combined.js" "$STAGE/ui.js"
rm -f "$STAGE/live-audio.js" "$STAGE/live-audio.css" "$STAGE/ywd-mbelib.js"

UI_BYTES="$(wc -c < "$STAGE/ui.js")"
DECODER_BYTES="$(wc -c < "$DECODER")"
echo "[Phase3E] Decoder bundle : $DECODER_BYTES bytes"
echo "[Phase3E] Combined ui.js : $UI_BYTES bytes"
if (( UI_BYTES > MAX_UI_JS )); then
  fail "Combined ui.js exceeds Plugin UI v1's 256 KiB limit ($UI_BYTES > $MAX_UI_JS). Do not weaken the package ad-hoc; split assets in core first."
fi

PYTHONPATH="$CORE/lib" python3 - "$STAGE/plugin.json" <<'PY'
import json, pathlib, sys
path=pathlib.Path(sys.argv[1]); raw=json.loads(path.read_text())
if str(raw.get('kind') or '') != 'ui': raise SystemExit('candidate is not a UI plugin')
import plugin_ui_manager
plugin=plugin_ui_manager.validate_manifest(path)
print(f"[OK] VALID: {plugin['id']} v{plugin['version']} ({plugin['kind']})")
print('[OK] Capabilities: ' + ', '.join(plugin.get('capabilities') or []))
PY

OUT="$DIST/dmr-rx-monitor-$VERSION.ywdplugin"
if [[ -n "$KEY_ID" && -f "$PRIVATE_KEY" ]]; then
  echo "[Phase3E] Building signed candidate..."
  python3 "$CORE/tools/ywdplugin-build.py" "$STAGE" "$OUT" \
    --publisher "$PUBLISHER" --sign-key "$PRIVATE_KEY" --key-id "$KEY_ID"
else
  fail "UI plugins require signing. Configure the normal PLUGIN-DEV.sh signing key first; staged source is ready at $STAGE"
fi

if [[ -f "$PUBLIC_KEY" ]]; then
  "$ROOT/PLUGIN-DEV.sh" verify "$OUT"
fi
"$ROOT/PLUGIN-DEV.sh" inspect "$OUT"

echo
echo "[OK] RX Monitor Phase 3E candidate ready"
echo "     plugin : dmr-rx-monitor v$VERSION"
echo "     output : $OUT"
echo "     core   : $CORE"
echo
echo "Paired core baseline remains Alpha22.5 unchanged."
echo "RX alpha4 schedules decoded PCM as 5-frame / 100 ms chunks."
echo "AUTO releases its active route after 450 ms of silence."
echo "START AUDIO requests 100 ms RX polling; STOP AUDIO returns to 250 ms."
