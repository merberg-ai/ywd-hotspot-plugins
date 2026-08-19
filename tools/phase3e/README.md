# RX Monitor Phase 3E — live browser audio candidate

Phase 3C proved offline mbelib decode to 8 kHz mono PCM WAV. Phase 3D proved the same pinned mbelib decoder can run in a browser and play intelligible audio through Web Audio. Phase 3E wires that proven browser decoder into the live RX Monitor frame stream without changing modem ownership or decoding audio on the Pi Zero.

## Safety boundary

The live candidate keeps the existing `read:dmr-voice` trusted bridge. MMDVM-Host remains the sole modem owner. The plugin still has no serial, MQTT, arbitrary network, filesystem, service, microphone/camera, USB, or RF-TX access. AMBE FEC recovery and mbelib speech synthesis run in the browser.

Core Alpha22.2 introduced one narrow browser permission: the sandboxed frame for an enabled UI plugin that already has `read:dmr-voice` may compile WebAssembly using CSP `wasm-unsafe-eval`. Ordinary Plugin UI frames retain the previous stricter CSP. Alpha22.3 fixed passive voice-bridge pacing. Alpha22.4 intentionally carries that proven core behavior unchanged and serves as the paired test label for RX Monitor v0.4.0-alpha2.

## Candidate design

The normal RX Monitor v0.3.0 source remains the proven repository baseline. `BUILD-LIVE-CANDIDATE.sh` creates a temporary staged v0.4.0-alpha2 package by:

1. reusing/building the exact Phase 3D pinned mbelib browser bundle;
2. patching the proven Phase 3B recovery loop with a browser-memory AMBE49 handoff hook;
3. adding an adaptive poll hook: 250 ms while audio is stopped, 100 ms while START AUDIO is active;
4. prepending the browser decoder and `live-audio.js` to the normal signed `ui.js`;
5. appending the live-audio CSS to the normal `ui.css`;
6. validating the staged UI plugin against the canonical core checkout;
7. enforcing the existing 256 KiB Plugin UI v1 script limit;
8. signing the candidate with the normal YWD plugin developer key.

No generated mbelib bundle, WAV, capture, private key, or staged package source is committed.

## Live controls

The candidate adds explicit `START AUDIO` / `STOP AUDIO`, NETWORK/RF/ALL source selection, ALL/TS1/TS2 filtering, 120/140/160/200/240 ms jitter-buffer targets, volume, mute, live buffer depth, adaptive poll interval, underrun count, decoder error count, stream reset count, and the active route.

The default live-audio source is NETWORK and the default jitter target is 160 ms. Audio never starts automatically; the operator must press `START AUDIO` so mobile browser autoplay rules are respected.

When audio is stopped the normal monitor keeps its proven 250 ms polling cadence. Pressing START AUDIO changes only the next browser-side frame poll interval to 100 ms. STOP AUDIO returns it to 250 ms. Error retry behavior remains unchanged. This is intended to keep the live jitter buffer fed without increasing idle Pi Zero/WebUI load.

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
dist/dmr-rx-monitor-0.4.0-alpha2.ywdplugin
```

The helper prints the Phase 3D decoder size and final combined `ui.js` size. If the candidate exceeds the existing 256 KiB UI-script limit it stops instead of silently weakening core limits.

## Hotspot test order

1. Update YWD-Hotspot `dev-plugins` to Alpha22.4.
2. Confirm normal RF/BrandMeister state, saved static TGs, and the duplex TG fix still work.
3. Upload/install the signed RX Monitor v0.4.0-alpha2 candidate.
4. Enable it and open `RX MONITOR`.
5. Select NETWORK and the active timeslot.
6. Set the jitter buffer to 240 ms for the first comparison test.
7. Press `START AUDIO` and confirm the POLL indicator changes from 250 ms to 100 ms.
8. Use a busy static TG and compare continuity/intelligibility with v0.4.0-alpha1.
9. Watch buffer depth and underruns for several calls.
10. Press STOP AUDIO and confirm POLL returns to 250 ms and normal hotspot operation is unchanged.
11. If stable, step the jitter target down from 240 → 200 → 160 ms and note where underruns begin.

RF-side audio validation is still required before promoting the live-audio candidate to the canonical plugin source.
