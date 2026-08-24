# YWD-Hotspot Plugins Documentation

[← Repository README](../README.md)

This repository contains user-facing plugin source plus development/build tooling that pairs with the YWD-Hotspot core repository.

## I want to…

| Task | Guide |
|---|---|
| Build the current DMR RX Monitor package | **[Build DMR RX Monitor](BUILD-RX-MONITOR.md)** |
| Develop/sign/inspect another plugin | **[Plugin Development](DEVELOPMENT.md)** |
| Understand the RX Monitor itself | **[DMR RX Monitor](../plugins/dmr-rx-monitor/README.md)** |
| Understand the retained Phase 3J assembly | **[Phase 3J maintainer notes](../tools/phase3j/README.md)** |
| Configure the external live-audio decoder | **[External YWD Vocoder Backend](https://github.com/merberg-ai/ywd-hotspot/blob/dev-plugins/docs/VOCODER.md)** |
| Understand the trusted core plugin framework | **[Core Plugins guide](https://github.com/merberg-ai/ywd-hotspot/blob/dev-plugins/docs/PLUGINS.md)** |
| Understand `.ywdplugin` packaging | **[Core Plugin Packages guide](https://github.com/merberg-ai/ywd-hotspot/blob/dev-plugins/docs/PLUGIN-PACKAGES.md)** |
| Understand browser-plugin isolation | **[Core Plugin UI guide](https://github.com/merberg-ai/ywd-hotspot/blob/dev-plugins/docs/PLUGIN-UI.md)** |
| Review old RX Monitor experiments | **[Historical notes](history/README.md)** |

## Current compatibility target

The current streamed DMR RX Monitor build is `0.4.0-alpha19` and targets the plugin-capable YWD-Hotspot `dev-plugins` branch.

For the least surprising build environment, keep these as sibling checkouts:

```text
~/src/ywd-hotspot/          # branch: dev-plugins
~/src/ywd-hotspot-plugins/  # branch: dev-plugins
```

The plugin repository does not duplicate the trusted package validators/builders from core. It intentionally imports those from the matching sibling checkout so the package is built against the API that will validate it on the hotspot.

## Current DMR RX Monitor distribution boundary

The live RX Monitor package does **not** ship a software AMBE decoder.

```text
plugin package
  -> diagnostics/UI/PCM playout only

YWD-Hotspot core
  -> DMR recovery/FEC/batching

external backend
  -> YWD Vocoder Protocol v1 AMBE49 -> PCM
```

The external backend must be installed separately for live speech. Diagnostic/capture features do not change the RF ownership model: MMDVM-Host remains the sole modem/RF owner.

## Historical material

Older phase notes are retained for development provenance, but they are not current installation instructions. Current users should begin with the build guide above rather than following old Alpha/Phase experiment notes.
