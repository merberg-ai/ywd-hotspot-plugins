# RX Monitor Phase 3E — live browser audio candidate

Phase 3C proved offline mbelib decode to 8 kHz mono PCM WAV. Phase 3D proved the same pinned mbelib decoder can run in a browser and play intelligible audio through Web Audio. Phase 3E wires that proven browser decoder into the live RX Monitor frame stream without changing modem ownership or decoding audio on the Pi Zero.

## Safety boundary

The live candidate keeps the existing `read:dmr-voice` trusted bridge. MMDVM-Host remains the sole modem owner. The plugin still has no serial, MQTT, arbitrary network, filesystem, service, microphone/camera, USB, or RF-TX access. AMBE FEC recovery and mbelib speech synthesis run in the browser.

Core Alpha22.2 introduced one narrow browser permission: the sandboxed frame for an enabled UI plugin that already has `read:dmr-voice` may compile WebAssembly using CSP `wasm-unsafe-eval`. Alpha22.3 fixed the buffered subscriber drain. Alpha22.5 moved whole-ring JSON snapshot serialization into a separate nice'd writer process. Alpha22.5 remains intentionally unchanged for the alpha5 browser-playout test.

## Candidate design

The normal RX Monitor v0.3.0 source remains the proven repository baseline. `BUILD-LIVE-CANDIDATE.sh` creates a temporary staged v0.4.0-alpha5 package by:

1. reusing/building the exact Phase 3D pinned mbelib browser bundle;
2. patching the proven Phase 3B recovery loop with a browser-memory AMBE49 handoff that now also carries the bridge `received_at` timestamp;
3. keeping adaptive polling at 250 ms while audio is stopped and 100 ms while START AUDIO is active;
4. decoding every AMBE frame normally so mbelib vocoder state stays continuous;
5. keeping five decoded 20 ms PCM frames per normal 100 ms Web Audio chunk;
6. actively regulating the scheduled-audio reservoir around the selected jitter target with playback-rate correction capped at +/-2%;
7. flushing partial old-call PCM chunks at normal call transitions instead of discarding them;
8. making AUTO follow a different caller/route on the same DMR timeslot immediately while retaining the 450 ms bridge-time guard before moving to the other timeslot;
9. preserving already-scheduled old-call audio during normal handoffs so the next call appends after the current tail instead of stopping all Web Audio nodes;
10. allowing a hard re-anchor only at a real route/gap boundary if scheduled depth exceeds the selected target by more than 400 ms;
11. reporting browser AUDIO RATE, CHUNK size/count, PLAY RATE, AUTO HANDOFFS, REANCHORS, buffer depth, underruns, decoder errors, resets, and the active route;
12. prepending the browser decoder and `live-audio.js` to the normal signed `ui.js` and validating/signing the staged plugin while enforcing the existing 256 KiB UI-script limit.

No generated mbelib bundle, WAV, capture, private key, or staged package source is committed.

## Maintained playout reservoir

Alpha4 proved that 100 ms chunking materially improves live audio, but long calls could let scheduled depth drift far above the selected jitter target. Alpha5 treats the selected target as a maintained reservoir instead of startup lead only.

For each chunk, the scheduler compares projected scheduled depth with the selected target. Inside a small deadband playback stays exactly 1.000x. If the queue grows too deep, upcoming chunks may run slightly faster; if it becomes shallow, upcoming chunks may run slightly slower. Correction is capped at 0.980x to 1.020x.

The operator-visible `PLAY RATE` diagnostic shows the current correction. Normal operation should stay close to 1.000x. A large accumulated queue may be discarded only at a real call boundary when it exceeds the selected target by more than 400 ms; these events increment `REANCHORS`.

## Non-destructive call transitions

Normal route changes, call gaps, and decoder resets no longer stop all already-scheduled audio. Any partial one-to-four-frame PCM chunk from the old call is flushed as a short Web Audio buffer, mbelib is reset for the new stream, and new-call chunks append after the existing scheduled tail.

This removes the repeated 20-80 ms syllable loss seen when alpha4 discarded partial chunks at every stream reset.

## AUTO call selection

`AUTO` remains the default slot mode. Call decisions now use the bridge frame timestamp rather than browser callback timing.

A different route on the same DMR timeslot is treated as a real caller handoff and becomes active immediately. Traffic on the other timeslot may be simultaneous, so AUTO only crosses TS1/TS2 after the locked route has been quiet for about 450 ms in bridge time.

Manual TS1 and TS2 choices remain available. Capture/export is unchanged and may still contain both timeslots; AUTO affects only live playback.

## Live controls

The candidate provides explicit `START AUDIO` / `STOP AUDIO`, NETWORK/RF/ALL source selection, AUTO/TS1/TS2 slot selection, 120/140/160/200/240 ms jitter-buffer targets, volume, mute, live buffer depth, adaptive poll interval, browser AUDIO RATE, CHUNK size, CHUNKS scheduled, PLAY RATE, HANDOFFS, REANCHORS, underrun count, decoder error count, stream reset count, and the active route.

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
dist/dmr-rx-monitor-0.4.0-alpha5.ywdplugin
```

## Hotspot test order

1. Leave YWD-Hotspot core on Alpha22.5; no core update is required.
2. Replace RX Monitor alpha4 with v0.4.0-alpha5.
3. Start with NETWORK / manual TS2 or TS1 / 160 ms, then try 140 ms.
4. Confirm POLL is 100 ms, CHUNK is `100 ms / 5f`, AUDIO RATE is the browser output rate, and PLAY RATE stays near 1.000x.
5. During a long call, watch BUFFER. It should remain near the selected target instead of climbing into many hundreds of milliseconds.
6. Switch to NETWORK / AUTO / 160 ms, then 140 ms.
7. On a busy talkgroup, confirm caller changes on the same timeslot are heard immediately instead of losing the first ~450 ms.
8. Watch HANDOFFS / REANCHORS / UNDERRUNS / STREAM RESETS and note any audible chop at transitions.
9. Export another capture if audio remains garbled or buffer depth still runs away.

RF-side audio validation is still required before promoting the live-audio candidate to the canonical plugin source.
