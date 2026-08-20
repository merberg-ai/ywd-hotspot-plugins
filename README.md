# YWD-Hotspot Plugins

Open-source companion workspace for **YWD-Hotspot** plugin development.

Core repository:

```text
merberg-ai/ywd-hotspot
```

YWD-Hotspot core remains authoritative for the plugin API, `.ywdplugin` format, signature verification, lifecycle/update transactions, service sandbox, Plugin UI isolation, updater integration, and RF ownership rules.

## Current compatibility target

Plugin development tracks the plugin-capable YWD-Hotspot integration runtime. Core `dev` is the physically accepted baseline; `dev-plugins` may move ahead with next-development integration work.

The plugin repository itself keeps plugin source/examples separate from trusted core implementation.

## Layout

```text
plugins/       user-facing/candidate plugin source
examples/      harmless framework validation packages
docs/          plugin-development notes
tools/         RX decoder/audio development tooling
dist/          local build output; ignored
PLUGIN-DEV.sh  build/sign/inspect helper
```

## Developer helper

With `ywd-hotspot` and `ywd-hotspot-plugins` checked out beside one another:

```bash
./PLUGIN-DEV.sh
```

Command mode:

```bash
./PLUGIN-DEV.sh list
./PLUGIN-DEV.sh validate <plugin-id>
./PLUGIN-DEV.sh sign <plugin-id>
./PLUGIN-DEV.sh verify dist/<package>.ywdplugin
```

`PLUGIN-DEV.sh` is orchestration only. The canonical package builder is still:

```text
ywd-hotspot/tools/ywdplugin-build.py
```

## Plugin kinds

```text
declarative  trusted core interprets metadata/config; no plugin executable code
service      signed Python entrypoint in shared hardened Pi sandbox
ui           signed JS/CSS inside isolated dashboard iframe; no Pi daemon
```

Current plugins never independently own RF serial, start a competing MMDVM instance, receive arbitrary sudo, or gain RF TX authority.

## Package install/update behavior

Core now supports both new installs and transactional same-ID package updates.

New package:

```text
UPLOAD → VERIFY/REVIEW → INSTALL → ENABLE
```

Existing uploaded plugin:

```text
UPLOAD → VERIFY/REVIEW → UPDATE / REINSTALL / DOWNGRADE / REPLACE
```

A confirmed update preserves config/data and prior valid installed/enabled state, with rollback if package replacement fails. The old manual disable/uninstall/remove/re-upload sequence is no longer required for a normal update.

## RX Monitor status

The DMR RX Monitor development path has physically proven:

- capability-gated passive DMR frame access;
- browser DMR deinterleave/FEC/49-bit AMBE+2 recovery;
- bounded capture diagnostics;
- offline AMBE→PCM proof;
- browser decoder proof;
- live network audio including busy AUTO operation;
- live RF-side browser audio.

The **public canonical source directory is intentionally not yet promoted to the live-audio package**. `plugins/dmr-rx-monitor` remains the pre-audio v0.3 source boundary, while `tools/phase3e/BUILD-LIVE-CANDIDATE.sh` stages the locally signed `0.4.0-alpha7` development candidate by combining that proven base with the local browser decoder/live-audio layers.

That split is deliberate until the project makes the separate mbelib/Wasm source/binary distribution decision. Do not commit generated decoder output merely to make the repository look more finished.

## RX development tooling

```text
tools/phase3c   offline capture → WAV proof
tools/phase3d   local browser decoder build/playback proof
tools/phase3e   live-audio candidate assembly/polish
```

These directories are development history/tooling, not three separate user-facing plugins. Once RX Monitor has a canonical distributable source form, the historical proof tooling can be archived/consolidated.

Generated decoder output and candidate staging remain ignored.

## Signing keys

Publisher private keys stay outside both repositories, normally under developer-owned configuration such as:

```text
~/.config/ywd-hotspot-plugins/
```

Only a publisher's **public** key belongs on a hotspot under:

```text
/etc/ywd-hotspot/plugin-trust.d/<key-id>.pem
```

Never commit a signing private key.

## Reference packages

`examples/ui-smoke-test` and `examples/upload-smoke-test` are retained as framework validation fixtures, not end-user features. Keeping them under `examples/` prevents proof packages from looking like promoted plugins while preserving reproducible lifecycle/sandbox tests.

## Safety contract

- `rf_mode = false` for current supported plugins;
- no direct `/dev/serial0` ownership;
- no competing MMDVM-Host;
- no arbitrary sudo;
- no plugin-supplied systemd unit;
- service plugins use the shared restricted sandbox;
- UI plugins run in isolated iframes;
- executable service/UI packages require trusted Ed25519 signatures;
- install does not imply enable;
- master OFF remains authoritative;
- private signing keys are never committed or stored on the hotspot.
