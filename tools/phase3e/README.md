# RX Monitor Phase 3E — live browser audio candidate

Phase 3C proved offline mbelib decode to 8 kHz mono PCM WAV. Phase 3D proved the same pinned mbelib decoder can run in a browser. Phase 3E wires that browser decoder into the live RX Monitor frame stream while preserving the YWD plugin security boundary: MMDVM-Host remains the sole modem owner and the plugin receives only the capability-gated DMR voice-frame stream.

## Proven audio baseline

RX Monitor `0.4.0-alpha5` is the first live-audio build physically validated as stable on busy BrandMeister Worldwide traffic in AUTO mode, with clean AMBE/FEC captures and good RF-side browser audio. The immutable proof branch is:

```text
checkpoint-alpha22.5-rx3e-alpha5-live-audio-proven
```

The later polished baseline, including the alpha6.1 DOM-contract fix, is:

```text
checkpoint-alpha22.6.1-rx3e-alpha6.1-polish-proven
```

`live-audio.js` remains the proven alpha5 engine. Alpha7 does not change its decoder, AUTO call selection, maintained jitter reservoir, 100 ms chunk scheduler, playback-rate controller, FEC handoff, or browser-audio behavior.

## Alpha7 — final operator polish

`BUILD-LIVE-CANDIDATE.sh` stages `0.4.0-alpha7` by combining:

1. the exact pinned Phase 3D mbelib browser bundle;
2. unchanged proven `live-audio.js`;
3. the presentation-only `live-audio-polish.js`;
4. the normal RX Monitor UI with the established AMBE49 handoff and adaptive polling hook.

Alpha7 keeps runtime-owned DOM nodes alive but hides development counters and explanatory text from the normal operator view. The normal page emphasizes:

- last heard route/caller;
- source, timeslot/AUTO, jitter target, volume and mute;
- one animated START AUDIO / STOP AUDIO toggle;
- decoder state, live buffer depth, underruns and active audio route.

Technical playout counters remain under `ADVANCED AUDIO STATS`. Capture/FEC and raw-frame diagnostics remain under `CAPTURE & FRAME DIAGNOSTICS`.

Alpha7 also adds 150 ms and 170 ms choices around the physically useful 140–170 ms operating range. The underlying engine still accepts the same 120–240 ms target range and is otherwise unchanged.

## Engine behavior retained from alpha5

- 250 ms frame polling while audio is stopped; 100 ms while running.
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
dist/dmr-rx-monitor-0.4.0-alpha7.ywdplugin
```

## First transactional update proof

Alpha7 is intentionally paired with YWD-Hotspot Alpha22.7 and its new transactional plugin installer.

1. Update the hotspot core to Alpha22.7 first.
2. Leave the physically proven RX Monitor `0.4.0-alpha6.1` installed and enabled. Do **not** disable, uninstall, or remove its package.
3. Upload `dmr-rx-monitor-0.4.0-alpha7.ywdplugin` from Plugins.
4. The package review should classify it as `PLUGIN UPDATE` and show `0.4.0-alpha6.1 → 0.4.0-alpha7`.
5. Confirm the same trusted signing key/capabilities, preserved configuration/data, and preserved installed/enabled state.
6. Press `UPDATE PLUGIN`.
7. Confirm RX Monitor remains installed + enabled at alpha7 and the RX tab still loads normally.
8. Test NETWORK / AUTO around 160 ms, then the 140/150/170 ms choices. A short RF audio check is also recommended.

If the transaction fails, Alpha22.7 is designed to restore the previous uploaded package, plugin state, configuration, and service runtime where applicable.

## Distribution note

The generated mbelib browser decoder remains a local signed candidate artifact. Do not promote or publish the compiled decoder blindly: upstream mbelib carries patent/licensing cautions. Public/canonical plugin promotion remains a separate decision after the update path and alpha7 polish are physically proven.
