# DMR Contact Intelligence

Experimental YWD-Hotspot browser UI plugin for local DMR identity lookup and recent-activity enrichment.

## Alpha 1 scope

- dedicated **CONTACTS** dashboard section;
- callsign or numeric DMR-ID search against the hotspot's existing local RadioID-derived `DMRIds.dat` data;
- batch DMR-ID-to-callsign resolution for the current and recent activity rows;
- bounded, sanitized read-only DMR activity from trusted core;
- optional auto-refresh only while the plugin iframe is open;
- no RF authority, modem access, arbitrary dashboard fetch, arbitrary network access, or Pi-side plugin service.

The current RC3 DMR ID file stores DMR ID and callsign. Richer directory fields such as name/city/state/country and persistent first-seen/last-seen/QSO observations are intentionally deferred until their storage/update contract is designed and tested separately.

## Required core capabilities

```text
ui:section
read:dmr-activity
read:dmr-directory
```

These are generic trusted-core Plugin UI capabilities rather than Contact-Intelligence-specific hooks so future traffic/scanner plugins can reuse the same read-only contracts.

## Build

Use the repository's generic signed UI-plugin flow:

```bash
./PLUGIN-DEV.sh validate dmr-contact-intelligence
./PLUGIN-DEV.sh sign dmr-contact-intelligence
```

Then upload the resulting `.ywdplugin` through YWD-Hotspot Plugin Manager, install it, and explicitly enable it.

## Safety boundary

The browser code runs in the existing opaque-origin Plugin UI iframe. Directory and activity data cross the trusted MessageChannel only after core verifies the package is installed, enabled, and declares the matching capability. Disabling/uninstalling the plugin revokes those reads immediately.
