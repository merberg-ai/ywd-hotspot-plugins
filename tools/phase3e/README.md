# RX Monitor Phase 3E — live browser audio candidate

Phase 3C proved offline mbelib decode to 8 kHz mono PCM WAV. Phase 3D proved the same pinned mbelib decoder can run in a browser and play intelligible audio through Web Audio. Phase 3E wires that proven browser decoder into the live RX Monitor frame stream without changing modem ownership or decoding audio on the Pi Zero.

## Safety boundary

The live candidate keeps the existing `read:dmr-voice` trusted bridge. MMDVM-Host remains the sole modem owner. The plugin still has no serial, MQTT, arbitrary network, filesystem, service, microphone/camera, USB, or RF-TX access. AMBE FEC recovery and mbelib speech synthesis run in the browser.

Core Alpha22.2 introduced the narrow Wasm permission for `read:dmr-voice`. Alpha22.3 fixed buffered subscriber drain pacing. Alpha22.5 moved whole-ring JSON serialization into a separate nice'd writer process. Alpha22.5 transport behavior is now physically proven and is unchanged by the Alpha22.6 WebUI polish build.

## Proven alpha5 engine

RX Monitor v0.4.0-alpha5 is the first live-audio build physically validated as stable on busy BrandMeister Worldwide traffic in AUTO mode, with clean AMBE/FEC captures and good live RF-side browser audio. The immutable proof checkpoint is:

```text
checkpoint-alpha22.5-rx3e-alpha5-live-audio-proven
```

Alpha6 deliberately leaves `live-audio.js` — the alpha5 decoder, AUTO call selection, maintained jitter reservoir, 100 ms chunk scheduler, playback-rate controller, FEC handoff, and browser audio behavior — unchanged.

## Alpha6 presentation polish

`BUILD-LIVE-CANDIDATE.sh` stages v0.4.0-alpha6 by combining:

1. the exact pinned Phase 3D mbelib browser bundle;
2. the unchanged proven alpha5 `live-audio.js` engine;
3. `live-audio-polish.js`, a presentation-only controller;
4. the normal RX Monitor UI with the established AMBE49 handoff and 100 ms active-audio polling hook.

The polish layer:

- replaces separate START and STOP controls with one animated `START AUDIO` / `STOP AUDIO` toggle;
- shows a spinner while browser audio is starting/stopping;
- removes experimental/developer-facing explanatory text from the normal monitor view;
- keeps Decoder, Buffer, and Underruns visible as the useful primary health indicators;
- moves technical playout counters under collapsed `ADVANCED AUDIO STATS`;
- moves capture/FEC and raw DMR frame diagnostics under collapsed `CAPTURE & FRAME DIAGNOSTICS`;
- keeps capture export available without dominating the normal listening interface.

No generated mbelib bundle, WAV, capture, private key, or staged package source is committed.

## Engine behavior retained from alpha5

- 250 ms polling while audio is stopped; 100 ms while audio is running.
- Five 20 ms AMBE frames per normal 100 ms PCM Web Audio chunk.
- Maintained scheduled-audio reservoir around the selected jitter target.
- Playback correction capped to 0.980x–1.020x.
- Bridge-timestamp-based AUTO call selection.
- Immediate same-timeslot caller handoffs; 450 ms quiet guard before crossing to simultaneous traffic on the other timeslot.
- Non-destructive normal call transitions with partial old-call PCM flushed rather than discarded.
- Hard reservoir re-anchor only at a real route/gap boundary when depth exceeds the selected target by more than 400 ms.

## Build on ubuntu-mini

```bash
cd ~/ywd-plugin-dev/ywd-hotspot-plugins
git checkout main
git pull --ff-only origin main
chmod +x tools/phase3e/BUILD-LIVE-CANDIDATE.sh
node --check tools/phase3e/live-audio.js
node --check tools/phase3e/live-audio-polish.js
bash -n tools/phase3e/BUILD-LIVE-CANDIDATE.sh
bash tools/phase3e/BUILD-LIVE-CANDIDATE.sh
```

Expected signed package:

```text
dist/dmr-rx-monitor-0.4.0-alpha6.ywdplugin
```

## Alpha6 validation

1. Update core to Alpha22.6 for the WebUI/plugin-upload polish. RF/audio transport should remain Alpha22.5 behavior.
2. Replace RX Monitor alpha5 with alpha6.
3. Confirm the monitor shows one START AUDIO button and no separate STOP button.
4. Confirm START AUDIO animates while the decoder/AudioContext starts, then changes to STOP AUDIO.
5. Confirm STOP AUDIO returns the same button to START AUDIO.
6. Test NETWORK / AUTO at the previously proven 140–170 ms range on a busy talkgroup.
7. Test RF audio again without changing the audio engine settings.
8. Open Advanced Audio Stats and Capture & Frame Diagnostics only as needed to confirm counters/export still work.

The next step after UI polish is the separate distribution/licensing review required before promoting the local signed mbelib/Wasm candidate into the canonical public plugin source.
