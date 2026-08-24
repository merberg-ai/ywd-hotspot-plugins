# Plugin Development Workflow

[← Docs index](README.md) · [Repository README](../README.md)

This repository contains plugin source and development helpers. The sibling YWD-Hotspot core repository remains authoritative for manifest validation, `.ywdplugin` packaging, signature verification, lifecycle/update behavior, Plugin UI isolation, service sandboxing, capability interpretation, and RF ownership.

For the current DMR RX Monitor build, use **[Build DMR RX Monitor](BUILD-RX-MONITOR.md)** rather than the generic steps below.

## Recommended checkout

Keep both repositories beside one another on a development workstation:

```text
~/src/ywd-hotspot/
~/src/ywd-hotspot-plugins/
```

For plugin work targeting the current development framework, use matching `dev-plugins` branches:

```bash
cd ~/src/ywd-hotspot
git checkout dev-plugins
git pull --ff-only origin dev-plugins

cd ~/src/ywd-hotspot-plugins
git checkout dev-plugins
git pull --ff-only origin dev-plugins
```

## Prerequisites

Minimum Linux development tools:

```bash
sudo apt install -y git python3 openssl
```

Some specialized build tools may have additional requirements. Node.js is optional for the current RX Monitor builder and enables an extra JavaScript syntax check when available.

## `PLUGIN-DEV.sh`

The repository helper provides interactive and command-line workflows for normal plugin source under `plugins/`:

```bash
cd ~/src/ywd-hotspot-plugins
./PLUGIN-DEV.sh
```

Useful command mode:

```bash
./PLUGIN-DEV.sh list
./PLUGIN-DEV.sh validate <plugin-id>
./PLUGIN-DEV.sh sign <plugin-id>
./PLUGIN-DEV.sh inspect dist/<package>.ywdplugin
./PLUGIN-DEV.sh verify dist/<package>.ywdplugin
./PLUGIN-DEV.sh keys
./PLUGIN-DEV.sh trust-command
./PLUGIN-DEV.sh clean
```

The helper discovers plugin manifests, validates them with the matching core module for their kind, delegates packaging to the sibling core's canonical builder, and can inspect/verify output packages.

Canonical builder:

```text
ywd-hotspot/tools/ywdplugin-build.py
```

## Local developer configuration

`PLUGIN-DEV.sh` stores configuration under:

```text
~/.config/ywd-hotspot-plugins/build.json
```

Typical fields include:

```text
core_path
publisher
key_id
private_key
public_key
selected_plugin
```

Generated signing keys normally live under:

```text
~/.config/ywd-hotspot-plugins/keys/<key-id>/
```

The helper refuses to create signing keys inside either Git repository.

## Signing model

Executable service/UI plugins require an Ed25519 signature from a key trusted by the target hotspot.

Generate a local publisher key:

```bash
./PLUGIN-DEV.sh keys
```

Rules:

- the private key stays on the development workstation;
- never commit the private key;
- never copy the private key to the hotspot;
- install only the matching public key under `/etc/ywd-hotspot/plugin-trust.d/<key-id>.pem`;
- keep the key ID stable for packages intended to update one another under the same publisher identity.

`./PLUGIN-DEV.sh trust-command` prints the configured public-key path and target hotspot command.

## Generic package build

For a normal plugin whose canonical `plugins/<id>/` directory is directly distributable:

```bash
./PLUGIN-DEV.sh validate <plugin-id>
./PLUGIN-DEV.sh sign <plugin-id>
```

Or call core's builder directly:

```bash
python3 ../ywd-hotspot/tools/ywdplugin-build.py \
  plugins/<plugin-id> \
  dist/<plugin-id>-<version>.ywdplugin \
  --publisher "YOUR-CALLSIGN" \
  --sign-key /secure/path/private.pem \
  --key-id your-key-id
```

Declarative plugins that contain no executable service/browser code may be eligible for unsigned packaging, subject to core validation. UI and service plugins require signatures.

## RX Monitor is currently a special assembly

Do **not** use generic `./PLUGIN-DEV.sh sign dmr-rx-monitor` when you mean to build the current streamed-audio package.

`plugins/dmr-rx-monitor/` is intentionally retained as the stable diagnostic/capture source boundary. The selected `0.4.0-alpha19` live package is assembled reproducibly with its physically tested Phase 3J streamed-audio overlays.

Use:

```bash
./BUILD-RX-MONITOR.sh
```

See **[Build DMR RX Monitor](BUILD-RX-MONITOR.md)**.

## Plugin kinds

### Declarative

Trusted core interprets metadata/configuration; no plugin Python or browser JavaScript executes as an independent plugin runtime.

### Sandboxed service

Signed Python runs only through the shared hardened `ywd-plugin@.service` runner. A plugin package does not supply its own systemd unit.

### Browser UI

Signed JS/CSS runs inside an isolated dashboard iframe. Trusted core creates the shell and exposes only explicitly declared bridge capabilities.

Browser plugins do not receive the dashboard DOM, authentication state, arbitrary network/device access, generic sudo, or independent RF ownership.

## Capability discipline

Request only capabilities the plugin actually needs. Current APIs are intentionally narrow.

Do not bypass missing API functionality with:

- direct `/dev/serial0` access;
- a second MMDVM-Host instance;
- arbitrary sudo;
- custom systemd units supplied by the plugin;
- broad sockets/network access;
- writes outside approved plugin storage;
- direct injection into the trusted dashboard DOM.

If a useful plugin requires a capability the framework cannot safely express, extend trusted core first.

## Lifecycle testing

New package:

```text
UPLOAD -> VERIFIED/AVAILABLE -> INSTALL -> ENABLE/ACTIVE
```

Then verify configuration/save/restart behavior, disable, uninstall, data retention/removal, and package removal as appropriate.

Same-ID updates should also exercise transactional replacement/rollback paths.

For UI plugins verify:

```text
ENABLE
  -> dashboard section appears
open section
  -> sandbox bridge works
leave section
  -> iframe/runtime is destroyed as designed
DISABLE
  -> dashboard section disappears
```

Master Plugin Support OFF must remain authoritative and must leave normal hotspot/RF operation intact.

## Package inspection

After building:

```bash
./PLUGIN-DEV.sh inspect dist/<package>.ywdplugin
./PLUGIN-DEV.sh verify dist/<package>.ywdplugin
```

Inspection reports plugin identity/version, kind, publisher, signature/key ID, archive limits, and SHA-256. Signature verification uses the locally configured public key.

## Build artifacts

Generated `.ywdplugin` files belong under `dist/` and are ignored by Git. Temporary stage/generated directories used by build tools should also remain ignored and must not become canonical source accidentally.
