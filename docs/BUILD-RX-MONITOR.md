# Build DMR RX Monitor

[← Docs index](README.md) · [Repository README](../README.md) · [DMR RX Monitor](../plugins/dmr-rx-monitor/README.md)

This guide builds the currently selected streamed-audio RX Monitor package from source:

```text
dmr-rx-monitor 0.4.0-alpha19
```

It targets the YWD-Hotspot `dev-plugins` branch and requires a trusted Ed25519 publisher signature because RX Monitor is a browser UI plugin.

## What gets built

The final package contains RX Monitor diagnostics, capture/export, streamed PCM client logic, and Web Audio playout. It does **not** contain mbelib, an AMBE software decoder, or an AMBE Wasm module.

Live speech is supplied by a separately installed YWD Vocoder Protocol v1 backend. See:

**[External YWD Vocoder Backend](https://github.com/merberg-ai/ywd-hotspot/blob/dev-plugins/docs/VOCODER.md)**

## 1. Install development prerequisites

Debian/Ubuntu example:

```bash
sudo apt update
sudo apt install -y git python3 openssl
```

Node.js is optional. If `node` is present, the RX builder performs an additional JavaScript syntax check.

## 2. Clone matching core + plugin repositories

Keep the repositories beside one another:

```bash
mkdir -p ~/src
cd ~/src

git clone --branch dev-plugins https://github.com/merberg-ai/ywd-hotspot.git
git clone --branch dev-plugins https://github.com/merberg-ai/ywd-hotspot-plugins.git
```

Expected layout:

```text
~/src/ywd-hotspot/
~/src/ywd-hotspot-plugins/
```

The plugin build intentionally uses the validators and canonical `.ywdplugin` builder from the sibling core checkout.

## 3. Configure your publisher/signing key

Enter the plugin repository:

```bash
cd ~/src/ywd-hotspot-plugins
```

Run the signing-key setup once:

```bash
./PLUGIN-DEV.sh keys
```

When prompted:

- choose a unique key ID, for example `n0call-personal-1`;
- use your callsign/name as the publisher string;
- keep the generated private key on the development machine.

Local configuration is stored under:

```text
~/.config/ywd-hotspot-plugins/build.json
```

Keys normally live under:

```text
~/.config/ywd-hotspot-plugins/keys/<key-id>/
```

The helper refuses to create signing keys inside either Git repository.

> [!CAUTION]
> Never commit the private key and never copy it to the hotspot. Only the public key is installed as a trusted publisher key.

## 4. Build RX Monitor

Use the top-level wrapper:

```bash
./BUILD-RX-MONITOR.sh
```

The wrapper performs preflight checks and delegates to the retained Phase 3J builder.

Expected output:

```text
dist/dmr-rx-monitor-0.4.0-alpha19.ywdplugin
```

The build validates all of the following before producing the package:

- matching YWD-Hotspot core checkout exists;
- RX Monitor manifest satisfies current core validation;
- required capabilities/dependencies are present;
- assembled `ui.js` stays below Plugin UI v1 size limits;
- selected Alpha19 400 ms/700 ms playout settings are present;
- reset-tolerant playout patch is present;
- legacy browser POST/decode audio path is absent;
- no mbelib/Wasm decoder material is inside the package;
- package is signed with the configured Ed25519 publisher key.

If a public key is configured locally, the builder also verifies the resulting signature and inspects the package archive.

## 5. Verify/inspect manually

You can rerun the package checks at any time:

```bash
./PLUGIN-DEV.sh verify dist/dmr-rx-monitor-0.4.0-alpha19.ywdplugin
./PLUGIN-DEV.sh inspect dist/dmr-rx-monitor-0.4.0-alpha19.ywdplugin
```

Inspection shows plugin identity, kind, publisher, signature/key ID, archive size, entry count, and SHA-256.

## 6. Trust your publisher key on the hotspot

Ask the helper for the current key information:

```bash
./PLUGIN-DEV.sh trust-command
```

Copy only the generated `public.pem` file to the hotspot using your normal SSH/SFTP workflow, then install it as:

```text
/etc/ywd-hotspot/plugin-trust.d/<key-id>.pem
```

Typical hotspot-side form:

```bash
sudo install -d -o root -g root -m 0750 /etc/ywd-hotspot/plugin-trust.d
sudo install -o root -g root -m 0644 public.pem \
  /etc/ywd-hotspot/plugin-trust.d/<key-id>.pem
```

The filename/key ID must match the key ID used when the package was signed.

## 7. Upload/install the package

In the YWD-Hotspot dashboard:

```text
PLUGINS
  -> upload .ywdplugin
  -> review verification/details
  -> install
  -> enable
  -> open RX MONITOR
```

Install and enable are separate actions by design.

If replacing an existing package with the same plugin ID, current core supports transactional package update/reinstall/downgrade flows while preserving valid plugin config/data and prior intent.

## 8. Configure live speech decoding

RX Monitor diagnostics can exist without bundling a decoder, but **live speech requires the external backend**.

Follow the current core guide:

**[docs/VOCODER.md](https://github.com/merberg-ai/ywd-hotspot/blob/dev-plugins/docs/VOCODER.md)**

Current tested backend policy on constrained Pi hardware is:

```text
YWD Vocoder Protocol v1
/run/ywd-vocoder.sock
Nice=0
CPUWeight=200
```

The external backend remains separate from this plugin repository/package.

## 9. Expected current audio baseline

The selected Phase 3J/Alpha19 build uses:

```text
trusted core batch        10 AMBE frames / 200 ms
core decode timeout       400 ms
core live burst tail      12 DMR bursts (~720 ms)
browser target reservoir  400 ms
browser emergency ceiling 700 ms
playback correction       gentle +/-1%
```

Normal decoder-state resets preserve already-buffered PCM. Explicit stream drop/error events still rebuffer.

## Rebuilding after a pull

For normal source updates:

```bash
cd ~/src/ywd-hotspot
git checkout dev-plugins
git pull --ff-only origin dev-plugins

cd ~/src/ywd-hotspot-plugins
git checkout dev-plugins
git pull --ff-only origin dev-plugins

./BUILD-RX-MONITOR.sh
```

Your signing configuration/key remains outside the repositories and is reused.

## Common failures

### `Matching YWD-Hotspot core checkout not found`

Keep `ywd-hotspot` beside `ywd-hotspot-plugins`, or run `./PLUGIN-DEV.sh` once and point it at your core checkout.

### `no signing key is configured`

Run:

```bash
./PLUGIN-DEV.sh keys
```

### package is rejected as untrusted

Install the matching **public** key on the hotspot under `/etc/ywd-hotspot/plugin-trust.d/<key-id>.pem`. Do not move the private key to the hotspot.

### RX Monitor installs but live audio has no decoder

Install/verify the separately distributed YWD Vocoder Protocol v1 backend. The plugin deliberately contains no speech decoder.

### Stock Upstream MMDVM runtime

RX Monitor requires the YWD Extended passive-voice capability. A hotspot using the Stock Upstream MMDVM runtime will not satisfy the required capability token.

## Maintainer note

The current distributable streamed-audio package is assembled from the stable diagnostic source under `plugins/dmr-rx-monitor/` plus retained Phase 3J overlays under `tools/phase3j/`. This preserves the physically tested Alpha19 source boundary without rewriting it during cleanup.

End users should use `./BUILD-RX-MONITOR.sh`; `tools/phase3j/` is primarily maintainer/implementation detail.
