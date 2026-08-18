# Plugin development workflow

This repository contains plugin source. The YWD-Hotspot core repository remains authoritative for API validation, packaging, signing, lifecycle and sandbox behavior.

## Recommended checkout

Keep both repositories beside each other on a development machine:

```text
~/src/ywd-hotspot/
~/src/ywd-hotspot-plugins/
```

Build an unsigned declarative package with the canonical core tool:

```bash
python3 ../ywd-hotspot/tools/ywdplugin-build.py \
  plugins/<plugin-id> \
  dist/<plugin-id>-<version>.ywdplugin \
  --publisher "KJ6YWD"
```

Service plugins require a trusted Ed25519 signature:

```bash
python3 ../ywd-hotspot/tools/ywdplugin-build.py \
  plugins/<plugin-id> \
  dist/<plugin-id>-<version>.ywdplugin \
  --publisher "KJ6YWD" \
  --sign-key /secure/path/ywd-plugin-private.pem \
  --key-id kj6ywd-official-1
```

Never place the signing private key inside either Git repository.

## Test sequence

For every service plugin, exercise the full lifecycle on a test hotspot:

```text
UPLOAD -> VERIFIED/AVAILABLE -> INSTALL -> ENABLE/ACTIVE
       -> configuration save/restart -> DISABLE -> UNINSTALL
       -> REMOVE DATA -> REMOVE PACKAGE
```

Also verify master Plugin Support OFF stops/disables the plugin and leaves normal DMR operation intact.

## Capability discipline

Ask only for capabilities the plugin actually needs. Current plugin APIs are intentionally narrow; do not work around them with direct RF ownership, arbitrary sudo, custom systemd units, broad sockets, or writes outside the plugin data directory.

If a useful plugin needs a capability the current core API cannot safely provide, change the trusted core API first rather than bypassing it in plugin code.
