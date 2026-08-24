# DMR RX Monitor

[← Repository README](../../README.md) · [Build guide](../../docs/BUILD-RX-MONITOR.md)

DMR RX Monitor is a sandboxed YWD-Hotspot browser UI plugin for passive DMR diagnostics, bounded capture/export, and optional streamed RX speech.

## Current development package

The selected Phase 3J package on `dev-plugins` is:

```text
dmr-rx-monitor 0.4.0-alpha19
```

It is a pre-release build intended for a matching YWD-Hotspot `dev-plugins` core.

## Fast build

From the plugin repository root, after configuring a signing key once with `./PLUGIN-DEV.sh keys`:

```bash
./BUILD-RX-MONITOR.sh
```

Output:

```text
dist/dmr-rx-monitor-0.4.0-alpha19.ywdplugin
```

Full first-time setup, signing, trust-key, upload, and troubleshooting instructions:

**[Build DMR RX Monitor](../../docs/BUILD-RX-MONITOR.md)**

## Live-audio architecture

```text
MMDVM accepted voice copy
        ↓
trusted YWD-Hotspot core
  direct local AF_UNIX live path
  DMR AMBE/FEC recovery
  10-frame / 200 ms batching
        ↓
external YWD Vocoder Protocol v1 backend
        ↓
one persistent NDJSON PCM stream
        ↓
sandboxed RX Monitor iframe
  Web Audio playout only
```

The plugin package contains **no AMBE software vocoder, mbelib source/binary, or Wasm decoder**.

Live speech requires a separately installed YWD Vocoder Protocol v1 backend. Setup guide:

**[External YWD Vocoder Backend](https://github.com/merberg-ai/ywd-hotspot/blob/dev-plugins/docs/VOCODER.md)**

## Selected audio baseline

Current physically selected tuning:

```text
trusted core batch        10 AMBE frames / 200 ms
core live burst tail      12 DMR bursts (~720 ms)
core decoder timeout      400 ms
browser target reservoir  400 ms
browser emergency ceiling 700 ms
playback correction       gentle +/-1%
```

Normal decoder-state resets preserve already-buffered PCM. Explicit stream drop/error events still rebuffer.

The external backend scheduling policy is managed by current YWD-Hotspot core as:

```text
Nice=0
CPUWeight=200
```

## Capabilities / requirements

The current streamed package uses:

```text
capabilities:
  ui:section
  read:dmr-voice
  use:vocoder

dependency:
  mmdvm-cap-demand-gated-dmr-voice
```

The target hotspot therefore needs the YWD Extended MMDVM runtime/capability rather than Stock Upstream for passive DMR voice monitoring.

## Security boundary

RX Monitor has no modem or transmitter ownership:

- no direct serial/MMDVM access;
- no direct MQTT access;
- no direct AF_UNIX access from the plugin sandbox;
- no generic network access from the iframe;
- no arbitrary sudo;
- no RF transmit authority;
- trusted core controls the passive voice and PCM stream capabilities;
- capture history remains bounded/local to the page.

MMDVM-Host remains the sole modem/RF owner.

## Source/build layout

`plugins/dmr-rx-monitor/` remains the stable diagnostic/capture source boundary.

The current streamed-audio distributable is assembled reproducibly at package time from retained Phase 3J components under:

```text
tools/phase3j/
```

This preserves the physically tested Alpha19 implementation without committing generated decoder artifacts or moving decoder code into the plugin package.

End users/builders should use:

```bash
./BUILD-RX-MONITOR.sh
```

Maintainers who need the assembly details can read **[tools/phase3j/README.md](../../tools/phase3j/README.md)**.

## Diagnostic recovery layer

For accepted DMR voice bursts, the diagnostic layer can recover three AMBE+2 2450 frames per burst, track corrected/unrecoverable data and sequence gaps, and maintain a bounded capture ring for export.

Speech synthesis itself is performed only by the separately installed external vocoder backend through trusted YWD-Hotspot core; the sandboxed plugin receives PCM.
