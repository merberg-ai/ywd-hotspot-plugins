# YWD-Hotspot Plugin Documentation

[← Repository README](../README.md)

## I want to…

| Goal | Guide |
|---|---|
| Build the current DMR RX Monitor package | **[Build RX Monitor](BUILD-RX-MONITOR.md)** |
| Develop/sign/inspect plugins in general | **[Plugin Development](DEVELOPMENT.md)** |
| Understand RX Monitor itself | **[RX Monitor README](../plugins/dmr-rx-monitor/README.md)** |
| Understand the active RX assembly internals | **[RX Monitor build internals](../tools/rx-monitor/README.md)** |
| Review old RX development phases | **[RX Monitor Development History](history/RX-MONITOR-DEVELOPMENT.md)** |
| Browse historical notes | **[Historical Documentation](history/README.md)** |
| Set up the external vocoder backend | **[Core Vocoder Guide](https://github.com/merberg-ai/ywd-hotspot/blob/dev/docs/VOCODER.md)** |
| Understand the core plugin framework | **[Core Plugin Guide](https://github.com/merberg-ai/ywd-hotspot/blob/dev/docs/PLUGINS.md)** |

## Current development target

Use matching `dev` checkouts of:

```text
merberg-ai/ywd-hotspot
merberg-ai/ywd-hotspot-plugins
```

Current selected RX Monitor package:

```text
dmr-rx-monitor 0.4.0-alpha19
```

Normal build entry point:

```bash
./BUILD-RX-MONITOR.sh
```

The active repository intentionally contains only one RX Monitor tool directory: `tools/rx-monitor/`. Older Phase 3C–3J proof directories were removed from the active tree after the Alpha19 streamed path was proven and integrated; their commits/checkpoints remain available for audit and recovery.
