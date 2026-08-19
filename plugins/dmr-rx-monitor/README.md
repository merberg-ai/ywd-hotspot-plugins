# DMR RX Monitor

Experimental Phase 3B browser-UI plugin for YWD-Hotspot.

The physically proven v0.1.0 monitor established the trusted `read:dmr-voice`
path on real Pi Zero + duplex MMDVM HAT hardware. v0.2.0 then proved
browser-side de-interleaving of the three coded AMBE+2 channel blocks per DMR
burst. v0.3.0 keeps those proven layers unchanged and adds browser-side FEC,
C1 de-scrambling, 49-bit vocoder-frame recovery, continuity diagnostics, and a
short bounded capture export. It is still **not an audio player**.

Security boundary:

- no direct serial/MMDVM device access
- no direct MQTT access
- no generic network access from the sandboxed iframe
- no RF ownership or transmit authority
- frame reads remain capability-gated by trusted core
- raw frame reads currently require an unlocked WebUI control session
- capture history exists only in the browser page and is bounded
- the core iframe grants download permission only to `read:dmr-voice` UI
  plugins so a user-requested JSON capture can be saved locally

Phase 3B diagnostics:

- the same DMR A/B/C interleave maps validated in Phase 3A recover the three
  AMBE channel codewords from each 33-byte DMR voice burst;
- the C0 and C1 Golay(23,12) words are corrected in-browser;
- corrected C0 data seeds the AMBE pseudo-random de-scrambler for C1;
- corrected C0/C1 data plus the 25 unprotected C2/C3 bits produce one 49-bit
  AMBE+2 vocoder frame, three per DMR burst;
- the UI tracks recovered frames, FEC-corrected frames/bits, unrecoverable
  frames, DMR sequence gaps, and observed frame rate;
- **EXPORT CAPTURE** writes a versioned JSON file containing a short bounded
  ring of recovered 49-bit frames plus timestamp/path/slot/source/destination
  metadata. The final hex nibble is zero-padded on the right because 49 bits
  do not end on a nibble boundary.

FEC implementation notes:

- Golay parity generators and AMBE 3600x2450 de-scrambling behavior are based
  on the ISC-licensed mbelib implementation.
- Phase 3B performs only channel/FEC recovery and framing. It does not include
  AMBE speech synthesis or a vocoder decoder.

Expected test:

1. Install and enable the signed v0.3.0 package on the matching Alpha22 core.
2. Unlock WebUI controls and open **RX MONITOR**.
3. Make a sustained Parrot call and let the return audio play.
4. RF and NET frame monitoring should remain unchanged.
5. `49-BIT FRAMES` should rise at roughly 50 frames/sec during continuous
   speech.
6. `UNRECOVERABLE` and `SEQ GAPS` should ideally stay at zero on a clean link.
   `FEC FRAMES` / `CORRECTED BITS` may rise on RF traffic and are diagnostic,
   not automatically a failure.
7. Click **EXPORT CAPTURE** and confirm a
   `ywd-dmr-rx-capture-*.json` file is saved without leaving/reloading the
   plugin page.
8. Normal hotspot DMR operation must remain unaffected.

Actual AMBE-to-PCM playback remains a later phase after this recovered-frame
boundary is physically validated.
