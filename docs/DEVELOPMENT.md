# Plugin Development

[← Docs index](README.md) · [Repository README](../README.md)

This repository contains plugin source and development helpers. YWD-Hotspot core remains authoritative for validation, package format, signing, lifecycle, browser/service sandboxing, capability checks and RF ownership.

## Branch model

```text
main         accepted public-release companion state
dev          active integrated development / RC preparation
dev-plugins  optional specialized experimental plugin branch
```

Use matching core/plugin branches. Current normal development is `dev`.

## Recommended checkout

```text
~/src/ywd-hotspot/
~/src/ywd-hotspot-plugins/
```

## Generic developer helper

```bash
cd ~/src/ywd-hotspot-plugins
./PLUGIN-DEV.sh
```

Command mode:

```bash
./PLUGIN-DEV.sh list
./PLUGIN-DEV.sh validate <plugin-id>
./PLUGIN-DEV.sh build <plugin-id>      # unsigned declarative only
./PLUGIN-DEV.sh sign <plugin-id>       # signed service/UI package
./PLUGIN-DEV.sh inspect <package>
./PLUGIN-DEV.sh verify <package>
./PLUGIN-DEV.sh keys
./PLUGIN-DEV.sh trust-command
./PLUGIN-DEV.sh clean
```

Configuration:

```text
~/.config/ywd-hotspot-plugins/build.json
```

Signing keys normally live under:

```text
~/.config/ywd-hotspot-plugins/keys/<key-id>/
```

The helper refuses to create private keys inside either Git repository.

## RX Monitor special build

The selected Alpha19 RX Monitor package preserves a stable diagnostic/capture source boundary under `plugins/dmr-rx-monitor/` and adds the proven streamed-audio layer during assembly.

Use:

```bash
./BUILD-RX-MONITOR.sh
```

Do **not** use generic `./PLUGIN-DEV.sh sign dmr-rx-monitor` when you intend to build the current streamed-audio Alpha19 package; that generic command signs only the base plugin source directory.

The active assembly internals are contained entirely under:

```text
tools/rx-monitor/
```

No active builder reaches backward into historical Phase 3x directories.

## Direct canonical builder

For directly distributable plugin source:

```bash
python3 ../ywd-hotspot/tools/ywdplugin-build.py \
  plugins/<plugin-id> \
  dist/<plugin-id>-<version>.ywdplugin \
  --publisher "YOUR-PUBLISHER" \
  --sign-key /secure/path/private.pem \
  --key-id your-key-id
```

Never place the private key inside either Git repository or on the hotspot.

## UI plugin boundary

A `kind: "ui"` plugin runs signed JavaScript/CSS inside a sandboxed iframe. Trusted core creates the document shell and exposes only declared bridge capabilities.

A UI plugin does not receive:

- trusted dashboard DOM access;
- dashboard credentials;
- arbitrary API/network access;
- direct modem serial access;
- generic AF_UNIX/socket access;
- RF transmit authority.

If a plugin needs a new privileged capability, add a narrow trusted-core API rather than bypassing the boundary.

## Package lifecycle test

For UI packages:

```text
UPLOAD → VERIFIED/AVAILABLE → INSTALL → ENABLE/ACTIVE
       → dashboard section appears
       → sandbox bridge works
       → DISABLE
       → section disappears
       → UNINSTALL
```

For package updates, exercise same-ID replacement/rollback and verify valid config/data/enable intent are preserved.

Always verify master Plugin Support OFF leaves normal hotspot operation intact.

## Examples

`examples/ui-smoke-test` and `examples/upload-smoke-test` are framework fixtures, not end-user features. See `examples/README.md`.

## Historical RX tooling

Earlier Phase 3C–3J tools were intentionally removed from the active tree after the streamed Alpha19 path was integrated. They remain available through Git history and checkpoint refs; see `docs/history/RX-MONITOR-DEVELOPMENT.md`.
