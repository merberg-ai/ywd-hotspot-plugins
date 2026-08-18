# Uploaded Plugin Smoke Test

This is the harmless service plugin used for the first successful real-hardware `.ywdplugin` upload lifecycle test on YWD-Hotspot.

It only writes heartbeat messages to its journal. It requests no RF mode, hardware ownership, external networking, device access, Linux capabilities, or privileged commands.

Validated lifecycle:

```text
UPLOAD -> VERIFIED / AVAILABLE
       -> INSTALL
       -> ENABLE / ACTIVE
       -> SAVE + RESTART
       -> DISABLE
       -> UNINSTALL
       -> REMOVE DATA
       -> REMOVE PACKAGE
```

Because it is executable service code, a distributable `.ywdplugin` built from this source must be signed with a trusted Ed25519 publisher key. Do not commit the private signing key.

Use the canonical package builder from the YWD-Hotspot core repository.
