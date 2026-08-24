# DMR RX Monitor

DMR RX Monitor is a sandboxed YWD-Hotspot UI plugin for passive DMR frame diagnostics, bounded capture/export, and optional streamed RX audio.

## Current package

```text
dmr-rx-monitor 0.4.0-alpha19
```

Build from the repository root:

```bash
./BUILD-RX-MONITOR.sh
```

Output:

```text
dist/dmr-rx-monitor-0.4.0-alpha19.ywdplugin
```

Full build/install guide: [`docs/BUILD-RX-MONITOR.md`](../../docs/BUILD-RX-MONITOR.md).

## Live-audio architecture

```text
MMDVM accepted DMR voice
        ↓
trusted YWD-Hotspot core
  direct local live IPC
  DMR AMBE/FEC recovery
  10-frame / 200 ms batching
        ↓
external YWD Vocoder Protocol v1 backend
        ↓
one persistent NDJSON PCM stream
        ↓
sandboxed RX Monitor iframe
  Web Audio reservoir/playout only
```

The plugin contains no mbelib source/binary, AMBE software vocoder, or AMBE Wasm decoder.

## Selected playout behavior

- 400 ms target browser reservoir;
- 700 ms emergency scheduled-depth ceiling;
- gentle +/-1% adaptive playback correction;
- normal decoder-state resets do not discard already-buffered PCM;
- explicit stream drop/error events rebuffer;
- 48 kHz browser Web Audio output.

The matching core baseline uses a 12-burst bounded live tail, 400 ms vocoder request timeout, and external decoder scheduling policy `Nice=0` / `CPUWeight=200`.

## External vocoder

Live speech requires a separately installed YWD Vocoder Protocol v1 backend. The plugin never installs/downloads a decoder.

Setup guide:

**[YWD-Hotspot External Vocoder Backend](https://github.com/merberg-ai/ywd-hotspot/blob/dev/docs/VOCODER.md)**

## Source boundary

`plugins/dmr-rx-monitor/` contains the stable diagnostic/capture source boundary. The current streamed-audio package adds the proven Alpha19 audio layer from `tools/rx-monitor/` during build.

This split is intentional for now: it preserves the physically selected package behavior without pretending that the older base source directory alone is the live-audio distributable.

Active build internals:

```text
tools/rx-monitor/
```

Historical Phase 3x proof directories are no longer carried in the active tree.

## Capabilities

```text
ui:section
read:dmr-voice
use:vocoder
```

Dependency:

```text
mmdvm-cap-demand-gated-dmr-voice
```

## Security boundary

RX Monitor has:

- no direct serial/MMDVM access;
- no direct MQTT access;
- no direct AF_UNIX socket access;
- no generic network access from the iframe;
- no RF transmit authority;
- bounded capture history local to the plugin page.

Trusted core owns all privileged transport/recovery/vocoder work and delivers only capability-scoped data/PCM to the sandbox.

## Diagnostics

For accepted DMR voice bursts, the diagnostic layer tracks recovered AMBE+2 2450 frames, FEC corrections/unrecoverable data, sequence continuity, bounded capture/export, stream health, decode RTT, dropped bursts, underruns, resets, and reanchors.
