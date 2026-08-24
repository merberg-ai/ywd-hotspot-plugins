# Build DMR RX Monitor

[← Docs index](README.md) · [Repository README](../README.md) · [RX Monitor](../plugins/dmr-rx-monitor/README.md)

This guide builds the current selected package:

```text
dmr-rx-monitor 0.4.0-alpha19
```

It targets matching YWD-Hotspot **`dev`** source and requires an Ed25519 publisher signature because RX Monitor is a browser UI plugin.

## 1. Install build prerequisites

Debian/Ubuntu:

```bash
sudo apt update
sudo apt install -y git python3 openssl
```

Node.js is optional. If `node` is installed, the builder performs an additional JavaScript syntax check.

## 2. Clone matching repositories

Keep core and plugin repositories beside one another:

```bash
mkdir -p ~/src
cd ~/src

git clone --branch dev https://github.com/merberg-ai/ywd-hotspot.git
git clone --branch dev https://github.com/merberg-ai/ywd-hotspot-plugins.git
```

Expected layout:

```text
~/src/ywd-hotspot/
~/src/ywd-hotspot-plugins/
```

The plugin builder deliberately uses the manifest validators and canonical `.ywdplugin` builder from the sibling core checkout.

## 3. Configure a publisher key

```bash
cd ~/src/ywd-hotspot-plugins
./PLUGIN-DEV.sh keys
```

Choose your own publisher string and a unique key ID. Local configuration is stored under:

```text
~/.config/ywd-hotspot-plugins/build.json
```

Keys normally live under:

```text
~/.config/ywd-hotspot-plugins/keys/<key-id>/
```

> [!CAUTION]
> Keep `private.pem` on the development machine. Never commit it and never copy it to the hotspot.

## 4. Build

```bash
./BUILD-RX-MONITOR.sh
```

Expected package:

```text
dist/dmr-rx-monitor-0.4.0-alpha19.ywdplugin
```

The build checks:

- matching core checkout exists;
- current manifest validates against core;
- required RX capabilities/dependencies are present;
- assembled UI stays inside Plugin UI v1 size limits;
- selected Alpha19 400/700 ms reservoir settings are present;
- reset-tolerant playout is present;
- legacy browser POST/decode audio path is absent;
- no mbelib/Wasm decoder material is bundled;
- package is signed by the configured Ed25519 key.

If the configured public key exists, the builder also verifies the signature and inspects the resulting archive.

## 5. Verify manually

```bash
./PLUGIN-DEV.sh verify dist/dmr-rx-monitor-0.4.0-alpha19.ywdplugin
./PLUGIN-DEV.sh inspect dist/dmr-rx-monitor-0.4.0-alpha19.ywdplugin
```

## 6. Trust your publisher on the hotspot

```bash
./PLUGIN-DEV.sh trust-command
```

Copy only `public.pem` to the hotspot and install it as:

```text
/etc/ywd-hotspot/plugin-trust.d/<key-id>.pem
```

Typical hotspot-side commands:

```bash
sudo install -d -o root -g root -m 0750 /etc/ywd-hotspot/plugin-trust.d
sudo install -o root -g root -m 0644 public.pem \
  /etc/ywd-hotspot/plugin-trust.d/<key-id>.pem
```

The filename/key ID must match the key ID used when the package was signed.

## 7. Upload/install/enable

In the dashboard:

```text
PLUGINS
  → upload .ywdplugin
  → review verification/details
  → install
  → enable
  → RX MONITOR
```

Install and enable are separate actions by design.

## 8. Install the external vocoder for live speech

The plugin contains no AMBE speech decoder. Live speech requires the separately installed **YWD Vocoder Protocol v1** backend.

Follow:

**[YWD-Hotspot External Vocoder Guide](https://github.com/merberg-ai/ywd-hotspot/blob/dev/docs/VOCODER.md)**

Current proven core policy:

```text
socket       /run/ywd-vocoder.sock
Nice         0
CPUWeight    200
batch        10 AMBE49 frames / 200 ms
timeout      400 ms
```

## Updating your source later

```bash
cd ~/src/ywd-hotspot
git checkout dev
git pull --ff-only origin dev

cd ~/src/ywd-hotspot-plugins
git checkout dev
git pull --ff-only origin dev

./BUILD-RX-MONITOR.sh
```

## Troubleshooting

### Matching core checkout not found

Keep both repositories beside one another or run `./PLUGIN-DEV.sh` once and configure the core checkout path.

### Signing key not configured

```bash
./PLUGIN-DEV.sh keys
```

### Hotspot says publisher is untrusted

Install the public key under `/etc/ywd-hotspot/plugin-trust.d/<key-id>.pem`. Do not copy the private key.

### Plugin installs but no speech is heard

Check the external backend first:

```bash
sudo -u ywd-hotspot python3 /opt/ywd-hotspot/app/lib/vocoder_client.py status
sudo -u ywd-hotspot python3 /opt/ywd-hotspot/app/lib/vocoder_client.py decode-test --frames 10
```

Also confirm the hotspot uses the YWD Extended MMDVM runtime and satisfies the plugin's demand-gated passive voice requirement.

### Why isn't the current builder under a Phase 3x directory anymore?

The old phase directories were development proofs. Once Alpha19 and the streamed core path were selected, the active assembly was moved to `tools/rx-monitor/` so users have one current path. Historical code is still in Git history/checkpoint refs.
