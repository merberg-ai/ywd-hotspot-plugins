#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PHASE3G="$ROOT/tools/phase3g"
BASE_BUILDER="$PHASE3G/BUILD-LIVE-EXTERNAL-CANDIDATE.sh"
TMP_BUILDER="$PHASE3G/.phase3h-alpha15-builder.$$.sh"
VERSION="0.4.0-alpha15"
OUT="$ROOT/dist/dmr-rx-monitor-$VERSION.ywdplugin"

fail() { echo "[FAIL] $*" >&2; exit 1; }
[[ -s "$BASE_BUILDER" ]] || fail "Frozen Alpha14 builder not found: $BASE_BUILDER"

grep -q 'VERSION="0.4.0-alpha14"' "$BASE_BUILDER" \
  || fail "Alpha14 builder version marker changed"
grep -q 'CHUNK_FRAMES = 10' "$BASE_BUILDER" \
  || fail "Alpha14 builder no longer stages 10-frame batches"
grep -q 'AUDIO_POLL_MS = 200' "$BASE_BUILDER" \
  || fail "Alpha14 builder no longer stages 200 ms active polling"

cleanup() {
  rm -f "$TMP_BUILDER"
}
trap cleanup EXIT

python3 - "$BASE_BUILDER" "$TMP_BUILDER" <<'PY'
import pathlib, sys
src=pathlib.Path(sys.argv[1]).read_text()
out=pathlib.Path(sys.argv[2])
replacements=(
    ('VERSION="0.4.0-alpha14"', 'VERSION="0.4.0-alpha15"'),
    ('external-live-audio-alpha14.js', 'external-live-audio-alpha15.js'),
    ('Alpha14 sustained RX:', 'Alpha15 Phase 3H browser baseline:'),
    ('Alpha14 playout:', 'Alpha15 playout:'),
    ('Alpha14 preserves', 'Alpha15 preserves'),
    ('Test goal: long continuous DMR RX must sustain fake-tone PCM without cumulative underrun collapse.',
     'Test goal: isolate persistent core vocoder transport; browser batching/playout remains Alpha14-equivalent.'),
)
for old,new in replacements:
    if old not in src:
        raise SystemExit(f'Phase 3H builder patch marker missing: {old}')
    src=src.replace(old,new)
out.write_text(src)
PY

chmod 700 "$TMP_BUILDER"

echo "[Phase3H] Building Alpha15 from the frozen Alpha14 browser recipe..."
"$TMP_BUILDER"

[[ -s "$OUT" ]] || fail "Expected Alpha15 package was not produced: $OUT"

echo
echo "[OK] Phase 3H Alpha15 candidate ready"
echo "     plugin    : dmr-rx-monitor v$VERSION"
echo "     output    : $OUT"
echo "     browser   : Alpha14-equivalent 10f/200ms path"
echo "     transport : persistent YWD Vocoder Protocol v1 supplied by current core"
echo "     decoder   : NONE"
