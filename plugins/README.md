# Plugins

Real YWD-Hotspot plugin projects live here, one directory per plugin ID.

## Current plugin

```text
plugins/dmr-rx-monitor/
```

DMR RX Monitor is the first production-oriented plugin project in this repository. Its directory is the stable diagnostic/capture source boundary. The selected streamed-audio Alpha19 distributable is assembled with the retained audio layer under `tools/rx-monitor/`:

```bash
./BUILD-RX-MONITOR.sh
```

See [`dmr-rx-monitor/README.md`](dmr-rx-monitor/README.md).

## General rules

- keep plugin source scoped to its plugin ID;
- use only declared capabilities/dependencies;
- no direct modem ownership or RF TX authority;
- service/UI packages require trusted Ed25519 signing;
- private publisher keys never belong in the repository;
- use the canonical package builder from the matching YWD-Hotspot core checkout.
