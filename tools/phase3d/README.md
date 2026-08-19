# RX Monitor Phase 3D — Browser Decode Proof

Phase 3C proved that the RX Monitor's recovered 49-bit AMBE+2 2450 frames decode to intelligible 8 kHz PCM using the pinned mbelib revision off-hotspot.

Phase 3D moves that same decode into a normal browser **without touching the live hotspot plugin yet**. It is deliberately an offline browser harness first so WebAssembly/Web Audio behavior can be proven before the signed RX Monitor package or core Plugin UI sandbox is changed.

## What this proves

```text
Phase 3B capture JSON
      ↓
49-bit AMBE frames
      ↓
pinned mbelib compiled by Emscripten
      ↓
8 kHz / 16-bit-equivalent PCM in browser memory
      ↓
Web Audio
      ↓
speaker
```

The capture timestamps are not used as an audio clock. One recovered AMBE frame is always 20 ms / 160 samples at 8 kHz.

## Build

Requirements:

- git
- python3
- an Emscripten toolchain with `emcc` on PATH

Then:

```bash
cd ~/ywd-plugin-dev/ywd-hotspot-plugins
git checkout main
git pull --ff-only origin main

chmod +x tools/phase3d/*.sh
bash tools/phase3d/BUILD-BROWSER-DECODER.sh
```

The helper clones/reuses the same pinned mbelib source used by Phase 3C:

```text
9a04ed5c78176a9965f3d43f7aa1b1f5330e771f
```

Generated Emscripten output goes under:

```text
tools/phase3d/generated/
```

That directory is intentionally gitignored. The generated decoder is a local development artifact and is not placed in a `.ywdplugin` package or copied to the Pi by this phase.

## Serve

```bash
bash tools/phase3d/SERVE.sh
```

Default port:

```text
8787
```

Open the displayed LAN URL in Chrome/Edge/Opera/Firefox, select the same `ywd-dmr-rx-capture-*.json` used for the Phase 3C proof, leave the path on **NETWORK**, press **DECODE IN BROWSER**, then **START AUDIO**.

Web Audio requires the audio start to happen from a user gesture, so playback is intentionally behind a button.

## Pass criterion

PASS:

- browser reports the expected network-frame count and duration,
- decoder completes without a crash,
- NETWORK playback contains recognizable/intelligible speech comparable to the Phase 3C WAV,
- mild robotic/compressed character or background artifacts are acceptable for this proof.

FAIL:

- silence,
- random/synthetic garbage,
- decoder initialization failure,
- grossly wrong duration,
- browser crash.

## After Phase 3D passes

Only then move the same decoder/audio engine into RX Monitor v0.4.x and add the live jitter-buffer path:

```text
live recovered AMBE frames
      ↓
stream/source/slot continuity guard
      ↓
browser decoder
      ↓
~120–160 ms PCM jitter buffer
      ↓
Web Audio
```

Expected live controls:

- START AUDIO
- MUTE
- VOLUME
- BUFFER
- UNDERRUNS
- AUDIO STATE

Do not weaken normal RF ownership or move speech decoding onto the Pi Zero.

## mbelib notice

This development harness compiles the pinned mbelib source locally. Its copyright/permission notice is copied beside the generated bundle. Keep the existing project caution around AMBE/mbelib licensing/patent implications before distributing a compiled decoder in an official plugin package.
