#!/usr/bin/env python3
from __future__ import annotations

import json
import signal
import threading
from pathlib import Path

PLUGIN_ID = "upload-smoke-test"
VERSION = "1.0.0"
CONFIG = Path(f"/etc/ywd-hotspot/plugins/{PLUGIN_ID}.json")
STOP = threading.Event()


def read_config():
    try:
        raw = json.loads(CONFIG.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            raw = {}
    except Exception:
        raw = {}

    label = str(raw.get("label") or "Uploaded YWD plugin is alive")[:80]
    try:
        interval = int(raw.get("interval_s", 15))
    except Exception:
        interval = 15
    interval = max(10, min(300, interval))
    show_counter = bool(raw.get("show_counter", True))
    return label, interval, show_counter


def stop(_signum, _frame):
    STOP.set()


def main():
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    label, interval, show_counter = read_config()
    print(
        f"YWD upload-smoke-test v{VERSION} starting: "
        f"interval={interval}s counter={show_counter}",
        flush=True,
    )

    counter = 0
    while not STOP.is_set():
        counter += 1
        suffix = f" #{counter}" if show_counter else ""
        print(f"YWD upload-smoke-test: {label}{suffix}", flush=True)
        STOP.wait(interval)

    print("YWD upload-smoke-test stopping cleanly", flush=True)


if __name__ == "__main__":
    main()
