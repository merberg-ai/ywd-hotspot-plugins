# RX Monitor build internals

This directory contains the **only active RX Monitor assembly tooling** in the current development tree.

End users should normally build from the repository root:

```bash
./BUILD-RX-MONITOR.sh
```

That wrapper calls `tools/rx-monitor/BUILD.sh`.

## Current package

```text
dmr-rx-monitor 0.4.0-alpha19
```

Selected proven behavior:

- 400 ms browser target reservoir;
- 700 ms emergency scheduled-depth ceiling;
- gentle +/-1% playback correction with a 40 ms deadband;
- normal decoder-state resets preserve already-buffered PCM;
- explicit stream drop/error events rebuffer;
- trusted core batches 10 AMBE49 frames / 200 ms;
- external YWD Vocoder Protocol v1 backend only;
- no mbelib source/binary or AMBE Wasm decoder is bundled in the plugin.

## Files

- `BUILD.sh` — assembles, validates, signs, verifies and inspects the current package.
- `streamed-live-audio.js` — streamed PCM/Web Audio reservoir client.
- `stream-polish.js` — RX Monitor streamed-audio UI integration/polish.
- `alpha19-playout-patch.py` — retained exact Alpha19 reset/heartbeat patch.
- `live-audio.css` — exact stylesheet previously retained in the Phase 3E proof directory; copied here so the current builder has no dependency on historical tooling.
- `stage/` — generated local assembly area; ignored by Git.

## Why the old phase directories are gone

`tools/phase3c` through `tools/phase3h` were proof-of-concept and transition tooling. They remain recoverable through Git history and the retained checkpoint refs, but are intentionally absent from the active development tree so there is only one obvious RX Monitor build path.

The current assembly still preserves the physically selected Alpha19 behavior. This cleanup changes where the source components live, not the live-audio tuning or trust boundary.
