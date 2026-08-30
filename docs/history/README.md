# Historical Plugin Documentation

[← Docs index](../README.md)

Current build/development instructions live directly under `docs/`. This directory keeps historical observations and condensed development history so old proof work remains understandable without cluttering the active workflow.

## DMR Contact Intelligence

- **[Alpha 6 hardware pass](dmr-contact-intelligence-alpha6-hardware-pass.md)** — main-hotspot physical acceptance record for the final pre-release baseline, including the verified package SHA256 and unchanged core target.

The Alpha 6 source baseline retained for rollback/audit is:

```text
325ec8efb48a5cfdc009e24a3bc65575439d1513
checkpoint-dev-plugins-contact-intelligence-alpha6-proven
```

## RX Monitor

- **[RX Monitor Development History](RX-MONITOR-DEVELOPMENT.md)** — Phase 3C through the selected Phase 3J/Alpha19 architecture.
- **[Phase 3H Alpha15 observation](phase3h-alpha15-observation.md)** — retained physical observation from the persistent-vocoder transition.

The old `tools/phase3c` … `tools/phase3j` directories were removed from the active `dev` tree during repository cleanup. Their exact source remains recoverable from Git history.

A convenient pre-cleanup source snapshot is:

```text
b3c3e741f83e9f1204a9eb36027f84e71f0ce7e3
```

## Retained checkpoint refs

Checkpoint branches are kept only when they still provide durable rollback or architectural audit value. Intermediate `needs-testing`, failed, superseded and one-off observation labels are intentionally pruned once later evidence makes them redundant.

The retained plugin checkpoints include:

```text
checkpoint-dev-plugins-contact-intelligence-alpha6-proven
checkpoint-dev-plugins-pre-vocoder-boundary
checkpoint-dev-plugins-phase3f-alpha10-vocoder-boundary-proven
checkpoint-dev-plugins-phase3h-alpha15-pre-real-vocoder
checkpoint-dev-plugins-phase3i-alpha15-mbelib-protocol-sanity-proven
checkpoint-dev-plugins-phase3i-alpha15-real-speech-partial-proven
checkpoint-dev-plugins-phase3j-pre-stream-plugin
checkpoint-dev-plugins-phase3j-alpha19-proven
```

The final selected RX Monitor package checkpoint is:

```text
checkpoint-dev-plugins-phase3j-alpha19-proven
```

`dev` is the integrated development line. `dev-plugins` starts from the same clean baseline and may diverge again only for intentionally isolated plugin/framework experiments. `main` remains the public/release-associated line.
