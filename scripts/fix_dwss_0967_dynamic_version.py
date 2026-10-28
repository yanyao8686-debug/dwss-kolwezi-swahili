#!/usr/bin/env python3
from pathlib import Path
import os
import re

root = Path(os.environ.get("DWSS_PUBLIC_DIR", "public"))
index_path = root / "index.html"
version_path = root / "VERSION.txt"
pwa_path = root / "pwa.js"
sw_path = root / "sw.js"

for path in (index_path, version_path, pwa_path, sw_path):
    if not path.is_file():
        raise SystemExit(f"Missing required baseline file: {path}")

version_text = version_path.read_text(encoding="utf-8")
match = re.search(r"^Version:\s*(\d+\.\d+\.\d+)\s*$", version_text, re.M)
if not match or match.group(1) != "0.9.66":
    raise SystemExit("Expected the verified live 0.9.66 baseline.")
old_version = match.group(1)
new_version = "0.9.67"

html = index_path.read_text(encoding="utf-8")
old_label = f"版本 {old_version} · 刚果金斯语翻译"
new_label = f"版本 {new_version} · 刚果金斯语翻译"
if html.count(old_label) != 1:
    raise SystemExit(f"Expected exactly one visible version label {old_label!r}; found {html.count(old_label)}")
html = html.replace(old_label, new_label, 1)

for old, new, label in (
    (f'<meta name="dwss-auto-update" content="{old_version}">', f'<meta name="dwss-auto-update" content="{new_version}">', "auto-update metadata"),
    (f"<!-- DWSS_AUTO_UPDATE_{old_version.replace('.', '_')} -->", f"<!-- DWSS_AUTO_UPDATE_{new_version.replace('.', '_')} -->", "auto-update marker"),
):
    if html.count(old) != 1:
        raise SystemExit(f"{label}: expected exactly one occurrence of {old!r}; found {html.count(old)}")
    html = html.replace(old, new, 1)

if "© 2026 刚果金斯语翻译/ 该应用由德威安全官陈谍匠心开发 · 保留所有权利" not in html:
    raise SystemExit("The approved ownership statement was not preserved.")
if "词库来自原始资料；当地读音尚待科卢韦齐母语者全面复核。" in html:
    raise SystemExit("The removed footer disclaimer has unexpectedly returned.")
if "软件版权、品牌归属与授权说明" in html or 'class="legal-details"' in html:
    raise SystemExit("The removed legal accordion has unexpectedly returned.")
index_path.write_text(html, encoding="utf-8")

pwa = pwa_path.read_text(encoding="utf-8")
anchor = "  const $ = id => document.getElementById(id);"
if pwa.count(anchor) != 1:
    raise SystemExit("Could not identify the PWA startup insertion point.")
dynamic_version_code = r'''
  // Always show the actual published version, not a manually maintained label.
  // VERSION.txt is refreshed from the network on each app open; the Service
  // Worker stores the last successful response for offline fallback.
  async function refreshDisplayedVersion() {
    try {
      const footer = document.querySelector('.footer');
      if (!footer) return;
      const response = await fetch('./VERSION.txt?dwss-version-check=' + Date.now(), { cache: 'no-store' });
      if (!response.ok) return;
      const content = await response.text();
      const match = content.match(/^Version:\s*(\d+\.\d+\.\d+)\s*$/m);
      if (!match) return;
      const textNode = Array.from(footer.childNodes).find(node => node.nodeType === 3 && node.nodeValue.trim());
      if (textNode) textNode.nodeValue = '版本 ' + match[1] + ' · 刚果金斯语翻译';
    } catch (error) {
      // Keep the build-time/cached version label if the network is unavailable.
      console.info('[DWSS] Keeping the cached version label; live version check unavailable.', error);
    }
  }
  refreshDisplayedVersion();
'''
pwa = pwa.replace(anchor, anchor + dynamic_version_code, 1)
if pwa.count("refreshDisplayedVersion();") != 1:
    raise SystemExit("Dynamic version refresh did not insert exactly once.")
pwa_path.write_text(pwa, encoding="utf-8")

sw = sw_path.read_text(encoding="utf-8")
if sw.count("const APP_VERSION = '0.9.66';") != 1:
    raise SystemExit("Expected exactly one Service Worker APP_VERSION 0.9.66 marker.")
sw = sw.replace("const APP_VERSION = '0.9.66';", "const APP_VERSION = '0.9.67';", 1)

precache_anchor = "  './', './index.html', './boot.js'"
if sw.count(precache_anchor) != 1:
    raise SystemExit("Could not identify the Service Worker precache list.")
sw = sw.replace(precache_anchor, "  './', './VERSION.txt', './index.html', './boot.js'", 1)

fetch_anchor = "  if (url.origin !== self.location.origin) return;\n"
if sw.count(fetch_anchor) != 1:
    raise SystemExit("Could not identify the Service Worker same-origin fetch guard.")
version_route = r'''  // VERSION.txt is network-first: show the newest release online, but retain
  // the last successfully cached version label when the device is offline.
  if (url.pathname.endsWith('/VERSION.txt')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const latestUrl = new URL('./VERSION.txt', self.registration.scope).href;
      try {
        const fresh = await fetch(request, { cache: 'no-store' });
        if (fresh && fresh.ok) await cache.put(latestUrl, fresh.clone());
        return fresh;
      } catch (_) {
        return (await cache.match(latestUrl)) || Response.error();
      }
    })());
    return;
  }
'''
sw = sw.replace(fetch_anchor, fetch_anchor + version_route, 1)
sw_path.write_text(sw, encoding="utf-8")

version_text = version_text.replace(f"Version: {old_version}", f"Version: {new_version}", 1)
version_text = re.sub(r"^Release date: .*$", "Release date: 2026-10-29", version_text, count=1, flags=re.M)
version_text += "\n0.9.67: Automatically read the current VERSION.txt on each app open; use the last cached version offline and retain the live app-name suffix.\n"
version_path.write_text(version_text, encoding="utf-8")

print("PASS: 0.9.67 now reads the live release number automatically; Service Worker keeps last successful VERSION.txt for offline display.")
