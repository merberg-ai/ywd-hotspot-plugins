# YWD-Hotspot Plugins

Companion repository for **YWD-Hotspot** plugins, examples, build helpers, and plugin-development tooling.

Core repository: [`merberg-ai/ywd-hotspot`](https://github.com/merberg-ai/ywd-hotspot)

YWD-Hotspot core remains authoritative for the plugin API, `.ywdplugin` package format, manifest validation, signature verification, lifecycle/update transactions, service sandboxing, browser isolation, capability checks, and RF ownership rules.

> [!IMPORTANT]
> The current DMR RX Monitor development package targets **YWD-Hotspot `dev-plugins`** and is still pre-release software. Keep the core and plugin repositories on matching `dev-plugins` checkouts when building it.

## Quick start: build DMR RX Monitor

On a Linux development machine, keep the two repositories beside one another:

```bash
sudo apt update
sudo apt install -y git python3 openssl

mkdir -p ~/src
cd ~/src

git clone --branch dev-plugins https://github.com/merberg-ai/ywd-hotspot.git
git clone --branch dev-plugins https://github.com/merberg-ai/ywd-hotspot-plugins.git

cd ywd-hotspot-plugins
```

Create a local Ed25519 publisher key once:

```bash
./PLUGIN-DEV.sh keys
```

Use your own publisher name/callsign and a unique key ID when prompted. The private key is stored under your user configuration directory, **outside both Git repositories**.

Then build the currently selected RX Monitor package:

```bash
./BUILD-RX-MONITOR.sh
```

Output:

```text
dist/dmr-rx-monitor-0.4.0-alpha19.ywdplugin
```

The wrapper uses the proven Phase 3J builder, validates the assembled UI against the matching core checkout, signs the package, verifies that no AMBE/mbelib/Wasm decoder is bundled, and prints useful verification/trust-key commands when complete.

Full walkthrough: **[Building DMR RX Monitor](docs/BUILD-RX-MONITOR.md)**.

## Installing the package on a hotspot

UI plugins must be signed by a key the hotspot trusts. After creating your publisher key:

```bash
./PLUGIN-DEV.sh trust-command
```

Copy **only the public key** to the hotspot and install it under:

```text
/etc/ywd-hotspot/plugin-trust.d/<key-id>.pem
```

Then upload the `.ywdplugin` file in **Plugins** in the YWD-Hotspot dashboard, review it, install it, and enable it.

Live RX speech additionally requires a separately installed **YWD Vocoder Protocol v1** backend. The plugin does not contain or download an AMBE software decoder. See the core guide:

**[External YWD Vocoder Backend](https://github.com/merberg-ai/ywd-hotspot/blob/dev-plugins/docs/VOCODER.md)**

## Current RX Monitor baseline

The selected and physically tested streamed-audio package is:

```text
dmr-rx-monitor 0.4.0-alpha19
```

The trust boundary is:

```text
MMDVM-Host
   ↓ passive accepted voice copy
trusted YWD-Hotspot core
   ↓ direct local live IPC
DMR recovery / FEC / 10-frame batching
   ↓
external YWD Vocoder Protocol v1 backend
   ↓ PCM over trusted stream
sandboxed RX Monitor iframe
   ↓
Web Audio playout
```

The plugin receives PCM only for live speech. It has no direct modem, serial, MQTT, AF_UNIX, generic network, or RF-TX authority and contains no mbelib source/binary or AMBE Wasm decoder.

More detail: **[DMR RX Monitor README](plugins/dmr-rx-monitor/README.md)**.

## Repository layout

```text
plugins/             plugin source boundaries
examples/            harmless framework validation fixtures
docs/                user/developer documentation
tools/phase3j/       retained RX Monitor streamed-audio assembly components
dist/                local package output; ignored by Git
BUILD-RX-MONITOR.sh  easiest current RX Monitor build command
PLUGIN-DEV.sh        generic validate/sign/inspect/key helper
```

Older `tools/phase3*` directories are implementation/proof history. Users building the current RX Monitor should use `BUILD-RX-MONITOR.sh`, not guess which historical phase script is current.

## Generic plugin development

For plugins whose canonical source under `plugins/<id>/` is directly distributable, `PLUGIN-DEV.sh` provides the normal workflow:

```bash
./PLUGIN-DEV.sh list
./PLUGIN-DEV.sh validate <plugin-id>
./PLUGIN-DEV.sh sign <plugin-id>
./PLUGIN-DEV.sh inspect dist/<package>.ywdplugin
./PLUGIN-DEV.sh verify dist/<package>.ywdplugin
```

`PLUGIN-DEV.sh` delegates actual packaging to the canonical builder in the sibling core repository:

```text
ywd-hotspot/tools/ywdplugin-build.py
```

RX Monitor is currently special: `plugins/dmr-rx-monitor/` is the stable diagnostic/capture source boundary, while the physically selected Phase 3J live-audio layer is assembled reproducibly during packaging. Use `./BUILD-RX-MONITOR.sh` for the current live package rather than generic `./PLUGIN-DEV.sh sign dmr-rx-monitor`.

See **[Plugin Development](docs/DEVELOPMENT.md)** for authoring details.

## Signing keys

Local builder configuration lives under:

```text
~/.config/ywd-hotspot-plugins/build.json
```

Generated keys normally live below:

```text
~/.config/ywd-hotspot-plugins/keys/<key-id>/
```

Rules:

- private publisher keys stay on the development workstation;
- never commit a private key;
- never copy the private key to the hotspot;
- only the matching public key belongs in the hotspot trust directory;
- losing a private key means you can no longer produce updates under that publisher identity.

## Plugin kinds

```text
declarative  trusted core interprets metadata/config; no plugin executable code
service      signed Python entrypoint in the shared hardened service sandbox
ui           signed JS/CSS in an isolated dashboard iframe; no Pi-side daemon
```

Current plugin APIs do not grant independent MMDVM ownership, arbitrary sudo, custom systemd units, or RF TX authority.

## Package lifecycle

New install:

```text
UPLOAD → VERIFY/REVIEW → INSTALL → ENABLE → ACTIVE
```

Same-ID update:

```text
UPLOAD → VERIFY/REVIEW → UPDATE / REINSTALL / DOWNGRADE / REPLACE
```

Core preserves valid config/data and prior intent across transactional package replacement and attempts rollback if replacement fails.

## Documentation

Start with **[docs/README.md](docs/README.md)**.

Useful guides:

- **[Build DMR RX Monitor](docs/BUILD-RX-MONITOR.md)**
- **[Plugin Development](docs/DEVELOPMENT.md)**
- **[DMR RX Monitor](plugins/dmr-rx-monitor/README.md)**
- **[Phase 3J maintainer notes](tools/phase3j/README.md)**
- **[Core plugin documentation](https://github.com/merberg-ai/ywd-hotspot/blob/dev-plugins/docs/PLUGINS.md)**

## Safety contract

- current supported plugins use `rf_mode = false`;
- no direct `/dev/serial0` ownership;
- no competing MMDVM-Host;
- no arbitrary sudo;
- no plugin-supplied systemd unit;
- service plugins use the shared restricted sandbox;
- UI plugins run in isolated iframes;
- executable service/UI packages require trusted Ed25519 signatures;
- install does not imply enable;
- master Plugin Support OFF remains authoritative;
- private signing keys are never committed or stored on the hotspot.
