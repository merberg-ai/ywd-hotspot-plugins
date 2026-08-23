# Phase 3J streamed RX audio

This directory contains the retained development/build components for the proven DMR RX Monitor streamed-audio candidate on `dev-plugins`.

## Selected baseline

The cleanup baseline intentionally keeps the physically tested Alpha19 behavior rather than the later elasticity experiment:

- plugin package: `dmr-rx-monitor 0.4.0-alpha19`
- browser target reservoir: 400 ms
- browser emergency scheduled-depth ceiling: 700 ms
- adaptive playback correction: gentle +/-1% with a 40 ms deadband
- normal decoder-state resets preserve already-buffered PCM
- explicit stream drop/error events rebuffer
- output: 48 kHz Web Audio
- trusted core batching: 10 AMBE frames / 200 ms
- external decoder only; no mbelib/Wasm decoder is bundled in the plugin

The matching core baseline uses direct AF_UNIX datagram live voice IPC, a 12-burst (~720 ms) bounded live tail, a 400 ms vocoder request timeout, and YWD-managed external decoder scheduling policy `Nice=0` / `CPUWeight=200`.

## Build

From the plugin repository root:

```bash
bash tools/phase3j/BUILD-STREAMED-LIVE-CANDIDATE.sh
```

The signed package is written to:

```text
dist/dmr-rx-monitor-0.4.0-alpha19.ywdplugin
```

Signing configuration continues to come from the normal plugin development configuration.

## Retained source components

- `streamed-live-audio.js` — one persistent streamed-PCM Web Audio client and reservoir controller.
- `stream-polish.js` — RX Monitor streamed-audio UI/polish layer.
- `alpha19-playout-patch.py` — small reproducible overlay that makes normal decoder-state resets non-destructive to buffered PCM, renames keepalive UI to heartbeats, and clears stale transient errors after PCM resumes.
- `BUILD-STREAMED-LIVE-CANDIDATE.sh` — validates the source boundary, assembles the Alpha19 candidate, verifies the no-bundled-vocoder rule, and signs the package.

The discarded Alpha20 900 ms emergency-reservoir experiment is intentionally not part of the selected baseline.

## Architecture boundary

Live RF/DMR ownership remains in trusted YWD-Hotspot core. The sandboxed plugin receives PCM stream events only. It has no direct serial, MMDVM, MQTT, AF_UNIX, or generic network access and contains no AMBE speech decoder.

The older diagnostic/capture layer remains available independently of live audio.
