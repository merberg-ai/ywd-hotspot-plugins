# YWD-Hotspot Plugins

Companion repository for **YWD-Hotspot** plugins, examples, build helpers, and plugin-development tooling.

Core repository: [`merberg-ai/ywd-hotspot`](https://github.com/merberg-ai/ywd-hotspot)

YWD-Hotspot core remains authoritative for the plugin API, `.ywdplugin` package format, manifest validation, signature verification, lifecycle/update transactions, sandboxing, browser isolation, capability checks, and RF ownership rules.

## Branches

```text
main         plugin tree associated with the accepted public release line
dev          active integrated development / RC preparation
dev-plugins  specialized experimental plugin work when needed
```

Current development should use **`dev` in both the core and plugin repositories**. `dev-plugins` is no longer required to build the selected RX Monitor package.

## Quick start: build DMR RX Monitor

On a Debian/Ubuntu development machine:

```bash
sudo apt update
sudo apt install -y git python3 openssl

mkdir -p ~/src
cd ~/src

git clone --branch dev https://github.com/merberg-ai/ywd-hotspot.git
git clone --branch dev https://github.com/merberg-ai/ywd-hotspot-plugins.git

cd ywd-hotspot-plugins
./PLUGIN-DEV.sh keys
./BUILD-RX-MONITOR.sh
```

Output:

```text
dist/dmr-rx-monitor-0.4.0-alpha19.ywdplugin
```

`./PLUGIN-DEV.sh keys` is a one-time publisher/signing-key setup. The private Ed25519 key stays on the development machine and outside both Git repositories.

Full walkthrough: **[Build DMR RX Monitor](docs/BUILD-RX-MONITOR.md)**.

## Install on a hotspot

The hotspot must trust the public half of the signing key. Show the trust-key command with:

```bash
./PLUGIN-DEV.sh trust-command
```

Copy **only the public key** to the hotspot and install it under:

```text
/etc/ywd-hotspot/plugin-trust.d/<key-id>.pem
```

Then use the YWD-Hotspot dashboard:

```text
PLUGINS → upload → review → install → enable
```

Live RX speech additionally requires a separately installed **YWD Vocoder Protocol v1** backend. The plugin does not contain or download mbelib or another AMBE software decoder.

See the core guide: **[External YWD Vocoder Backend](https://github.com/merberg-ai/ywd-hotspot/blob/dev/docs/VOCODER.md)**.

## Current RX Monitor baseline

The selected streamed-audio package is:

```text
dmr-rx-monitor 0.4.0-alpha19
```

Architecture:

```text
MMDVM-Host
   ↓ passive accepted voice copy
trusted YWD-Hotspot core
   ↓ direct local live IPC
DMR recovery / FEC / 10-frame batching
   ↓
external YWD Vocoder Protocol v1 backend
   ↓ trusted PCM stream
sandboxed RX Monitor iframe
   ↓
Web Audio playout
```

Selected browser behavior:

- 400 ms target reservoir;
- 700 ms emergency scheduled-depth ceiling;
- gentle +/-1% playback correction;
- normal decoder-state resets preserve buffered PCM;
- explicit stream drop/error events rebuffer.

The plugin has no direct modem, serial, MQTT, AF_UNIX, generic network, or RF-TX authority.

## Repository layout

```text
plugins/             real plugin source boundaries
examples/            harmless framework validation fixtures
docs/                current user/developer docs + history index
tools/rx-monitor/    only active RX Monitor assembly tooling
dist/                local package output; ignored by Git
BUILD-RX-MONITOR.sh  normal RX Monitor build entry point
PLUGIN-DEV.sh        generic validate/sign/inspect/key helper
```

Historical Phase 3C–3J proof tooling is no longer carried in the active tree. It remains available through Git history and retained checkpoint refs. See **[RX Monitor development history](docs/history/RX-MONITOR-DEVELOPMENT.md)**.

## Generic plugin development

For directly distributable plugins under `plugins/<id>/`:

```bash
./PLUGIN-DEV.sh list
./PLUGIN-DEV.sh validate <plugin-id>
./PLUGIN-DEV.sh sign <plugin-id>
./PLUGIN-DEV.sh inspect dist/<package>.ywdplugin
./PLUGIN-DEV.sh verify dist/<package>.ywdplugin
```

The canonical package builder lives in the matching YWD-Hotspot core checkout:

```text
ywd-hotspot/tools/ywdplugin-build.py
```

RX Monitor currently uses `BUILD-RX-MONITOR.sh` because its proven streamed-audio package is assembled from the stable diagnostic source boundary plus the retained Alpha19 streamed-audio layer.

## Signing keys

Local developer configuration:

```text
~/.config/ywd-hotspot-plugins/build.json
```

Default key directory:

```text
~/.config/ywd-hotspot-plugins/keys/<key-id>/
```

Never commit a private publisher key and never copy it to the hotspot.

## Safety contract

- current plugins use `rf_mode = false`;
- no direct `/dev/serial0` ownership;
- no competing MMDVM-Host;
- no arbitrary sudo;
- no plugin-supplied systemd unit;
- service plugins use the shared restricted sandbox;
- UI plugins run in isolated iframes;
- executable service/UI packages require trusted Ed25519 signatures;
- install does not imply enable;
- master Plugin Support OFF remains authoritative.

## Documentation

Start with **[docs/README.md](docs/README.md)**.
