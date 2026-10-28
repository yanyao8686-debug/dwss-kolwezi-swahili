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
old_label = "版本 0.9.65 · DWSS 智能翻译 PWA"
new_label = "版本 0.9.66 · 刚果金斯语翻译"
if html.count(old_label) != 1:
    raise SystemExit(f"Expected exactly one old version label; found {html.count(old_label)}")
html = html.replace(old_label, new_label, 1)

for old, new, label in (
    ('<meta name="dwss-auto-update" content="0.9.65">', '<meta name="dwss-auto-update" content="0.9.66">', "auto-update metadata"),
    ("<!-- DWSS_AUTO_UPDATE_0_9_65 -->", "<!-- DWSS_AUTO_UPDATE_0_9_66 -->", "auto-update marker"),
):
    if html.count(old) != 1:
        raise SystemExit(f"{label}: expected exactly one occurrence of {old!r}; found {html.count(old)}")
    html = html.replace(old, new, 1)

if old_label in html or html.count(new_label) != 1:
    raise SystemExit("The requested app-name label replacement did not apply exactly once.")
if "版本 0.9.66 · DWSS 智能翻译 PWA" in html:
    raise SystemExit("The old PWA product descriptor remains on the visible version label.")
if "© 2026 刚果金斯语翻译/ 该应用由德威安全官陈谍匠心开发 · 保留所有权利" not in html:
    raise SystemExit("The previously approved ownership statement was not preserved.")
if "词库来自原始资料；当地读音尚待科卢韦齐母语者全面复核。" in html:
    raise SystemExit("The previously removed footer disclaimer has unexpectedly returned.")
if "软件版权、品牌归属与授权说明" in html or 'class="legal-details"' in html:
    raise SystemExit("The previously removed legal accordion has unexpectedly returned.")

index_path.write_text(html, encoding="utf-8")

version_text = version_path.read_text(encoding="utf-8")
if version_text.count("Version: 0.9.65") != 1:
    raise SystemExit("Expected exactly one Version: 0.9.65 marker.")
version_text = version_text.replace("Version: 0.9.65", "Version: 0.9.66", 1)
version_text = re.sub(r"^Release date: .*$", "Release date: 2026-10-29", version_text, count=1, flags=re.M)
version_text += "\n0.9.66: Change the visible version descriptor from DWSS 智能翻译 PWA to 刚果金斯语翻译 while retaining an accurate current version number.\n"
version_path.write_text(version_text, encoding="utf-8")

sw = sw_path.read_text(encoding="utf-8")
if sw.count("const APP_VERSION = '0.9.65';") != 1:
    raise SystemExit("Expected exactly one Service Worker APP_VERSION 0.9.65 marker.")
sw = sw.replace("const APP_VERSION = '0.9.65';", "const APP_VERSION = '0.9.66';", 1)
sw_path.write_text(sw, encoding="utf-8")

print("PASS: updated the visible product descriptor to 刚果金斯语翻译 and advanced the site/cache version to 0.9.66.")
