# DMR RX Monitor

Experimental Phase 3A browser-UI plugin for YWD-Hotspot.

The physically proven v0.1.0 frame monitor established the trusted
`read:dmr-voice` path on real Pi Zero + duplex MMDVM HAT hardware. v0.2.0 keeps
that bridge unchanged and adds browser-side AMBE+2 channel/FEC extraction and
cadence diagnostics. It is still **not an audio player**.

Security boundary:

- no direct serial/MMDVM device access
- no direct MQTT access
- no generic network access from the sandboxed iframe
- no RF ownership or transmit authority
- frame reads are capability-gated by trusted core
- raw frame reads currently require an unlocked WebUI control session

Phase 3A diagnostics:

- each 33-byte DMR voice burst is de-interleaved using the same A/B/C bit maps
  used by the pinned MMDVM-Host `AMBEFEC.cpp` implementation;
- every valid burst should produce exactly three 72-bit coded AMBE+2
  channel/FEC blocks;
- continuous voice should approach one DMR voice burst every 60 ms, yielding
  about 50 coded AMBE blocks per second;
- optional plugin configuration can show the three most recent coded block
  values as hex for validation;
- no Golay/FEC-to-49-bit vocoder decode and no AMBE-to-PCM audio happens yet.

Expected test:

1. Install and enable the signed v0.2.0 package.
2. Unlock WebUI controls.
3. Open **RX MONITOR**.
4. Make a sustained Parrot transmission and let the return audio play.
5. RF frames should appear while transmitting and network frames should appear
   on the Parrot return.
6. `LAST BURST` should show `3 × 72-bit` with zero extraction errors.
7. After enough continuous frames the cadence indicator should settle near
   60 ms / roughly 50 coded blocks per second.
8. Normal hotspot DMR operation must remain unaffected.

Actual browser audio remains the next phase after this extraction/cadence path
is physically validated.
