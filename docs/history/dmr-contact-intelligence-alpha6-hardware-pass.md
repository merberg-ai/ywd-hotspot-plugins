# DMR Contact Intelligence Alpha 6 Hardware Pass

Date: 2026-08-30

## Proven plugin source

- Repository: `merberg-ai/ywd-hotspot-plugins`
- Branch: `dev-plugins`
- Source checkpoint before this documentation commit: `325ec8efb48a5cfdc009e24a3bc65575439d1513`
- Plugin: `dmr-contact-intelligence`
- Version: `0.1.0-alpha6`

## Proven package

- File: `dmr-contact-intelligence-0.1.0-alpha6.ywdplugin`
- Publisher/signing key: `KJ6YWD` / `kj6ywd-official-1`
- Signature: Ed25519, verified
- SHA256: `7827d50b45c53a83631b4fdbabaf2ee1c6bac93b1753111f71d1c763857b2747`

## Hardware/system validation

Alpha 6 was installed as an in-place update from Alpha 5 on the main YWD-Hotspot DMR station, not the Pi 5 TGIF test rig.

Main hotspot core during validation:

- YWD-Hotspot `0.2.0-rc3`
- branch/channel `dev-plugins`
- core commit `234fc3522d5c0aa3ab568ad30c01ad56586aed11`
- source state clean

The main station already contained the indexed RadioID directory, rich contact fields, persistent observation database, and plugin preference bridge required by Alpha 6.

Observed preflight data included:

- indexed directory present and healthy;
- 311,401 indexed contacts;
- 2,004 observed stations;
- exact callsign/DMR-ID lookup working through the indexed path;
- `total_duration_s` observation enrichment available;
- Alpha 5 active with the same three capabilities Alpha 6 requests.

## Acceptance result

PASS:

- same-ID Alpha 5 -> Alpha 6 package update;
- signature remained verified under `kj6ywd-official-1`;
- plugin remained installed, enabled, effective, and ACTIVE;
- existing plugin configuration survived;
- CONTACTS UI loaded correctly;
- callsign/DMR-ID search worked;
- rich RadioID identity fields rendered;
- local observation history rendered;
- First Seen / Last Heard rendered;
- QSO count rendered;
- cumulative AIRTIME rendered;
- RF/network path counts rendered;
- last destination/path/slot rendered;
- callsign drill-down behavior worked as expected;
- responsive/mobile polish behaved as expected;
- main hotspot core remained unchanged during the plugin-only test.

Example live lookup after update showed KJ6YWD / DMR ID 3196104 with accumulated observation history including 70 QSOs, roughly 4m40s airtime, 69 RF / 1 NET paths, and the last route.

## Safety boundary retained

Alpha 6 remained a sandboxed read-only browser UI plugin with:

```text
ui:section
read:dmr-activity
read:dmr-directory
```

No RF ownership, modem access, arbitrary fetch/network access, arbitrary filesystem/shell access, or Pi-side plugin service was added.

## Baseline status

Treat `325ec8efb48a5cfdc009e24a3bc65575439d1513` as the hardware-proven Alpha 6 source baseline. The next development step is the final ship-polish pass toward the final DMR Contact Intelligence `0.1.0` release.
