# DMR Contact Intelligence

Experimental YWD-Hotspot browser UI plugin for local DMR identity lookup and recent-activity enrichment.

## Alpha 3 scope

- dedicated **CONTACTS** dashboard section;
- callsign or numeric DMR-ID search against the hotspot's existing local RadioID-derived `DMRIds.dat` data;
- visible lookup progress with a spinner, live status text, explicit success/no-match/error states, and lookup timing;
- direct sandbox-safe lookup button handling plus Enter-key lookup from the input field; the plugin does not depend on HTML form submission because Plugin UI intentionally runs without `allow-forms`;
- visible `0.1.0-alpha3` footer marker so the installed UI version is easy to verify;
- reuse of recently resolved activity identities so a callsign just seen in Last Heard can resolve from core's bounded identity cache;
- bounded prefix searches that stop after enough results instead of scanning the entire directory unnecessarily;
- batch DMR-ID-to-callsign resolution for the current and recent activity rows;
- bounded, sanitized read-only DMR activity from trusted core;
- optional auto-refresh only while the plugin iframe is open;
- no RF authority, modem access, arbitrary dashboard fetch, arbitrary network access, or Pi-side plugin service.

The current RC3 DMR ID file stores DMR ID and callsign. Richer directory fields such as name/city/state/country and persistent first-seen/last-seen/QSO observations remain the next storage/update phase rather than being inferred or invented.

## Required core capabilities

```text
ui:section
read:dmr-activity
read:dmr-directory
```

These are generic trusted-core Plugin UI capabilities rather than Contact-Intelligence-specific hooks so future traffic/scanner plugins can reuse the same read-only contracts.

Alpha 3 expects the matching `dev-plugins` core directory bridge support introduced for Alpha 2. No additional core change is required for the Alpha 3 sandbox lookup repair.

## Build

Use the repository's generic signed UI-plugin flow:

```bash
./PLUGIN-DEV.sh validate dmr-contact-intelligence
./PLUGIN-DEV.sh sign dmr-contact-intelligence
```

Then upload the resulting `.ywdplugin` through YWD-Hotspot Plugin Manager and apply it as the same-ID plugin update.

## Safety boundary

The browser code runs in the existing opaque-origin Plugin UI iframe. Directory and activity data cross the trusted MessageChannel only after core verifies the package is installed, enabled, and declares the matching capability. Disabling/uninstalling the plugin revokes those reads immediately.
