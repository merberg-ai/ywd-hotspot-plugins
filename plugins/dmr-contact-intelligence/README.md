# DMR Contact Intelligence

Experimental YWD-Hotspot browser UI plugin for local DMR identity lookup, recent activity, and hotspot-observed station history.

## Alpha 6 scope

- dedicated **CONTACTS** dashboard section;
- callsign or numeric DMR-ID search against the hotspot's indexed local RadioID-derived directory;
- richer local identity fields when available: name, city, state/region, and country;
- local observation history for completed DMR calls: first seen, last heard, QSO count, cumulative airtime, RF/network counts, and last destination/path;
- compact responsive First Seen formatting so timestamps remain readable on narrow mobile screens;
- callsigns in **On the air now** and **Recent activity** act as station-profile drill-down controls, using the numeric DMR ID for an exact indexed lookup when available;
- collapsible **Observed / Recent Activity** card with recent-row/update summary in the header;
- browser-local persistence of the Observed card state through the generic parent-side plugin preference bridge;
- visible lookup progress with clear success, no-match, and error states;
- batch DMR-ID-to-callsign resolution for current and recent activity rows;
- bounded, sanitized read-only DMR activity from trusted core;
- optional auto-refresh only while the plugin iframe is open;
- no RF authority, modem access, arbitrary dashboard fetch, arbitrary network access, or Pi-side plugin service.

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

Alpha 6 keeps the Alpha 5 capability contract unchanged. Directory responses contain richer fields and a separate `observations` enrichment object; existing clients that only read DMR ID/callsign continue to work.

The parent Plugin UI runtime also provides generic browser-local `getPreference` / `setPreference` operations. Preference keys are namespaced by plugin ID and values are size-bounded JSON stored by the trusted parent page, so opaque-origin plugin iframes do not need direct browser-storage privileges.

## Build

Use the repository's generic signed UI-plugin flow:

```bash
./PLUGIN-DEV.sh validate dmr-contact-intelligence
./PLUGIN-DEV.sh sign dmr-contact-intelligence
```

Then upload the resulting `.ywdplugin` through YWD-Hotspot Plugin Manager and apply it as the same-ID plugin update.

## Safety boundary

The browser code runs in the existing opaque-origin Plugin UI iframe. Directory/activity data cross the trusted MessageChannel only after core verifies the package is installed, enabled, and declares the matching capability. Browser preferences are restricted to the plugin's own namespace. Disabling or uninstalling the plugin revokes trusted data reads immediately.
