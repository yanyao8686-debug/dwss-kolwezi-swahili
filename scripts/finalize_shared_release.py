#!/usr/bin/env python3
"""Finalize DWSS 0.6.5 release files after unpacking the 0.6.4 archive."""
from pathlib import Path
import re
import sys

root = Path(sys.argv[1] if len(sys.argv) > 1 else "public")

def read(name):
    p = root / name
    return p.read_text(encoding="utf-8") if p.exists() else None

def write(name, content):
    (root / name).write_text(content, encoding="utf-8")

# Load the Supabase browser SDK before the shared panel script.
html = read("index.html")
if html is None:
    raise SystemExit("index.html is missing")
if "supabase.min.js" not in html or "shared-lexicon.js" not in html:
    boot = '<script src="boot.js"></script>'
    additions = '<script defer src="./supabase.min.js"></script>\n<script defer src="./shared-lexicon.js"></script>'
    if boot in html:
        html = html.replace(boot, boot + "\n" + additions, 1)
    else:
        html = html.replace("</body>", additions + "\n</body>", 1)
html = html.replace("版本 0.6.4", "版本 0.6.5")
write("index.html", html)

# Bump the Service Worker cache key and include cloud scripts in the core offline cache.
sw = read("sw.js")
if sw is None:
    raise SystemExit("sw.js is missing")
sw = re.sub(r"const APP_VERSION = ['\"]0\\.6\\.4['\"];", "const APP_VERSION = '0.6.5';", sw, count=1)
match = re.search(r"(const PRECACHE_URLS = \\[)([\\s\\S]*?)(\\];)", sw)
if not match:
    raise SystemExit("Could not find PRECACHE_URLS in sw.js")
fragment = match.group(2)
for asset in ("./shared-lexicon.js", "./supabase.min.js"):
    if asset not in fragment:
        fragment += "  '" + asset + "',\\n"
sw = sw[:match.start()] + match.group(1) + fragment + match.group(3) + sw[match.end():]
write("sw.js", sw)

# Update user-facing PWA offline diagnostics.
pwa = read("pwa.js")
if pwa is not None:
    pwa = pwa.replace(
        "核心程序、词库、封面和图标已由 Service Worker 缓存。",
        "核心程序、内置词库、共享词库组件、封面和图标已由 Service Worker 缓存。"
    )
    pwa = pwa.replace(
        "核心程序、当地词库、法语辅助词表、新封面和图标已缓存。",
        "核心程序、当地词库、法语辅助词表、云端共享词库组件、新封面和图标已缓存。"
    )
    write("pwa.js", pwa)

# Update release metadata.
version = read("VERSION.txt")
if version is None:
    raise SystemExit("VERSION.txt is missing")
version = version.replace("Version: 0.6.4", "Version: 0.6.5")
if "Shared vocabulary:" not in version:
    version += "\nShared vocabulary: cloud terms participate in main translation and dictionary search; real-time updates, offline cache and retry queue included.\n"
write("VERSION.txt", version)

# Keep release documentation consistent with the new shared behavior.
guide = read("README_部署与使用.md")
if guide is not None:
    guide = guide.replace("PWA 0.6.3", "PWA 0.6.5").replace("版本 0.6.3", "版本 0.6.5")
    marker = "## 备份与恢复"
    section = """## 云端共享词库

首页右下角的“共享词库”可以添加当地斯瓦西里语或法语补位词条。在线提交后，词条自动进入 DWSS 共享词库，其他在线设备会收到实时更新，并直接参与主翻译、短句拼配和词典搜索。内置基础词库与个人本地词库保持独立；共享词条在翻译结果中标注为“云端共享词库”。离线新增会暂存在本机，恢复网络后自动提交。清除浏览器站点数据前，请先确认离线队列已同步完成。

"""
    if "## 云端共享词库" not in guide:
        guide = guide.replace(marker, section + marker, 1)
    guide = guide.replace("个人新增词条只保存在当前设备，不会自动跨设备同步。", "个人“词库维护”新增词条仍保存在当前设备；需要跨设备共享时，请使用首页右下角的“共享词库”提交。")
    write("README_部署与使用.md", guide)

print("DWSS 0.6.5 release files finalized.")
