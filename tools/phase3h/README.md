# Phase 3H — Persistent live vocoder transport

Phase 3H starts from the physically observed Alpha14 sustained-RX candidate.

Alpha14 established that 10-frame / 200 ms external-vocoder batches can reach
real-time throughput on the Raspberry Pi Zero, but intermittent transport stalls
(up to roughly 700+ ms in physical testing) still cause underruns on long calls.

Phase 3H keeps the public plugin no-decoder boundary unchanged and targets the
remaining fixed transport overhead:

- preserve 10-frame / 200 ms live batches;
- preserve 200 ms active DMR polling;
- preserve bounded browser playout and RF-first drop policy;
- use the trusted core's persistent YWD Vocoder Protocol v1 session rather than
  reconnecting the AF_UNIX socket for every decode request;
- keep the backend demand/idle lifecycle: no RX audio use means no persistent
  decoder work and the external backend may exit after idle;
- continue shipping no mbelib, libmbe, Wasm, or AMBE software vocoder in the
  RX Monitor package.

The first Phase 3H candidate is Alpha15.
