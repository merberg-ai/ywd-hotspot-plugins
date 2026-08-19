# DMR RX Monitor

This directory is the **canonical pre-audio RX Monitor source boundary** used by YWD-Hotspot plugin development.

Current manifest version remains `0.3.0` intentionally. It contains the physically proven browser-side DMR deinterleave/FEC/descrambling/49-bit AMBE+2 recovery and bounded capture layer, but it does not contain the locally generated mbelib browser decoder or the live-audio scheduler.

## Why this source is still v0.3

Live RX audio has since been physically proven through the Phase3E development builder, including network AUTO operation and RF-side audio. However, the working `0.4.0-alpha7` candidate is currently assembled locally by:

```text
tools/phase3e/BUILD-LIVE-CANDIDATE.sh
```

That builder combines:

```text
plugins/dmr-rx-monitor        proven v0.3 base
+ locally built browser decoder
+ live-audio scheduler
+ operator-view polish
→ signed local 0.4.0-alpha7 .ywdplugin
```

The split is deliberate. The project still needs an explicit decision about mbelib/Wasm source/binary distribution before the live-audio candidate becomes canonical public plugin source. Generated decoder artifacts must not be committed merely to collapse the development layout.

## Security boundary

The plugin itself has no modem ownership:

- no direct serial/MMDVM device access;
- no direct MQTT access;
- no generic network access from the sandboxed iframe;
- no RF ownership or transmit authority;
- frame reads are capability-gated by trusted YWD-Hotspot core;
- browser capture history is bounded/local to the plugin page.

Current capabilities:

```text
ui:section
read:dmr-voice
```

## Proven v0.3 recovery layer

For each accepted DMR voice burst, browser code:

1. deinterleaves the three AMBE channel codewords;
2. corrects protected Golay words;
3. descrambles C1 using corrected C0 data;
4. combines protected/unprotected bits into three 49-bit AMBE+2 2450 frames;
5. tracks corrected/unrecoverable frames and DMR sequence gaps;
6. maintains a bounded capture ring for JSON export.

A continuous clean stream should recover about 50 AMBE frames/sec. 500 recovered frames represent approximately 10 seconds of nominal voice.

## Live-audio development status

Phase3E has additionally proven, without changing the trusted RF ownership model:

- local mbelib-based browser AMBE→PCM decode;
- 100 ms PCM chunk scheduling;
- adaptive/maintained jitter reservoir;
- browser audio clock correction;
- manual TS1/TS2 playback;
- AUTO call/timeslot locking and handoff;
- busy Worldwide network monitoring;
- RF-side live browser audio.

Those live-audio layers remain in `tools/phase3e/` until the distribution decision is closed.

## Development rule

Do not casually copy the staged Phase3E `ui.js` or generated decoder into this directory and call it a release. Canonicalization should be one deliberate step that:

- resolves the mbelib/Wasm distribution/licensing boundary;
- produces reproducible source/build instructions;
- updates `plugin.json`/README to the promoted version;
- preserves the proven audio engine behavior;
- produces a normal signed package through the canonical YWD package builder.
