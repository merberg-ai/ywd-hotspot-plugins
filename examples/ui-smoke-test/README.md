# Plugin UI Smoke Test

Harmless signed test package for YWD-Hotspot Plugin UI v1.

It has no Pi-side service, no RF ownership, no direct network capability, and no device access. When installed and enabled under the master plugin switch it declares the `UI TEST` dashboard section. Its JavaScript runs only inside the sandboxed Plugin UI frame and exercises the narrow bridge operations:

- `plugin.getState`
- `plugin.getConfig`
- `plugin.ping`

Expected lifecycle:

```text
UPLOAD -> VERIFIED / AVAILABLE
       -> INSTALL
       -> ENABLE
       -> UI TEST nav section appears
       -> open UI TEST and confirm BRIDGE ONLINE
       -> change Test message in Plugin Manager and save
       -> reopen UI TEST and confirm updated message
       -> DISABLE -> UI TEST section disappears
       -> UNINSTALL -> configuration preserved
       -> REMOVE DATA / REMOVE PACKAGE as desired
```

Also verify that master Plugin Support OFF removes the UI section and leaves normal hotspot operation unchanged.
