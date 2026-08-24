# Phase 3H Alpha15 observation

> Historical note. This describes a superseded test path and is retained only for development provenance. Current RX Monitor build/setup instructions live in `docs/BUILD-RX-MONITOR.md` and `tools/phase3j/README.md`.

Physical observation with RX Monitor `0.4.0-alpha15` and YWD-Hotspot core `8908b103d2732842916edf20f98f6e721e6d17a2`:

- Persistent vocoder session is working: 2 connects, 83 requests, 81 reused requests in the captured run.
- Fake backend precomputed-tone generation is negligible (~0.071 ms last / ~1.749 ms max).
- Live browser audio reached LIVE with 240 ms playout buffer.
- Decode RTT captured around 60 ms current / 302 ms max.
- Underrun counter reached 47, so intermittent source/delivery stalls remained even after backend and Unix-socket costs were reduced.

At that time Alpha15 was the browser-side persistent-transport test baseline. The next work moved to the voice-ring/dashboard delivery path and eventually to the Phase 3J direct live IPC streamed-PCM design.
