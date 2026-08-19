# RX Monitor Phase 3E — live browser audio candidate

Phase 3C proved offline mbelib decode to 8 kHz mono PCM WAV. Phase 3D proved the same pinned mbelib decoder can run in a browser and play intelligible audio through Web Audio. Phase 3E wires that proven browser decoder into the live RX Monitor frame stream without changing modem ownership or decoding audio on the Pi Zero.

## Safety boundary

The live candidate keeps the existing `read:dmr-voice` trusted bridge. MMDVM-Host remains the sole modem owner. The plugin still has no serial, MQTT, arbitrary network, filesystem, service, microphone/camera, USB, or RF-TX access. AMBE FEC recovery and mbelib speech synthesis run in the browser.

Core Alpha22.2 introduced one narrow browser permission: the sandboxed frame for an enabled UI plugin that already has `read:dmr-voice` may compile WebAssembly using CSP `wasm-unsafe-eval`. Alpha22.3 fixed the buffered subscriber drain. Alpha22.5 moves whole-ring JSON snapshot serialization into a separate nice'd writer process so the MQTT ingestion interpreter is not occupied by full-ring `json.dump()` work while voice bursts are waiting. Alpha22.5 is intentionally unchanged for the alpha4 browser-playout test.

## Candidate design

The normal RX Monitor v0.3.0 source remains the proven repository baseline. `BUILD-LIVE-CANDIDATE.sh` creates a temporary staged v0.4.0-alpha4 package by:

1. reusing/building the exact Phase 3D pinned mbelib browser bundle;
2. patching the proven Phase 3B recovery loop with a browser-memory AMBE49 handoff hook;
3. keeping adaptive polling at 250 ms while audio is stopped and 100 ms while START AUDIO is active;
4. keeping AUTO single-call route locking, but shortening lock release to 450 ms of silence;
5. decoding every AMBE frame normally so mbelib vocoder state stays continuous;
6. coalescing five decoded 20 ms PCM frames into one 100 ms / 800-sample Web Audio chunk;
7. scheduling roughly 10 AudioBufferSource nodes per second instead of roughly 50 per second;
8. reporting the browser AudioContext sample rate, chunk size, chunk count, buffer depth, underruns, decoder errors, resets, and active route;
9. prepending the browser decoder and `live-audio.js` to the normal signed `ui.js` and validating/signing the staged plugin while enforcing the existing 256 KiB UI-script limit.

No generated mbelib bundle, WAV, capture, private key, or staged package source is committed.

## Chunked PCM scheduler

AMBE+2 remains a 20 ms / 160-sample decode clock at 8 kHz. Alpha4 does not alter that decoder cadence. Instead, five consecutive decoded PCM frames are joined into one 100 ms / 800-sample chunk before being submitted to Web Audio.

The selected jitter target is treated as scheduled-audio lead. For a 140 ms target, a newly primed 100 ms chunk starts about 40 ms in the future and leaves about 140 ms of scheduled audio depth after insertion. Subsequent chunks are placed contiguously on the same AudioContext timeline. This reduces per-node scheduling/resampling boundaries without forcing a larger operator-visible jitter setting.

When a call gap, route change, source change, slot change, or jitter-target change resets the live pipeline, any already-scheduled old-route audio nodes are stopped so buffered tail audio cannot overlap the next route.

## AUTO call lock

`AUTO` remains the default slot mode. The first eligible live route becomes the playback lock. Frames from simultaneous traffic on the other timeslot are ignored for audio instead of resetting mbelib and the jitter buffer. After the locked route has been quiet for about 450 ms, the next eligible route may acquire the lock. Manual TS1 and TS2 choices remain available.

The capture/export path is unchanged and may still contain both timeslots; AUTO affects only live playback.

## Live controls

The candidate provides explicit `START AUDIO` / `STOP AUDIO`, NETWORK/RF/ALL source selection, AUTO/TS1/TS2 slot selection, 120/140/160/200/240 ms jitter-buffer targets, volume, mute, live buffer depth, adaptive poll interval, browser AUDIO RATE, CHUNK size, CHUNKS scheduled, underrun count, decoder error count, stream reset count, and the active route.

The default source is NETWORK, slot mode is AUTO, and jitter target is 160 ms. Audio never starts automatically.

## Build on ubuntu-mini

```bash
cd ~/ywd-plugin-dev/ywd-hotspot-plugins
git checkout main
git pull --ff-only origin main
chmod +x tools/phase3e/BUILD-LIVE-CANDIDATE.sh
node --check tools/phase3e/live-audio.js
bash -n tools/phase3e/BUILD-LIVE-CANDIDATE.sh
bash tools/phase3e/BUILD-LIVE-CANDIDATE.sh
```

Expected signed package:

```text
dist/dmr-rx-monitor-0.4.0-alpha4.ywdplugin
```

## Hotspot test order

1. Leave YWD-Hotspot core on Alpha22.5; no new core update is required for this candidate.
2. Confirm normal RF/BrandMeister state, saved static TGs, and duplex TG controls remain correct.
3. Replace RX Monitor alpha3 with v0.4.0-alpha4.
4. Start with NETWORK / AUTO / 160 ms and press START AUDIO.
5. Confirm POLL changes from 250 ms to 100 ms, CHUNK shows `100 ms / 5f`, and AUDIO RATE shows the browser output rate.
6. Listen through several calls and watch BUFFER / UNDERRUNS / STREAM RESETS.
7. Repeat at the previously promising 140 ms target.
8. Compare AUTO with manual TS1 or TS2 on a busy talkgroup.
9. Export a new capture if audible garble or rebuffering remains.

RF-side audio validation is still required before promoting the live-audio candidate to the canonical plugin source.
