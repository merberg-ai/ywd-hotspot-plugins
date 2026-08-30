#!/usr/bin/env python3
"""Static/final-source smoke checks for DMR Contact Intelligence 0.1.0."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / "plugins" / "dmr-contact-intelligence"


def require(text: str, marker: str, source: str) -> None:
    if marker not in text:
        raise AssertionError(f"{source}: missing marker {marker!r}")


def forbid(text: str, marker: str, source: str) -> None:
    if marker in text:
        raise AssertionError(f"{source}: forbidden marker {marker!r}")


def main() -> int:
    manifest = json.loads((PLUGIN / "plugin.json").read_text(encoding="utf-8"))
    expected_caps = ["ui:section", "read:dmr-activity", "read:dmr-directory"]

    assert manifest.get("api") == 1
    assert manifest.get("id") == "dmr-contact-intelligence"
    assert manifest.get("name") == "DMR Contact Intelligence"
    assert manifest.get("version") == "0.1.0"
    # YWD-Hotspot archive v1 intentionally requires every uploaded package to
    # remain in the experimental trust class. Publisher authenticity is carried
    # separately by the trusted Ed25519 package signature/key id.
    assert manifest.get("trust") == "experimental"
    assert manifest.get("kind") == "ui"
    assert manifest.get("provider") == "browser-ui"
    assert manifest.get("capabilities") == expected_caps
    assert manifest.get("rf_mode") is False
    assert manifest.get("dependencies") == []
    assert manifest.get("hardware") == []
    assert manifest.get("ui") == {
        "api": 1,
        "label": "CONTACTS",
        "script": "ui.js",
        "style": "ui.css",
    }

    js = (PLUGIN / "ui.js").read_text(encoding="utf-8")
    css = (PLUGIN / "ui.css").read_text(encoding="utf-8")
    readme = (PLUGIN / "README.md").read_text(encoding="utf-8")

    for marker in (
        "&quot;",
        "TGIF_RF_BASE = 5_000_000",
        "TGIF · TG",
        "RF TG ${ident}",
        "hasActivitySnapshot",
        "setBridgeState('stale', 'STALE'",
        "refresh failed · showing last snapshot",
        "DIRECTORY_STALE_SECONDS",
        "getPreference('observed-collapsed')",
        "setPreference('observed-collapsed'",
        "aria-label=\"Open station profile for",
        "Lookup unavailable. Try again.",
        "prefers-reduced-motion: reduce",
    ):
        require(js, marker, "ui.js")

    for marker in (
        "input:-webkit-autofill",
        "button:focus-visible",
        ".pill.stale",
        ".directory-state.stale",
        ".current.error",
        "@media(prefers-reduced-motion:reduce)",
    ):
        require(css, marker, "ui.css")

    for marker in (
        "Release 0.1.0",
        "hardware-proven Alpha 6",
        "trust: experimental",
        "read:dmr-activity",
        "read:dmr-directory",
    ):
        require(readme, marker, "README.md")

    # The sandbox bridge is the only path to privileged data. Keep the plugin
    # free of direct network/storage/parent-DOM escape hatches.
    for marker in (
        "fetch(",
        "XMLHttpRequest",
        "WebSocket",
        "EventSource",
        "localStorage",
        "sessionStorage",
        "document.cookie",
        "window.parent",
        "window.top",
    ):
        forbid(js, marker, "ui.js")

    # A syntax parser is cheap insurance when Node happens to be installed on
    # the developer machine; the static checks remain useful without it.
    node = shutil.which("node")
    if node:
        subprocess.run([node, "--check", str(PLUGIN / "ui.js")], check=True)

    if css.count("{") != css.count("}"):
        raise AssertionError("ui.css: unbalanced braces")

    print("DMR Contact Intelligence final smoke: PASS")
    if node:
        print("JavaScript syntax: PASS (node --check)")
    else:
        print("JavaScript syntax: SKIP (node not installed)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
