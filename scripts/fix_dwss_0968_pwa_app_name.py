#!/usr/bin/env python3
from pathlib import Path
import json
import os
import re

root = Path(os.environ.get("DWSS_PUBLIC_DIR", "public"))
index_path = root / "index.html"
manifest_path = root / "manifest.webmanifest"
version_path = root / "VERSION.txt"
sw_path = root / "sw.js"

for path in (index_path, manifest_path, version_path, sw_path):
    if not path.is_file():
        raise SystemExit(f"Missing required baseline file: {path}")

version_text = version_path.read_text(encoding="utf-8")
match = re.search(r"^Version:\s*(\d+\.\d+\.\d+)\s*$", version_text, re.M)
if not match or match.group(1) != "0.9.67":
    raise SystemExit("Expected the verified live 0.9.67 baseline.")

index = index_path.read_text(encoding="utf-8")
replacements = (
    ('<meta name="apple-mobile-web-app-title" content="DWSS斯语助手">',
     '<meta name="apple-mobile-web-app-title" content="刚果金斯语翻译">', "Apple/PWA title"),
    ('<meta name="application-name" content="DWSS 科卢韦齐斯瓦西里语助手">',
     '<meta name="application-name" content="刚果金斯语翻译">', "application name"),
    ('<title>DWSS 科卢韦齐齐斯瓦西里语助手</title>',
     '<title>刚果金斯语翻译</title>', "HTML title"),
)
# Accept the actual existing title spelling without guessing or broad replacement.
if not any(old in index for old, _, _ in replacements):
    raise SystemExit("No known legacy PWA/app title marker was found in index.html.")
for old, new, label in replacements:
    if old not in index:
        if label == "HTML title":
            legacy_titles = [
                '<title>DWSS 科卢韦齐斯瓦西里语助手</title>',
                '<title>DWSS 科卢韦齐斯瓦西里语助手</title>',
                '<title>DWSS 科卢韦齐斯瓦西里语助手</title>',
            ]
            found = [candidate for candidate in legacy_titles if candidate in index]
            if len(found) == 1:
                old = found[0]
            else:
                raise SystemExit(f"Could not uniquely identify existing HTML title; candidates found: {len(found)}")
        else:
            raise SystemExit(f"{label}: expected exact legacy marker was not found.")
    if index.count(old) != 1:
        raise SystemExit(f"{label}: expected exactly one old marker; found {index.count(old)}")
    index = index.replace(old, new, 1)

old_version = "0.9.67"
new_version = "0.9.68"
for old, new, label in (
    (f'<meta name="dwss-auto-update" content="{old_version}">', f'<meta name="dwss-auto-update" content="{new_version}">', "auto-update metadata"),
    (f"<!-- DWSS_AUTO_UPDATE_{old_version.replace('.', '_')} -->", f"<!-- DWSS_AUTO_UPDATE_{new_version.replace('.', '_')} -->", "auto-update marker"),
    (f"版本 {old_version} · 刚果金斯语翻译", f"版本 {new_version} · 刚果金斯语翻译", "visible version"),
):
    if index.count(old) != 1:
        raise SystemExit(f"{label}: expected exactly one occurrence of {old!r}; found {index.count(old)}")
    index = index.replace(old, new, 1)

if "© 2026 刚果金斯语翻译/ 该应用由德威安全官陈谍匠心开发 · 保留所有权利" not in index:
    raise SystemExit("Previously approved ownership footer text is missing.")
if "DWSS斯语助手" in index or "DWSS 科卢韦齐斯瓦西里语助手" in index:
    raise SystemExit("A stale legacy app name remains in index.html.")
index_path.write_text(index, encoding="utf-8")

manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
if manifest.get("id") != "./?app=dwss-kolwezi-swahili":
    raise SystemExit("Unexpected PWA manifest id; refusing to change installation identity.")
if manifest.get("display") != "standalone":
    raise SystemExit("PWA display mode is not standalone; refusing to alter unrelated install behavior.")
manifest["name"] = "刚果金斯语翻译"
manifest["short_name"] = "刚果金斯语翻译"
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

version_text = version_text.replace("Version: 0.9.67", "Version: 0.9.68", 1)
version_text = re.sub(r"^Release date: .*$", "Release date: 2026-10-29", version_text, count=1, flags=re.M)
lines = version_text.splitlines()
if lines:
    lines[0] = "刚果金斯语翻译"
version_text = "\n".join(lines).rstrip() + "\n"
version_text += "\n0.9.68: Update PWA install name, short name, browser-tab title and mobile web-app title to 刚果金斯语翻译; preserve the existing PWA identity and standalone display mode.\n"
version_path.write_text(version_text, encoding="utf-8")

sw = sw_path.read_text(encoding="utf-8")
if sw.count("const APP_VERSION = '0.9.67';") != 1:
    raise SystemExit("Expected exactly one Service Worker APP_VERSION 0.9.67 marker.")
sw = sw.replace("const APP_VERSION = '0.9.67';", "const APP_VERSION = '0.9.68';", 1)
sw_path.write_text(sw, encoding="utf-8")

print("PASS: PWA name/short_name/title now use 刚果金斯语翻译; current version and Service Worker cache version are 0.9.68.")
