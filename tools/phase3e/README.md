# RX Monitor Phase 3E — live browser audio candidate

Phase 3C proved offline mbelib decode to 8 kHz mono PCM WAV. Phase 3D proved the same pinned mbelib decoder can run in a browser and play intelligible audio through Web Audio. Phase 3E wires that proven browser decoder into the live RX Monitor frame stream without changing modem ownership or decoding audio on the Pi Zero.

## Safety boundary

The live candidate keeps the existing `read:dmr-voice` trusted bridge. MMDVM-Host remains the sole modem owner. The plugin still has no serial, MQTT, arbitrary network, filesystem, service, microphone/camera, USB, or RF-TX access. AMBE FEC recovery and mbelib speech synthesis run in the browser.

Core Alpha22.2 adds one narrow browser permission: the sandboxed frame for an enabled UI plugin that already has `read:dmr-voice` may compile WebAssembly using CSP `wasm-unsafe-eval`. Ordinary Plugin UI frames retain the previous stricter CSP.

## Candidate design

The normal RX Monitor v0.3.0 source remains the proven repository baseline. `BUILD-LIVE-CANDIDATE.sh` creates a temporary staged v0.4.0-alpha1 package by:

1. reusing/building the exact Phase 3D pinned mbelib browser bundle;
2. patching the proven Phase 3B recovery loop with a browser-memory AMBE49 handoff hook;
3. prepending the browser decoder and `live-audio.js` to the normal signed `ui.js`;
4. appending the live-audio CSS to the normal `ui.css`;
5. validating the staged UI plugin against the canonical core checkout;
6. enforcing the existing 256 KiB Plugin UI v1 script limit;
7. signing the candidate with the normal YWD plugin developer key.

No generated mbelib bundle, WAV, capture, private key, or staged package source is committed.

## Live controls

The candidate adds explicit `START AUDIO` / `STOP AUDIO`, NETWORK/RF/ALL source selection, ALL/TS1/TS2 filtering, 120/140/160/200/240 ms jitter-buffer targets, volume, mute, live buffer depth, underrun count, decoder error count, stream reset count, and the active route.

The default live-audio source is NETWORK and the default jitter target is 160 ms. Audio never starts automatically; the operator must press `START AUDIO` so mobile browser autoplay rules are respected.

A stream change, DMR sequence discontinuity, or normal call gap resets mbelib state and re-primes the jitter buffer so vocoder state from one call cannot bleed into another.

## Build on ubuntu-mini

First update both repositories, then build the candidate:

```bash
cd ~/ywd-plugin-dev/ywd-hotspot-plugins
git checkout main
git pull --ff-only origin main
chmod +x tools/phase3e/BUILD-LIVE-CANDIDATE.sh
bash tools/phase3e/BUILD-LIVE-CANDIDATE.sh
```

If the normal plugin signing key is configured, the expected output is:

```text
dist/dmr-rx-monitor-0.4.0-alpha1.ywdplugin
```

The helper prints the Phase 3D decoder size and final combined `ui.js` size. If the candidate exceeds the existing 256 KiB UI-script limit it stops instead of silently weakening core limits.

## Hotspot test order

1. Update YWD-Hotspot `dev-plugins` to Alpha22.2.
2. Confirm normal RF/BrandMeister state and the duplex TG fix still work.
3. Upload/install the signed RX Monitor v0.4.0-alpha1 candidate.
4. Enable it and open `RX MONITOR`.
5. Select NETWORK and the active timeslot.
6. Press `START AUDIO`.
7. Use a busy static TG and confirm intelligible live browser audio.
8. Watch buffer depth and underruns for several calls.
9. Stop audio and confirm normal hotspot operation is unchanged.

Do not promote the candidate to the canonical plugin source until this live test passes.
