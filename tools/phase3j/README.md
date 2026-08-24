# Phase 3J Streamed RX Audio — Maintainer Notes

[← Build guide](../../docs/BUILD-RX-MONITOR.md) · [DMR RX Monitor](../../plugins/dmr-rx-monitor/README.md)

This directory contains the retained assembly components for the physically selected DMR RX Monitor streamed-audio package on `dev-plugins`.

> [!TIP]
> End users/builders should normally run `./BUILD-RX-MONITOR.sh` from the repository root. This directory documents how that wrapper assembles the tested package.

## Selected baseline

```text
plugin package             dmr-rx-monitor 0.4.0-alpha19
browser target reservoir   400 ms
browser emergency ceiling  700 ms
adaptive playback          gentle +/-1%, 40 ms deadband
normal decoder reset       preserve scheduled PCM
explicit drop/error        rebuffer
browser output             48 kHz Web Audio
trusted core batch         10 AMBE frames / 200 ms
core live burst tail       12 DMR bursts (~720 ms)
core vocoder timeout       400 ms
external vocoder policy    Nice=0 / CPUWeight=200
```

The later Alpha20 900 ms emergency-reservoir / deeper-tail experiment was discarded because it did not show a useful enough improvement to justify the added elasticity.

## User-facing build command

From the repository root:

```bash
./BUILD-RX-MONITOR.sh
```

That wrapper verifies basic prerequisites/signing configuration and calls:

```bash
bash tools/phase3j/BUILD-STREAMED-LIVE-CANDIDATE.sh
```

Output:

```text
dist/dmr-rx-monitor-0.4.0-alpha19.ywdplugin
```

Signing configuration comes from:

```text
~/.config/ywd-hotspot-plugins/build.json
```

and is normally created with:

```bash
./PLUGIN-DEV.sh keys
```

## Retained components

- `streamed-live-audio.js` — persistent streamed-PCM Web Audio client, reservoir controller, stats and live controls.
- `stream-polish.js` — streamed-audio UI/polish layer.
- `alpha19-playout-patch.py` — preserves buffered PCM across normal decoder-state resets, renames the status counter to HEARTBEATS, and clears stale transient error text after PCM resumes.
- `BUILD-STREAMED-LIVE-CANDIDATE.sh` — assembles and validates the signed Alpha19 package.

The builder starts with the stable diagnostic/capture source under `plugins/dmr-rx-monitor/`, stages a temporary copy, applies the retained streamed-audio layers, validates it against the matching core checkout, and signs the final `.ywdplugin`.

## Build invariants

The Phase 3J builder fails closed if the selected package no longer satisfies important tested assumptions, including:

- required `ui:section`, `read:dmr-voice`, and `use:vocoder` capabilities;
- required demand-gated passive DMR voice dependency;
- no mbelib or Wasm decoder files in the staged plugin;
- no legacy browser decode/POST worker path;
- streamed audio API hook present;
- 400 ms target / 700 ms emergency reservoir settings present;
- gentle +/-1% playback correction present;
- reset-tolerant Alpha19 behavior present;
- Plugin UI v1 JavaScript size ceiling respected;
- manifest validates through current core;
- package is signed with the configured publisher key.

If Node.js exists locally, JavaScript syntax is also checked with `node --check`.

## Architecture boundary

```text
MMDVM-Host / normal RF path
        ↓ passive copy
trusted YWD-Hotspot voice bridge
        ↓ direct local live IPC
trusted DMR recovery/FEC/batching
        ↓
external YWD Vocoder Protocol v1 backend
        ↓ PCM
trusted NDJSON stream
        ↓
sandboxed RX Monitor iframe
```

The plugin has no direct serial, MMDVM, MQTT, AF_UNIX, generic network, or RF-TX authority. It contains no software AMBE decoder.

External decoder setup belongs to YWD-Hotspot core documentation:

**[External YWD Vocoder Backend](https://github.com/merberg-ai/ywd-hotspot/blob/dev-plugins/docs/VOCODER.md)**

## Why the source is still assembled

The current cleanup deliberately does not rewrite the physically proven Alpha19 implementation merely to make the source tree prettier. `plugins/dmr-rx-monitor/` stays the stable diagnostic/capture source boundary and this directory contains the reproducible streamed-audio overlay that produced the tested package.

A future source-consolidation pass should be treated as a new implementation change and physically retested rather than silently replacing this proven assembly.
