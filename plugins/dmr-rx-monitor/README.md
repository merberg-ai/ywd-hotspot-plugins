# DMR RX Monitor

DMR RX Monitor is a sandboxed YWD-Hotspot UI plugin for passive DMR frame diagnostics, bounded capture/export, and optional streamed RX audio.

## Current `dev-plugins` audio candidate

The selected Phase 3J candidate is `0.4.0-alpha19`.

Its live-audio architecture is deliberately split across trust boundaries:

```text
MMDVM voice telemetry
        |
        v
trusted YWD-Hotspot core
  - direct local AF_UNIX datagram live path
  - DMR AMBE/FEC recovery
  - 10-frame / 200 ms batching
  - external YWD Vocoder Protocol v1 decode
        |
        v
one persistent NDJSON PCM stream
        |
        v
sandboxed RX Monitor iframe
  - Web Audio reservoir/playout only
```

The plugin contains no AMBE software vocoder, mbelib binary/source, or Wasm decoder.

### Selected playout settings

- 400 ms target browser reservoir
- 700 ms emergency scheduled-depth ceiling
- gentle +/-1% adaptive playback correction
- normal decoder-state resets do not discard already-buffered PCM
- explicit stream drop/error events rebuffer
- 48 kHz browser audio output

The matching tested core policy uses a 12-burst bounded live tail, 400 ms decoder timeout, and external decoder scheduling policy `Nice=0` / `CPUWeight=200`.

## Source layout

The canonical `plugins/dmr-rx-monitor/` directory remains the stable diagnostic/capture source boundary. The Phase 3J streamed-audio layer is assembled reproducibly from `tools/phase3j/` so the external-decoder distribution boundary stays explicit and no generated decoder material is committed into the plugin.

Build the current signed candidate with:

```bash
bash tools/phase3j/BUILD-STREAMED-LIVE-CANDIDATE.sh
```

Output:

```text
dist/dmr-rx-monitor-0.4.0-alpha19.ywdplugin
```

See `tools/phase3j/README.md` for the retained Phase 3J components and final tuning baseline.

## Security boundary

The plugin has no modem or transmitter ownership:

- no direct serial/MMDVM access;
- no direct MQTT access;
- no direct AF_UNIX socket access;
- no generic network access from the sandboxed iframe;
- no RF transmit authority;
- frame/stream access remains capability-gated by trusted YWD-Hotspot core;
- capture history is bounded and local to the plugin page.

Current capabilities used by the streamed candidate are:

```text
ui:section
read:dmr-voice
use:vocoder
```

## Diagnostic recovery layer

For accepted DMR voice bursts, the diagnostic layer can recover the three AMBE+2 2450 frames, track corrected/unrecoverable data and sequence gaps, and maintain a bounded capture ring for export. Live speech synthesis itself is performed only through the separately installed external vocoder backend managed by trusted core.
