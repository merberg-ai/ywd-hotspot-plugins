# DMR Contact Intelligence

Signed YWD-Hotspot browser UI plugin for local DMR identity lookup, live/recent activity enrichment, and hotspot-observed station history.

## Release 0.1.0

DMR Contact Intelligence 0.1.0 is the finished first release built from the hardware-proven Alpha 6 baseline.

Features:

- dedicated **CONTACTS** dashboard section;
- callsign or numeric DMR-ID search against the hotspot's indexed local RadioID-derived directory;
- richer local identity fields when available: name, city, state/region, and country;
- local observation history for completed DMR calls: first seen, last heard, QSO count, cumulative airtime, RF/network counts, and last destination/path;
- compact responsive First Seen formatting so timestamps remain readable on narrow mobile screens;
- callsigns in **On the air now** and **Recent activity** act as station-profile drill-down controls, using the numeric DMR ID for an exact indexed lookup when available;
- collapsible **Observed / Recent Activity** card with recent-row/update summary in the header;
- browser-local persistence of the Observed card state through the generic parent-side plugin preference bridge;
- visible lookup progress with clear success, no-match, unavailable, and retry states;
- resilient activity refresh behavior: a transient refresh failure preserves the last successful snapshot and marks it **STALE** instead of destroying useful information;
- local-directory freshness/status indication, including stale and unavailable states;
- batch DMR-ID-to-callsign resolution for current and recent activity rows;
- TGIF-aware destination presentation for the YWD-Hotspot `5xxxxxx` RF namespace while retaining the raw RF talkgroup for diagnostics;
- keyboard/focus polish, reduced-motion support, and dark-theme browser-autofill handling;
- bounded, sanitized read-only DMR activity from trusted core;
- optional auto-refresh only while the plugin iframe is open;
- no RF authority, modem access, arbitrary dashboard fetch, arbitrary network access, or Pi-side plugin service.

## Package trust and signing

YWD-Hotspot `.ywdplugin` archive v1 requires all **uploaded** plugins to declare the `experimental` trust class. That field describes the plugin's runtime/package trust boundary; it is not the publisher identity or release maturity indicator.

DMR Contact Intelligence 0.1.0 therefore intentionally keeps:

```text
trust: experimental
```

Publisher authenticity is enforced separately by the package's trusted Ed25519 signature. Official builds are signed with the configured KJ6YWD publisher key and the hotspot verifies that signature before an uploaded UI package can be reviewed or installed.

## Proven lineage

Alpha 6 was physically validated on the main YWD-Hotspot DMR station before the final 0.1.0 polish pass. The hardware-proven Alpha 6 source baseline is:

```text
325ec8efb48a5cfdc009e24a3bc65575439d1513
```

The verified Alpha 6 package used for that test had SHA256:

```text
7827d50b45c53a83631b4fdbabaf2ee1c6bac93b1753111f71d1c763857b2747
```

See `docs/history/dmr-contact-intelligence-alpha6-hardware-pass.md` for the acceptance record.

## Data model

YWD-Hotspot keeps directory data and observed hotspot data separate at rest.

The existing RadioID updater continues to write `/var/lib/ywd-hotspot/DMRIds.dat` for MMDVM compatibility. From the same scheduled CSV download it also writes `/var/lib/ywd-hotspot/DMRContacts.tsv` plus indexed `/var/lib/ywd-hotspot/DMRContacts.sqlite3`. Contact Intelligence prefers the indexed database for exact/prefix lookup while retaining the text files as compatibility/fallback data. No second directory download or live RadioID API dependency is introduced.

Completed DMR calls are recorded by the existing activity collector in `/var/lib/ywd-hotspot/contact-observations.sqlite3`. The observation store is deliberately small and contains only station identity tokens plus local first/last-seen and aggregate QSO/path metadata. Observation writes are best-effort and never block or control RF operation.

## Core capabilities

```text
ui:section
read:dmr-activity
read:dmr-directory
```

The final 0.1.0 release keeps the Alpha 5/Alpha 6 capability contract unchanged. Directory responses contain richer fields and a separate `observations` enrichment object; existing clients that only read DMR ID/callsign continue to work.

The parent Plugin UI runtime also provides generic browser-local `getPreference` / `setPreference` operations. Preference keys are namespaced by plugin ID and values are size-bounded JSON stored by the trusted parent page, so opaque-origin plugin iframes do not need direct browser-storage privileges.

## Build

Use the repository's generic signed UI-plugin flow:

```bash
./PLUGIN-DEV.sh validate dmr-contact-intelligence
./PLUGIN-DEV.sh sign dmr-contact-intelligence
```

Then upload the resulting `.ywdplugin` through YWD-Hotspot Plugin Manager and apply it as the same-ID plugin update.

For the final source smoke check:

```bash
python3 tools/contact-intelligence-smoke.py
```

## Safety boundary

The browser code runs in the existing opaque-origin Plugin UI iframe. Directory/activity data cross the trusted MessageChannel only after core verifies the package is installed, enabled, and declares the matching capability. Browser preferences are restricted to the plugin's own namespace. Disabling or uninstalling the plugin revokes trusted data reads immediately.
