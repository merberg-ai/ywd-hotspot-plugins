#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PLUGIN_SRC="$ROOT/plugins/dmr-rx-monitor"
PHASE3E="$ROOT/tools/phase3e"
PHASE3F="$ROOT/tools/phase3f"
STAGE_ROOT="$HERE/stage"
STAGE="$STAGE_ROOT/dmr-rx-monitor"
AUDIO_JS="$STAGE_ROOT/external-live-audio-alpha14.js"
DIST="$ROOT/dist"
VERSION="0.4.0-alpha14"
CONFIG_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/ywd-hotspot-plugins/build.json"
DEFAULT_CORE="$(cd "$ROOT/.." && pwd)/ywd-hotspot"
MAX_UI_JS=$((256 * 1024))

fail() { echo "[FAIL] $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"; }

for cmd in python3 openssl; do need "$cmd"; done
[[ -d "$PLUGIN_SRC" ]] || fail "RX Monitor source not found: $PLUGIN_SRC"
[[ -s "$HERE/external-live-audio.js" ]] || fail "Missing external-live-audio.js"
[[ -s "$HERE/stabilize-alpha13.js" ]] || fail "Missing stabilize-alpha13.js"
[[ -s "$PHASE3E/live-audio-polish.js" ]] || fail "Missing proven Phase 3E audio polish"
[[ -s "$PHASE3E/live-audio.css" ]] || fail "Missing proven Phase 3E audio CSS"
[[ -s "$PHASE3F/vocoder-diagnostics.js" ]] || fail "Missing proven Phase 3F vocoder diagnostics"
[[ -s "$PHASE3F/vocoder-diagnostics.css" ]] || fail "Missing Phase 3F vocoder diagnostics CSS"

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
manifest['description']='Passive DMR RX Monitor with browser AMBE49 recovery, external YWD Vocoder Protocol v1 live decode, sustained-RX 10-frame/200 ms batching, AUTO call/timeslot selection, backend keepalive while audio is active, and bounded browser PCM playout. The plugin contains no AMBE software vocoder and has no direct RF, serial, MQTT, or network access.'
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')

ui_path=stage/'ui.js'
ui=ui_path.read_text()
needle='        pushCapture(frame, recovered, index);'
if ui.count(needle) != 1:
    raise SystemExit('RX Monitor ui.js hook point changed; expected exactly one pushCapture call')
hook="""        pushCapture(frame, recovered, index);\n        if (typeof window.ywdRxAudioFrame === 'function') {\n          try {\n            window.ywdRxAudioFrame({\n              t: Number(frame.received_at) || 0,\n              path: frame.source,\n              slot: Number(frame.slot),\n              src: Number(frame.src_id),\n              dst: Number(frame.dst_id),\n              group: !!frame.group,\n              burst_seq: Number(frame.seq),\n              dmr_seq: Number(frame.seq_no),\n              n: Number(frame.n),\n              index,\n              ambe49: recovered.hex,\n              fec: recovered.corrected\n            });\n          } catch (_) {}\n        }"""
ui=ui.replace(needle, hook)

poll_needle='      pollTimer = setTimeout(poll, 250);'
if ui.count(poll_needle) != 1:
    raise SystemExit('RX Monitor poll hook point changed; expected exactly one 250 ms success poll')
poll_hook="""      const requestedPollMs = typeof window.ywdRxPollIntervalMs === 'function'\n        ? Number(window.ywdRxPollIntervalMs())\n        : 250;\n      pollTimer = setTimeout(poll, Math.max(75, Math.min(1000, requestedPollMs || 250)));"""
ui=ui.replace(poll_needle, poll_hook)

marker="version:'0.3.0'"
if ui.count(marker) != 1:
    raise SystemExit('RX Monitor capture version marker changed; expected exactly one v0.3.0 marker')
ui=ui.replace(marker, f"version:'{version}'")
ui=ui.replace('PHASE 3B · 49-BIT AMBE+2 FRAME RECOVERY', 'CAPTURE & FEC')
ui=ui.replace('Browser-side FEC, de-scrambling, continuity diagnostics, and bounded capture export. Still no audio decoding.', '')
ui_path.write_text(ui)
PY

# Keep the physically observed Alpha11 engine source immutable. Alpha14 is a
# deterministic staged patch: Alpha13 stabilization plus lower request-rate
# sustained-RX batching sized to Protocol v1's existing 10-frame maximum.
python3 - "$HERE/external-live-audio.js" "$AUDIO_JS" <<'PY'
import pathlib, sys
src=pathlib.Path(sys.argv[1]).read_text()
out=pathlib.Path(sys.argv[2])

def once(old, new, label):
    global src
    count=src.count(old)
    if count != 1:
        raise SystemExit(f'Alpha14 {label} patch point changed (found {count})')
    src=src.replace(old, new)

once('  const CHUNK_FRAMES = 5;', '  const CHUNK_FRAMES = 10;', 'chunk-size')
once('  const AUDIO_POLL_MS = 100;', '  const AUDIO_POLL_MS = 200;', 'audio-poll')
once('  const DEFAULT_BUFFER_MS = 160;', '  const DEFAULT_BUFFER_MS = 240;', 'default-buffer')
once(
    '  const HARD_REANCHOR_EXTRA_MS = 400;\n  const MAX_PENDING_FRAMES = 15;',
    '  const HARD_REANCHOR_EXTRA_MS = 400;\n  const MAX_SCHEDULED_DEPTH_MS = 300;\n  const MAX_PENDING_FRAMES = 15;',
    'latency-ceiling-constant',
)
once(
    """    if (!primed) {
      primeAndScheduleChunk(chunk, nominalMs);
      return;
    }
    if (nextAudioTime < audioCtx.currentTime + 0.005) {""",
    """    if (!primed) {
      primeAndScheduleChunk(chunk, nominalMs);
      return;
    }
    const projectedDepthMs = Math.max(0, (nextAudioTime - audioCtx.currentTime) * 1000) + nominalMs;
    if (projectedDepthMs > MAX_SCHEDULED_DEPTH_MS) {
      stopScheduledSources();
      primed = false;
      nextAudioTime = 0;
      currentPlaybackRate = 1.0;
      reservoirReanchors += 1;
      primeAndScheduleChunk(chunk, nominalMs);
      return;
    }
    if (nextAudioTime < audioCtx.currentTime + 0.005) {""",
    'playout-ceiling',
)
once(
    'Recovered AMBE49 is sent in 5-frame / 100 ms batches to a separately installed YWD Vocoder Protocol v1 backend.',
    'Recovered AMBE49 is sent in 10-frame / 200 ms batches to a separately installed YWD Vocoder Protocol v1 backend.',
    'panel-batch-copy',
)
once(
    'Waiting for 5 recovered AMBE49 frames.',
    'Waiting for 10 recovered AMBE49 frames.',
    'startup-copy',
)
once(
    '<option value="160" selected>160 ms</option><option value="200">200 ms</option><option value="240">240 ms</option>',
    '<option value="160">160 ms</option><option value="200">200 ms</option><option value="240" selected>240 ms</option>',
    'buffer-select',
)
once('100 ms / 5f', '200 ms / 10f', 'initial-chunk-copy')
out.write_text(src)
PY

cat \
  "$AUDIO_JS" \
  "$HERE/stabilize-alpha13.js" \
  "$PHASE3E/live-audio-polish.js" \
  "$PHASE3F/vocoder-diagnostics.js" \
  "$STAGE/ui.js" > "$STAGE/ui.combined.js"
mv "$STAGE/ui.combined.js" "$STAGE/ui.js"
cat "$PHASE3E/live-audio.css" "$PHASE3F/vocoder-diagnostics.css" >> "$STAGE/ui.css"

if find "$STAGE" -type f \( -iname '*mbelib*' -o -name '*.wasm' \) -print -quit | grep -q .; then
  fail "Phase 3G must not contain mbelib or Wasm decoder files"
fi
if grep -Eiq 'createYwdMbeModule|_ywd_mbe_|ywd-mbelib' "$STAGE/ui.js"; then
  fail "Phase 3G ui.js unexpectedly contains embedded-decoder executable symbols"
fi

echo "[OK] No embedded AMBE decoder material"
UI_BYTES="$(wc -c < "$STAGE/ui.js")"
echo "[Phase3G] Combined ui.js : $UI_BYTES bytes"
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

echo "[Phase3G] Building signed sustained-RX external-vocoder candidate..."
python3 "$CORE/tools/ywdplugin-build.py" "$STAGE" "$OUT" \
  --publisher "$PUBLISHER" --sign-key "$PRIVATE_KEY" --key-id "$KEY_ID"

if [[ -f "$PUBLIC_KEY" ]]; then
  bash "$ROOT/PLUGIN-DEV.sh" verify "$OUT"
fi
bash "$ROOT/PLUGIN-DEV.sh" inspect "$OUT"

echo
echo "[OK] RX Monitor Phase 3G candidate ready"
echo "     plugin : dmr-rx-monitor v$VERSION"
echo "     output : $OUT"
echo "     core   : $CORE"
echo "     decoder: NONE (external YWD Vocoder Protocol v1 backend only)"
echo
echo "Alpha14 sustained RX: 10-frame/200 ms vocoder batches + 200 ms active RX polling."
echo "Alpha14 playout: default 240 ms target; scheduled depth remains hard-capped at 300 ms."
echo "Alpha14 preserves Alpha13 sequence-gap reset suppression, keepalive, RTT diagnostics, and no-decoder boundary."
echo "Test goal: long continuous DMR RX must sustain fake-tone PCM without cumulative underrun collapse."
