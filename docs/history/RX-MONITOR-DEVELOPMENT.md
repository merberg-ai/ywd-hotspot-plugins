# RX Monitor Development History

[← Historical docs](README.md) · [Current RX Monitor](../../plugins/dmr-rx-monitor/README.md)

This is a condensed map of the proof stages that led to the current streamed RX Monitor. The old phase tool directories are intentionally absent from the active tree; Git history and retained checkpoint refs preserve their exact source.

## Phase 3C — offline AMBE → PCM proof

Recovered 49-bit AMBE+2 frames from RX Monitor captures were decoded off-hotspot with pinned mbelib into 8 kHz mono PCM/WAV. This proved the recovered frame format and ordering before changing the live runtime.

## Phase 3D — local browser decoder proof

A browser-side decoder harness proved WebAssembly/browser synthesis and playout mechanics. This was development proof only and is no longer the selected architecture.

## Phase 3E — embedded-decoder live audio

Live RX Monitor audio was integrated with browser-side decoder material and playout polish. The final product deliberately moved away from shipping decoder executable material in the plugin.

## Phase 3F — external vocoder boundary

The trusted dashboard/sandbox boundary for YWD Vocoder Protocol v1 STATUS/RESET/DECODE was proven. This established the external-decoder distribution/security boundary.

Useful historical anchor:

```text
checkpoint-dev-plugins-phase3f-alpha10-vocoder-boundary-proven
```

## Phase 3G — external-vocoder live audio

Live browser audio moved to a separately installed vocoder backend. Early versions used repeated request/response browser decode activity and progressively bounded latency/backlog.

## Phase 3H — persistent vocoder transport

Alpha15 proved persistent external-vocoder session reuse and isolated scheduler/delivery stalls from actual mbelib compute cost.

Historical anchors include:

```text
checkpoint-dev-plugins-phase3h-alpha15-persistent-reuse-observed
checkpoint-dev-plugins-phase3h-alpha15-pre-real-vocoder
```

## Phase 3I — real mbelib backend / scheduling proof

The real Protocol v1 mbelib backend was exercised on the Pi Zero. Standalone decode throughput was substantially faster than real time; the remaining problems were live scheduling/delivery rather than codec computation.

Useful anchor:

```text
checkpoint-dev-plugins-phase3i-alpha15-mbelib-protocol-sanity-proven
```

## Phase 3J — trusted streamed PCM path

The selected architecture moved real-time burst transport and decode batching into trusted core:

```text
MMDVM accepted voice copy
  → direct AF_UNIX live datagram
  → trusted DMR recovery/FEC
  → 10 AMBE49 frames / 200 ms
  → external YWD Vocoder Protocol v1 backend
  → persistent NDJSON PCM stream
  → sandboxed Web Audio playout
```

Alpha16 introduced the streamed path. Subsequent tuning reduced Pi Zero contention and improved browser reservoir behavior. Alpha19 made normal decoder-state resets non-destructive to already-buffered PCM and became the selected package.

Final plugin checkpoint:

```text
checkpoint-dev-plugins-phase3j-alpha19-proven
```

Pre-stream reference:

```text
checkpoint-dev-plugins-phase3j-pre-stream-plugin
```

## Selected current behavior

```text
package                   dmr-rx-monitor 0.4.0-alpha19
browser target            400 ms
browser emergency depth   700 ms
playback correction       gentle +/-1%
normal resets             preserve buffered PCM
explicit drop/error       rebuffer
core batch                10 AMBE49 frames / 200 ms
external decoder          required for live speech
bundled decoder           none
```

The active source/build workflow is documented in `docs/BUILD-RX-MONITOR.md` and `tools/rx-monitor/README.md`.
