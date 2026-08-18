# YWD-Hotspot Plugins

Open-source plugin development for **YWD-Hotspot**.

This repository is the companion plugin workspace for `merberg-ai/ywd-hotspot`. The core YWD-Hotspot repository remains authoritative for the plugin API, `.ywdplugin` package format, signature verification, lifecycle manager, sandbox, updater integration, Plugin UI bridge, and RF ownership rules.

## Current compatibility target

Plugin development currently targets the experimental `dev-plugins` line of YWD-Hotspot. The stable development fallback lives on core `dev`.

Core documentation:

- `docs/PLUGINS.md` in `merberg-ai/ywd-hotspot`
- `docs/PLUGIN-PACKAGES.md` in `merberg-ai/ywd-hotspot`
- `docs/PLUGIN-UI.md` in `merberg-ai/ywd-hotspot`
- `tools/ywdplugin-build.py` in `merberg-ai/ywd-hotspot`

## Repository layout

```text
plugins/       real plugin source and focused validation plugins
examples/      harmless/reference examples
docs/          plugin-development notes
dist/          local build output; not committed
PLUGIN-DEV.sh  interactive build/sign/inspect helper
```

Each plugin keeps its own source directory and builds into the canonical flat `.ywdplugin` package format.

## Interactive developer tool

With `ywd-hotspot` and `ywd-hotspot-plugins` checked out beside one another:

```bash
./PLUGIN-DEV.sh
```

The menu can select and validate plugin source, build/sign packages through the canonical core builder, create an Ed25519 publisher key outside both Git repositories, inspect package sizes/hashes, verify signatures, and print the hotspot public-key trust command.

Command mode is also available:

```bash
./PLUGIN-DEV.sh list
./PLUGIN-DEV.sh validate ui-smoke-test
./PLUGIN-DEV.sh sign ui-smoke-test
./PLUGIN-DEV.sh verify dist/ui-smoke-test-0.1.0.ywdplugin
```

`PLUGIN-DEV.sh` is orchestration only. The authoritative package builder remains `ywd-hotspot/tools/ywdplugin-build.py`.

## Plugin kinds

Current framework models are intentionally distinct:

```text
declarative  core interprets data/config; no plugin executable code
service      signed Python entrypoint in the shared hardened Pi sandbox
ui           signed browser-side JS/CSS in the sandboxed Plugin UI frame; no Pi daemon
```

The Phase-1 `plugins/ui-smoke-test` package validates Plugin UI v1 before DMR Monitor work begins.

## Safety contract

Current supported plugins must follow the core rules:

- `rf_mode = false`
- no direct `/dev/serial0` ownership
- no competing MMDVM-Host instance
- no arbitrary sudo
- no plugin-supplied systemd unit
- no broad network sockets
- executable service packages require a trusted Ed25519 signature
- browser UI packages require a trusted Ed25519 signature
- UI code runs in an isolated dashboard iframe rather than the trusted dashboard DOM
- private signing keys are never committed
- install does not imply enable/start
- master OFF must restore a normal YWD-Hotspot appliance

## Development flow

```text
plugin source
  -> validate manifest/schema
  -> build .ywdplugin
  -> sign executable service/UI package
  -> upload to unlocked YWD-Hotspot Plugin Manager
  -> AVAILABLE
  -> INSTALL
  -> ENABLE / test
  -> DISABLE
  -> UNINSTALL
  -> REMOVE DATA / REMOVE PACKAGE as needed
```

The uploaded signed-service lifecycle was physically validated on the Pi using the harmless `upload-smoke-test` package. Plugin UI v1 is the next experimental validation phase and should not be described as known-good until its hardware/browser lifecycle test passes.

## Signing keys

Keep publisher private keys outside this repository. `PLUGIN-DEV.sh` stores developer configuration and generated keys under `~/.config/ywd-hotspot-plugins/` by default and refuses to create signing keys inside either Git repository.

Only the **public** publisher key belongs on the hotspot under `/etc/ywd-hotspot/plugin-trust.d/<key-id>.pem`.

## Monitor direction

The planned first real rich plugin is an RX-only browser DMR Monitor. The first Monitor milestone comes after Plugin UI v1 is proven and will use an explicit passive core capability rather than direct RF, serial, packet-capture, or privileged access. Expensive audio decode work is intended for the browser so the original Raspberry Pi Zero W remains the performance budget.
