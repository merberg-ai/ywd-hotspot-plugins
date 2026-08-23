#!/usr/bin/env python3
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
old = "const MAX_SCHEDULED_DEPTH_MS = 700;"
new = "const MAX_SCHEDULED_DEPTH_MS = 900;"
if text.count(old) != 1:
    raise SystemExit("Alpha20 expected exactly one 700 ms scheduled-depth ceiling")
path.write_text(text.replace(old, new, 1))
