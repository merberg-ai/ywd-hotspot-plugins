# DMR Contact Intelligence

Experimental YWD-Hotspot browser UI plugin for local DMR identity lookup and recent-activity enrichment.

## Alpha 4 scope

- dedicated **CONTACTS** dashboard section;
- callsign or numeric DMR-ID search against the hotspot's existing local RadioID-derived `DMRIds.dat` data;
- visible lookup progress with a spinner and clear success, no-match, and error states;
- direct sandbox-safe lookup button handling plus Enter-key lookup from the input field;
- cleaner end-user UI copy with development notes, version markers, cache diagnostics, and scan-count/timing diagnostics removed from the visible page;
- reuse of recently resolved activity identities so a callsign just seen in Last Heard can resolve from core's bounded identity cache;
- bounded prefix searches that stop after enough results instead of scanning the entire directory unnecessarily;
- batch DMR-ID-to-callsign resolution for current and recent activity rows;
- bounded, sanitized read-only DMR activity from trusted core;
- optional auto-refresh only while the plugin iframe is open;
- no RF authority, modem access, arbitrary dashboard fetch, arbitrary network access, or Pi-side plugin service.

The current RC3 DMR ID file stores DMR ID and callsign. Richer directory fields such as name/city/state/country and persistent first-seen/last-seen/QSO observations remain the next storage/update phase.

## Required core capabilities

```text
ui:section
read:dmr-activity
read:dmr-directory
```

These are generic trusted-core Plugin UI capabilities rather than Contact-Intelligence-specific hooks so future traffic/scanner plugins can reuse the same read-only contracts.

Alpha 4 uses the same matching `dev-plugins` core directory bridge support introduced for Alpha 2. No additional core change is required for this UI polish release.

## Build

Use the repository's generic signed UI-plugin flow:

```bash
./PLUGIN-DEV.sh validate dmr-contact-intelligence
./PLUGIN-DEV.sh sign dmr-contact-intelligence
```

Then upload the resulting `.ywdplugin` through YWD-Hotspot Plugin Manager and apply it as the same-ID plugin update.

## Safety boundary

The browser code runs in the existing opaque-origin Plugin UI iframe. Directory and activity data cross the trusted MessageChannel only after core verifies the package is installed, enabled, and declares the matching capability. Disabling or uninstalling the plugin revokes those reads immediately.
