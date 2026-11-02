#!/usr/bin/env python3
"""DWSS 0.9.115: mirror the verified live 0.9.114 site and change one result hint only."""
from __future__ import annotations

import hashlib
import json
import re
import sys
import time
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urljoin, urlparse
from urllib.request import Request, urlopen

BASE_URL = "https://yanyao8686-debug.github.io/dwss-kolwezi-swahili/"
BASE_PATH = "/dwss-kolwezi-swahili/"
OLD_VERSION = "0.9.114"
NEW_VERSION = "0.9.115"
OLD_HINT = "输入中文后，翻译结果中文谐音会显示在这里"
NEW_HINT = "认为翻译结果不正确可自行修改"
ROOT = Path("public")

REQUIRED = [
    "VERSION.txt", "index.html", "app.js", "pwa.js", "sw.js", "boot.js",
    "pronunciation-search.js", "dwss-pronunciation-controls.js",
    "manifest.webmanifest", "shared-lexicon.js", "dictionary-overrides.js",
    "dictionary.js.gz", "supabase.min.js", "cover.webp",
    "DWSS-Android-Installer.apk",
]
PROTECTED = [
    "cover.webp", "DWSS-Android-Installer.apk", "dictionary.js.gz",
    "dictionary-overrides.js", "shared-lexicon.js", "pwa.js", "boot.js",
    "manifest.webmanifest", "pronunciation-search.js",
    "dwss-pronunciation-controls.js", "supabase.min.js",
]

def fail(message: str) -> None:
    raise SystemExit(message)

def fetch_bytes(url: str) -> bytes:
    last_error = None
    for attempt in range(5):
        try:
            req = Request(url, headers={"User-Agent": "DWSS-Release-Mirror/0.9.115"})
            with urlopen(req, timeout=60) as response:
                data = response.read(30 * 1024 * 1024 + 1)
            if len(data) > 30 * 1024 * 1024:
                fail(f"Remote asset exceeds 30MB safety limit: {url}")
            if not data:
                fail(f"Remote asset is empty: {url}")
            return data
        except (HTTPError, URLError, TimeoutError, OSError) as exc:
            last_error = exc
            if attempt < 4:
                time.sleep(2 ** attempt)
    fail(f"Could not download live DWSS asset after 5 attempts: {url}: {last_error}")

def local_path_for(reference: str, current_url: str) -> tuple[str, str] | None:
    absolute = urljoin(current_url, reference)
    parsed = urlparse(absolute)
    base = urlparse(BASE_URL)
    if parsed.scheme not in ("https", "http") or parsed.netloc != base.netloc:
        return None
    if not parsed.path.startswith(BASE_PATH):
        return None
    rel = unquote(parsed.path[len(BASE_PATH):]).lstrip("/")
    if not rel:
        rel = "index.html"
    parts = Path(rel).parts
    if any(part in ("..", ".") for part in parts):
        return None
    return rel, absolute

class AssetParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.refs: list[str] = []
    def handle_starttag(self, tag: str, attrs) -> None:
        values = dict(attrs)
        keys = ("src", "href", "poster") if tag in ("script", "link", "img", "source", "video", "audio") else ()
        for key in keys:
            value = values.get(key)
            if value:
                self.refs.append(value)
        srcset = values.get("srcset")
        if srcset:
            for item in srcset.split(","):
                candidate = item.strip().split()
                if candidate:
                    self.refs.append(candidate[0])

def css_references(text: str) -> list[str]:
    refs = re.findall(r"url\(\s*['\"]?([^'\")]+)", text, flags=re.I)
    refs.extend(re.findall(r"@import\s+(?:url\()?['\"]([^'\"]+)['\"]", text, flags=re.I))
    return refs

def write_download(path: str, data: bytes) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)

def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

ROOT.mkdir(parents=True, exist_ok=True)
queue: list[tuple[str, str]] = []
seen: set[str] = set()
for name in REQUIRED:
    queue.append((name, urljoin(BASE_URL, name)))

# Crawl every same-site resource referenced by the HTML, Service Worker,
# manifest and CSS so the deployed copy is complete, not just the changed page.
downloaded: dict[str, bytes] = {}
while queue:
    rel, url = queue.pop(0)
    if rel in seen:
        continue
    seen.add(rel)
    data = fetch_bytes(url + ("&" if "?" in url else "?") + "dwss_mirror=0_9_115")
    write_download(rel, data)
    downloaded[rel] = data
    if rel.endswith((".html", ".htm")):
        parser = AssetParser()
        parser.feed(data.decode("utf-8"))
        refs = parser.refs
    elif rel.endswith(".webmanifest") or rel.endswith(".json"):
        refs = []
        try:
            obj = json.loads(data.decode("utf-8"))
            refs.extend(icon.get("src", "") for icon in obj.get("icons", []) if icon.get("src"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            pass
    elif rel.endswith(".css"):
        refs = css_references(data.decode("utf-8", errors="replace"))
    elif rel == "sw.js":
        sw_text = data.decode("utf-8")
        match = re.search(r"const\s+PRECACHE_URLS\s*=\s*\[(.*?)\];", sw_text, re.S)
        if not match:
            fail("Could not find PRECACHE_URLS in live sw.js")
        refs = re.findall(r"""['"]([^'"]+)['"]""", match.group(1))
    else:
        refs = []
    for ref in refs:
        found = local_path_for(ref, url)
        if found and found[0] not in seen:
            queue.append(found)

for name in REQUIRED:
    path = ROOT / name
    if not path.is_file() or path.stat().st_size == 0:
        fail(f"Required live 0.9.114 asset was not mirrored: {name}")

html_path = ROOT / "index.html"
app_path = ROOT / "app.js"
sw_path = ROOT / "sw.js"
version_path = ROOT / "VERSION.txt"
html = html_path.read_text(encoding="utf-8")
app = app_path.read_text(encoding="utf-8")
sw = sw_path.read_text(encoding="utf-8")
version_file = version_path.read_text(encoding="utf-8")

if f"Version: {OLD_VERSION}" not in version_file:
    fail("Live baseline is not the expected DWSS 0.9.114 version.")
if f"DWSS_AUTO_UPDATE_0_9_114" not in html:
    fail("Live baseline HTML does not carry the expected 0.9.114 auto-update marker.")
if f"const APP_VERSION = '{OLD_VERSION}';" not in sw:
    fail("Live baseline Service Worker version is not 0.9.114.")
if f"version:'{OLD_VERSION}'" not in app:
    fail("Live baseline app.js version metadata is not 0.9.114.")
if html.count(OLD_HINT) != 1:
    fail(f"Expected exactly one target result hint, found {html.count(OLD_HINT)}. No change was made.")

baseline_hashes = {name: sha256(ROOT / name) for name in PROTECTED}
if len(baseline_hashes) != len(PROTECTED):
    fail("Could not compute all protected asset hashes.")

# The only UI copy change: replace the requested result-field hint exactly once.
html = html.replace(OLD_HINT, NEW_HINT, 1)

# Bump only release/cache identity so both the PWA and Android WebView receive the
# updated static page through the existing online update path; no APK rebuild.
if html.count(OLD_VERSION) < 4:
    fail(f"Unexpectedly few HTML version references: {html.count(OLD_VERSION)}")
html = html.replace(OLD_VERSION, NEW_VERSION)
html = html.replace("DWSS_AUTO_UPDATE_0_9_114", "DWSS_AUTO_UPDATE_0_9_115")
if html.count("DWSS_AUTO_UPDATE_0_9_115") != 1:
    fail("Expected exactly one new HTML auto-update marker.")
if OLD_HINT in html or html.count(NEW_HINT) != 1:
    fail("Target hint replacement verification failed.")
app = app.replace(f"version:'{OLD_VERSION}'", f"version:'{NEW_VERSION}'", 1)
sw = sw.replace(
    f"const APP_VERSION = '{OLD_VERSION}';",
    f"const APP_VERSION = '{NEW_VERSION}';",
    1,
)
version_file = version_file.replace(
    f"Version: {OLD_VERSION}", f"Version: {NEW_VERSION}", 1
)
version_file = version_file.rstrip() + (
    "\n\n0.9.115: Changed only the main translation result-field hint to "
    "“认为翻译结果不正确可自行修改”. The existing layout, colors, dimensions, "
    "translation logic, shared vocabulary and correction/synchronization behavior remain unchanged. "
    "The DWSS cover, Android installer and all protected app assets are byte-identical to 0.9.114. "
    "This is a website/PWA update; no APK rebuild is required.\n"
)

html_path.write_text(html, encoding="utf-8", newline="\n")
app_path.write_text(app, encoding="utf-8", newline="\n")
sw_path.write_text(sw, encoding="utf-8", newline="\n")
version_path.write_text(version_file, encoding="utf-8", newline="\n")

for name, expected in baseline_hashes.items():
    actual = sha256(ROOT / name)
    if actual != expected:
        fail(f"Protected asset changed unexpectedly: {name}")

print("PASS: mirrored live 0.9.114; replaced the single requested hint; bumped cache/version to 0.9.115; all protected assets remain byte-identical.")
