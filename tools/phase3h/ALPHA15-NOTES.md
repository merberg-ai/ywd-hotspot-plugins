# Alpha15 candidate notes

Alpha15 intentionally keeps Alpha14's browser audio behavior unchanged:

- 10-frame / 200 ms external-vocoder decode batches
- 200 ms active DMR polling
- 240 ms default jitter target
- 300 ms scheduled-audio safety ceiling
- Alpha13 reset suppression, keepalive, and RTT diagnostics

The Phase 3H variable under test is the trusted core transport: a persistent
YWD Vocoder Protocol v1 AF_UNIX session replaces one socket connect/close cycle
per live decode request. This isolates transport effects from browser playout
changes.
