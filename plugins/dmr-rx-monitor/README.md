# DMR RX Monitor

Experimental Phase 2B browser-UI plugin for YWD-Hotspot.

This first version is a **frame-path test**, not an audio player. It exercises the
trusted `read:dmr-voice` capability and displays sanitized passive DMR voice
frames supplied by the core hotspot bridge.

Security boundary:

- no direct serial/MMDVM device access
- no direct MQTT access
- no generic network access from the sandboxed iframe
- no RF ownership or transmit authority
- frame reads are capability-gated by trusted core
- raw frame reads currently require an unlocked WebUI control session

Expected test:

1. Install and enable the signed package.
2. Unlock WebUI controls.
3. Open **RX MONITOR**.
4. Make a Parrot call.
5. RF frames should appear while transmitting and network frames should appear
   when BrandMeister returns the Parrot audio.
6. Normal hotspot DMR operation must remain unaffected.

Browser audio/AMBE decode is intentionally deferred until this passive frame
transport is physically validated.
