#!/usr/bin/env python3
"""Generate an offline single-character pinyin map used only for homophone searching."""
from pathlib import Path
import json, os
from unidecode import unidecode

output = Path(os.environ.get("DWSS_PUBLIC_DIR", Path(__file__).parent)) / "hanzi-pinyin.js"
entries = {}
for codepoint in list(range(0x3400, 0x4DC0)) + list(range(0x4E00, 0xA000)):
    character = chr(codepoint)
    romanized = unidecode(character).strip().lower()
    if not romanized or not romanized.isascii() or romanized.startswith("["):
        continue
    romanized = "".join(char for char in romanized if char.isalpha())
    if romanized:
        entries[character] = romanized
if len(entries) < 18000:
    raise SystemExit(f"Unexpectedly small Hanzi pinyin map: {len(entries)} entries")
output.write_text(
    "window.DWSS_HANZI_PINYIN=" + json.dumps(entries, ensure_ascii=False, separators=(",", ":")) + ";\n",
    encoding="utf-8"
)
print(f"PASS: generated offline pinyin map with {len(entries)} CJK characters ({output.stat().st_size} bytes).")
