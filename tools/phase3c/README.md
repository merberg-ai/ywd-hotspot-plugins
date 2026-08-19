# RX Monitor Phase 3C — Offline Audio Validation

This directory is the first Phase 3C step for `dmr-rx-monitor`.

It intentionally decodes **off-hotspot first**. The live Pi/MMDVM voice tap,
trusted ring bridge, duplex RF configuration, and signed plugin package remain
unchanged while we prove that the 49-bit AMBE+2 frames recovered by v0.3.0 can
be turned into intelligible PCM audio.

## Why this step exists

Phase 3B physically proved:

- 33-byte DMR voice bursts reach the trusted browser bridge;
- each burst yields three coded AMBE+2 blocks;
- FEC/de-scrambling recovers the 49-bit AMBE 2450 vocoder-data frames;
- the bounded capture exporter works;
- the tested Parrot capture had no unrecoverable frames or sequence gaps.

Phase 3C first proves this boundary:

```text
YWD capture JSON
  -> recovered AMBE+2 2450 data (49 bits / 20 ms)
  -> mbelib data decoder
  -> 160 signed PCM samples / frame
  -> mono 16-bit WAV @ 8 kHz
```

The capture's wall-clock `t` field is **not** used to schedule audio. Three AMBE
frames share each DMR burst timestamp and browser polling can batch bursts. The
vocoder frame order itself is the clock: one 49-bit frame = 20 ms = 160 samples
at 8 kHz.

## One-command test

From the plugin repository:

```bash
chmod +x tools/phase3c/*.sh
./tools/phase3c/PHASE3C-DECODE.sh /path/to/ywd-dmr-rx-capture-....json
```

On the first run the helper clones and builds a pinned upstream mbelib revision
inside:

```text
~/.cache/ywd-hotspot-plugins/phase3c/
```

Nothing is installed system-wide and nothing is copied to the hotspot.

The default test decodes RF and NETWORK streams independently so a Parrot
capture produces two files, for example:

```text
ywd-dmr-rx-capture-....-rf.wav
ywd-dmr-rx-capture-....-network.wav
```

For a successful Parrot test, both files should contain recognizable versions
of the same spoken audio (the bounded RF ring may begin part-way through the
original transmission).

## Dependency pin

The harness currently uses upstream `szechyjs/mbelib` at:

```text
9a04ed5c78176a9965f3d43f7aa1b1f5330e771f
```

It calls `mbe_processAmbe2450Data()` directly because Phase 3B has already
performed the DMR channel-code/FEC/de-scrambling step and exported mbelib-order
49-bit `ambe_d` data.

The mbelib source is **not vendored** into this repository. The setup helper
clones the exact pinned source into the user's cache.

## Patent/licensing note

This is an experimental development harness, not a redistribution decision for
the eventual browser plugin. Upstream mbelib carries an ISC-style source
license **and** a patent notice advising users to check applicable patent or
licensing restrictions before compiling or using derived executable code.

Before YWD-Hotspot distributes a compiled AMBE decoder inside a signed plugin,
that redistribution/licensing question must be reviewed separately. Proving the
technical audio path here does not silently make that policy decision.

## Privacy

A capture may contain DMR IDs and recovered digital voice payloads. Do not
commit personal captures to this public repository. Keep test captures outside
the repo or in ignored/private storage.

## Next gate

If the RF and NETWORK WAVs sound correct, the next Phase 3C step is to port the
same decoder boundary into the sandboxed RX Monitor browser UI with an explicit
`START AUDIO` control, a small jitter buffer, mute/volume controls, and
underrun/error instrumentation. The Pi remains a frame forwarder only.
