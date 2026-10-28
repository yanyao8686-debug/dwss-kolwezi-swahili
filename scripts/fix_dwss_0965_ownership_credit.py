#!/usr/bin/env python3
from pathlib import Path
import os
import re

root = Path(os.environ.get("DWSS_PUBLIC_DIR", "public"))
index_path = root / "index.html"
version_path = root / "VERSION.txt"
sw_path = root / "sw.js"

for path in (index_path, version_path, sw_path):
    if not path.is_file():
        raise SystemExit(f"Missing required baseline file: {path}")

html = index_path.read_text(encoding="utf-8")

old_stamp = "© 2026 DWSS / 陈谍 · 保留所有权利"
new_stamp = "© 2026 刚果金斯语翻译/ 该应用由德威安全官陈谍匠心开发 · 保留所有权利"
if html.count(old_stamp) != 1:
    raise SystemExit(f"Expected exactly one old ownership stamp; found {html.count(old_stamp)}")
html = html.replace(old_stamp, new_stamp, 1)

old_style = ".ownership-stamp{display:inline-block;margin-top:5px;padding:3px 8px;border:1px solid #b7c8bf;border-radius:30px;color:#345c4a;font-size:10px;font-weight:750;letter-spacing:.3px}"
new_style = ".ownership-stamp{display:inline-block;max-width:100%;white-space:normal;overflow-wrap:anywhere;text-align:center;margin-top:5px;padding:3px 8px;border:1px solid #b7c8bf;border-radius:18px;color:#345c4a;font-size:10px;font-weight:750;letter-spacing:.3px;line-height:1.7}"
if html.count(old_style) != 1:
    raise SystemExit(f"Expected exactly one ownership stamp style; found {html.count(old_style)}")
html = html.replace(old_style, new_style, 1)

for old, new, label in (
    ('<meta name="dwss-auto-update" content="0.9.64">', '<meta name="dwss-auto-update" content="0.9.65">', "auto-update metadata"),
    ("<!-- DWSS_AUTO_UPDATE_0_9_64 -->", "<!-- DWSS_AUTO_UPDATE_0_9_65 -->", "auto-update marker"),
    ("版本 0.9.64 · DWSS 智能翻译 PWA", "版本 0.9.65 · DWSS 智能翻译 PWA", "visible version"),
):
    if html.count(old) != 1:
        raise SystemExit(f"{label}: expected exactly one occurrence of {old!r}; found {html.count(old)}")
    html = html.replace(old, new, 1)

if html.count(new_stamp) != 1:
    raise SystemExit("The new ownership statement did not remain exactly once.")
if old_stamp in html:
    raise SystemExit("The old ownership statement remains in the HTML.")
if "词库来自原始资料；当地读音尚待科卢韦齐母语者全面复核。" in html:
    raise SystemExit("The 0.9.64-removed disclaimer has unexpectedly returned.")
if "软件版权、品牌归属与授权说明" in html or 'class="legal-details"' in html:
    raise SystemExit("The 0.9.64-removed legal accordion has unexpectedly returned.")

index_path.write_text(html, encoding="utf-8")

version_text = version_path.read_text(encoding="utf-8")
if version_text.count("Version: 0.9.64") != 1:
    raise SystemExit("Expected exactly one Version: 0.9.64 marker.")
version_text = version_text.replace("Version: 0.9.64", "Version: 0.9.65", 1)
version_text = re.sub(r"^Release date: .*$", "Release date: 2026-10-29", version_text, count=1, flags=re.M)
version_text += "\n0.9.65: Replace the footer ownership statement with the requested app name and developer credit; allow the longer ownership stamp to wrap cleanly on phones.\n"
version_path.write_text(version_text, encoding="utf-8")

sw = sw_path.read_text(encoding="utf-8")
if sw.count("const APP_VERSION = '0.9.64';") != 1:
    raise SystemExit("Expected exactly one Service Worker APP_VERSION 0.9.64 marker.")
sw = sw.replace("const APP_VERSION = '0.9.64';", "const APP_VERSION = '0.9.65';", 1)
sw_path.write_text(sw, encoding="utf-8")

print("PASS: updated the footer ownership text, mobile wrapping style, and PWA cache version to 0.9.65.")
