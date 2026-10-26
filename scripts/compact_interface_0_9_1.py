#!/usr/bin/env python3
"""Install the DWSS 0.9.1 compact-interface patch from checked-in payload parts."""
from pathlib import Path
import base64, gzip, hashlib, subprocess, sys

REPO = Path(__file__).resolve().parent.parent
PUBLIC = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("public")
PARTS = REPO / "releases" / "0.9.1" / "compact-interface"
NAMES = ["001.gz.b64", "002.gz.b64", "003.gz.b64"]
EXPECTED_SOURCE_SHA256 = "3dcad9e80050ff8ac8cb20ee5eaafa2879b71928c151241fed29b317b89fd035"

if not PUBLIC.is_dir():
    raise SystemExit("Pages public/ directory is missing")
encoded = "".join((PARTS / name).read_text(encoding="ascii").strip() for name in NAMES)
if len(encoded) != 10092:
    raise SystemExit(f"DWSS compact patch payload length mismatch: {len(encoded)}")
try:
    source = gzip.decompress(base64.b64decode(encoded, validate=True))
except Exception as exc:
    raise SystemExit(f"Could not decode compact patch payload: {exc}")
digest = hashlib.sha256(source).hexdigest()
if digest != EXPECTED_SOURCE_SHA256:
    raise SystemExit(f"Compact patch checksum mismatch: {digest}")
temporary = PUBLIC.parent / "_dwss_compact_patch_0_9_1.py"
try:
    temporary.write_bytes(source)
    subprocess.run([sys.executable, str(temporary), str(PUBLIC)], check=True)
finally:
    temporary.unlink(missing_ok=True)
print(f"Verified and installed DWSS 0.9.1 compact interface (sha256={digest}).")
