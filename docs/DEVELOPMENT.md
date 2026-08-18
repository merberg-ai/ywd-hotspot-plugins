# Plugin development workflow

This repository contains plugin source. The YWD-Hotspot core repository remains authoritative for API validation, packaging, signing, lifecycle, Plugin UI isolation, and sandbox behavior.

## Recommended checkout

Keep both repositories beside each other on a development machine:

```text
~/src/ywd-hotspot/
~/src/ywd-hotspot-plugins/
```

For experimental Plugin UI work, the core checkout should be on `dev-plugins`.

## Interactive developer tool

The normal workflow is:

```bash
cd ~/src/ywd-hotspot-plugins
./PLUGIN-DEV.sh
```

The tool discovers plugins under `plugins/`, validates them with the matching validator from the sibling YWD-Hotspot core checkout, calls the canonical `tools/ywdplugin-build.py`, and can inspect/verify the resulting package.

Useful command-mode examples:

```bash
./PLUGIN-DEV.sh list
./PLUGIN-DEV.sh validate ui-smoke-test
./PLUGIN-DEV.sh sign ui-smoke-test
./PLUGIN-DEV.sh inspect dist/ui-smoke-test-0.1.0.ywdplugin
./PLUGIN-DEV.sh verify dist/ui-smoke-test-0.1.0.ywdplugin
```

The script keeps local developer settings under:

```text
~/.config/ywd-hotspot-plugins/build.json
```

and generated signing keys under a sibling `keys/<key-id>/` directory there by default. It refuses to create signing keys inside either Git repository.

## Direct builder use

An unsigned declarative package may still be built directly:

```bash
python3 ../ywd-hotspot/tools/ywdplugin-build.py \
  plugins/<plugin-id> \
  dist/<plugin-id>-<version>.ywdplugin \
  --publisher "KJ6YWD"
```

Service and UI plugins require a trusted Ed25519 signature:

```bash
python3 ../ywd-hotspot/tools/ywdplugin-build.py \
  plugins/<plugin-id> \
  dist/<plugin-id>-<version>.ywdplugin \
  --publisher "KJ6YWD" \
  --sign-key /secure/path/private.pem \
  --key-id kj6ywd-official-1
```

Never place the signing private key inside either Git repository or on the hotspot.

## Plugin UI v1

A `kind: "ui"` package contains signed browser-side JavaScript/CSS but no Pi-side daemon. It must declare `provider: "browser-ui"`, `ui:section`, `rf_mode: false`, and a validated `ui` object naming its flat `ui.js`/`ui.css` assets.

Trusted core creates the document shell and loads those assets inside a sandboxed iframe. The plugin does not get the trusted dashboard DOM, dashboard authentication state, arbitrary API access, direct device access, or a general network bridge.

Phase-1 generic bridge calls are limited to:

```text
plugin.ping
plugin.getState
plugin.getConfig
```

Use `plugins/ui-smoke-test` to validate this framework before adding richer plugin capabilities.

## Test sequence

For service plugins, continue exercising the full runtime lifecycle:

```text
UPLOAD -> VERIFIED/AVAILABLE -> INSTALL -> ENABLE/ACTIVE
       -> configuration save/restart -> DISABLE -> UNINSTALL
       -> REMOVE DATA -> REMOVE PACKAGE
```

For a UI-only package:

```text
UPLOAD -> VERIFIED/AVAILABLE -> INSTALL -> ENABLE/ACTIVE
       -> declared dashboard section appears
       -> open section -> sandbox bridge works
       -> leave section -> frame is destroyed
       -> DISABLE -> dashboard section disappears
       -> UNINSTALL -> config/data preserved
```

Also verify master Plugin Support OFF disables the plugin and leaves normal DMR operation intact.

## Capability discipline

Ask only for capabilities the plugin actually needs. Current plugin APIs are intentionally narrow; do not work around them with direct RF ownership, arbitrary sudo, custom systemd units, broad sockets, writes outside the plugin data directory, or direct dashboard-DOM injection.

If a useful plugin needs a capability the current core API cannot safely provide, change the trusted core API first rather than bypassing it in plugin code.
