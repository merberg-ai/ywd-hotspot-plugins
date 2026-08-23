# DMR RX Monitor Phase 3F Alpha9

Alpha9 fixes the Phase 3F diagnostic cold-start race discovered during physical Pi Zero testing.

The 5-frame diagnostic now performs a control-plane STATUS warm-up first, verifies a backend is available, and only then issues the fixed five-frame DECODE request under the unchanged 300 ms live decode timeout.

This preserves the runtime contract:

- opening RX Monitor does not probe or start a vocoder backend;
- STATUS/RESET may use the longer control-plane cold-start allowance;
- DECODE remains bounded by the normal live-audio timeout;
- the candidate contains no mbelib or Wasm decoder.
