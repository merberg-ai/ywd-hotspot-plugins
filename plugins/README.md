# Plugins

Real YWD-Hotspot plugin projects live here, one directory per plugin ID.

## Current plugins

```text
plugins/dmr-rx-monitor/
plugins/dmr-contact-intelligence/
```

### DMR RX Monitor

DMR RX Monitor is the first production-oriented plugin project in this repository. Its directory is the stable diagnostic/capture source boundary. The selected streamed-audio Alpha19 distributable is assembled with the retained audio layer under `tools/rx-monitor/`:

```bash
./BUILD-RX-MONITOR.sh
```

See [`dmr-rx-monitor/README.md`](dmr-rx-monitor/README.md).

### DMR Contact Intelligence

DMR Contact Intelligence is an experimental browser UI plugin that exercises the generic read-only DMR activity and local directory capabilities introduced on the matching core `dev-plugins` branch. Alpha 1 provides a **CONTACTS** page, DMR ID/callsign lookup, and recent-activity callsign enrichment without RF authority or a Pi-side plugin service.

See [`dmr-contact-intelligence/README.md`](dmr-contact-intelligence/README.md).

## General rules

- keep plugin source scoped to its plugin ID;
- use only declared capabilities/dependencies;
- no direct modem ownership or RF TX authority;
- service/UI packages require trusted Ed25519 signing;
- private publisher keys never belong in the repository;
- use the canonical package builder from the matching YWD-Hotspot core checkout.
