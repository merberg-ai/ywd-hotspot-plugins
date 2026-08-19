# RX Monitor Phase 3E — live browser audio candidate

Phase 3C proved offline mbelib decode to 8 kHz mono PCM WAV. Phase 3D proved the same pinned mbelib decoder can run in a browser and play intelligible audio through Web Audio. Phase 3E wires that proven browser decoder into the live RX Monitor frame stream without changing modem ownership or decoding audio on the Pi Zero.

## Safety boundary

The live candidate keeps the existing `read:dmr-voice` trusted bridge. MMDVM-Host remains the sole modem owner. The plugin still has no serial, MQTT, arbitrary network, filesystem, service, microphone/camera, USB, or RF-TX access. AMBE FEC recovery and mbelib speech synthesis run in the browser.

Core Alpha22.2 introduced one narrow browser permission: the sandboxed frame for an enabled UI plugin that already has `read:dmr-voice` may compile WebAssembly using CSP `wasm-unsafe-eval`. Alpha22.3 fixed the buffered subscriber drain. Alpha22.5 moves whole-ring JSON snapshot serialization into a separate nice'd writer process so the MQTT ingestion interpreter is not occupied by full-ring `json.dump()` work while voice bursts are waiting.

## Candidate design

The normal RX Monitor v0.3.0 source remains the proven repository baseline. `BUILD-LIVE-CANDIDATE.sh` creates a temporary staged v0.4.0-alpha3 package by:

1. reusing/building the exact Phase 3D pinned mbelib browser bundle;
2. patching the proven Phase 3B recovery loop with a browser-memory AMBE49 handoff hook;
3. keeping adaptive polling at 250 ms while audio is stopped and 100 ms while START AUDIO is active;
4. replacing live-audio `ALL` slot playback with an `AUTO` call lock that accepts one `(path,slot,src,dst,group)` route at a time;
5. keeping explicit TS1 and TS2 manual choices for deterministic testing;
6. prepending the browser decoder and `live-audio.js` to the normal signed `ui.js`;
7. appending the live-audio CSS to the normal `ui.css`;
8. validating/signing the staged plugin while enforcing the existing 256 KiB UI-script limit.

No generated mbelib bundle, WAV, capture, private key, or staged package source is committed.

## AUTO call lock

`AUTO` is the default slot mode in alpha3. The first eligible live route becomes the playback lock. Frames from simultaneous traffic on the other timeslot are ignored for audio instead of resetting mbelib and the jitter buffer. After the locked route has been quiet for about 900 ms, the next eligible route may acquire the lock. Changing source, slot, or jitter target explicitly resets the lock and audio pipeline.

The capture/export path is unchanged and may still contain both timeslots; AUTO affects only live playback.

## Live controls

The candidate provides explicit `START AUDIO` / `STOP AUDIO`, NETWORK/RF/ALL source selection, AUTO/TS1/TS2 slot selection, 120/140/160/200/240 ms jitter-buffer targets, volume, mute, live buffer depth, adaptive poll interval, underrun count, decoder error count, stream reset count, and the active route.

The default source is NETWORK, slot mode is AUTO, and jitter target is 160 ms. Audio never starts automatically.

## Build on ubuntu-mini

```bash
cd ~/ywd-plugin-dev/ywd-hotspot-plugins
git checkout main
git pull --ff-only origin main
chmod +x tools/phase3e/BUILD-LIVE-CANDIDATE.sh
bash tools/phase3e/BUILD-LIVE-CANDIDATE.sh
```

Expected signed package:

```text
dist/dmr-rx-monitor-0.4.0-alpha3.ywdplugin
```

## Hotspot test order

1. Update YWD-Hotspot `dev-plugins` to Alpha22.5.
2. Confirm normal RF/BrandMeister state, saved static TGs, and duplex TG controls remain correct.
3. Upload/install RX Monitor v0.4.0-alpha3.
4. Start with NETWORK / AUTO / 160 ms and press START AUDIO.
5. Confirm POLL changes from 250 ms to 100 ms and the route display shows the one AUTO-locked call.
6. Listen through several overlapping TS1/TS2 calls and watch UNDERRUNS / STREAM RESETS.
7. Repeat using manual TS1 and TS2.
8. If 160 ms is stable, try 140 ms, then 120 ms.
9. Export a new capture for timestamp-gap comparison with Alpha22.4/alpha2.

RF-side audio validation is still required before promoting the live-audio candidate to the canonical plugin source.
