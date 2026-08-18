# YWD-Hotspot Plugins

Open-source plugin development for **YWD-Hotspot**.

This repository is the companion plugin workspace for `merberg-ai/ywd-hotspot`. The core YWD-Hotspot repository remains authoritative for the plugin API, `.ywdplugin` package format, signature verification, lifecycle manager, sandbox, updater integration, and RF ownership rules.

## Current compatibility target

Plugin development currently targets the `dev-plugins` line of YWD-Hotspot.

Core documentation:

- `docs/PLUGINS.md` in `merberg-ai/ywd-hotspot`
- `docs/PLUGIN-PACKAGES.md` in `merberg-ai/ywd-hotspot`
- `tools/ywdplugin-build.py` in `merberg-ai/ywd-hotspot`

## Repository layout

```text
plugins/       real plugin source
examples/      harmless/reference examples
docs/          plugin-development notes
dist/          local build output; not committed
```

Each plugin should keep its own source directory and should be buildable into a flat `.ywdplugin` package using the canonical YWD-Hotspot package builder.

## Safety contract

Current supported plugins must follow the core rules:

- `rf_mode = false`
- no direct `/dev/serial0` ownership
- no competing MMDVM-Host instance
- no arbitrary sudo
- no plugin-supplied systemd unit
- no broad network sockets
- executable service packages require a trusted Ed25519 signature
- private signing keys are never committed
- install does not imply enable/start
- master OFF must restore a normal YWD-Hotspot appliance

## Development flow

```text
plugin source
  -> validate manifest/schema
  -> build .ywdplugin
  -> sign service package
  -> upload to unlocked YWD-Hotspot Plugin Manager
  -> AVAILABLE
  -> INSTALL
  -> ENABLE / test
  -> DISABLE
  -> UNINSTALL
  -> REMOVE DATA / REMOVE PACKAGE as needed
```

The uploaded signed-service lifecycle has been physically validated on the Pi using the harmless `upload-smoke-test` package.

## Signing keys

Keep publisher private keys outside this repository. A typical local filename such as `ywd-plugin-private.pem` is ignored by policy and should never be pushed.

Public publisher keys may be documented/distributed separately when there is an intentional trust relationship.

## First real plugin

The repository is intentionally starting small. The next step is to define the first useful plugin's purpose and required capabilities before writing code, so the manifest asks for the narrowest possible access.
