#!/usr/bin/env python3
"""DWSS 0.9.117: preserve French spelling when shared terms return from Supabase."""
from __future__ import annotations
import hashlib, json, re, time
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urljoin, urlparse
from urllib.request import Request, urlopen

BASE_URL = "https://yanyao8686-debug.github.io/dwss-kolwezi-swahili/"
BASE_PATH = "/dwss-kolwezi-swahili/"
OLD_VERSION = "0.9.117"
NEW_VERSION = "0.9.118"
ROOT = Path("public")

REQUIRED = [
    "VERSION.txt", "index.html", "app.js", "shared-lexicon.js", "pwa.js", "sw.js",
    "boot.js", "pronunciation-search.js", "dwss-pronunciation-controls.js",
    "manifest.webmanifest", "dictionary-overrides.js", "dictionary.js.gz",
    "supabase.min.js", "cover.webp", "DWSS-Android-Installer.apk",
    "french-extension.js", "french-ipa-index.tsv.gz", "french-lexicon-sources.txt",
    "french-FREEDICT-COPYING.txt", "french-IPA-LICENSE.txt",
]
PROTECTED = [
    "cover.webp", "DWSS-Android-Installer.apk", "dictionary.js.gz",
    "dictionary-overrides.js", "shared-lexicon.js", "pwa.js", "boot.js",
    "manifest.webmanifest", "pronunciation-search.js",
    "dwss-pronunciation-controls.js", "supabase.min.js", "french-extension.js",
    "french-ipa-index.tsv.gz", "french-lexicon-sources.txt",
    "french-FREEDICT-COPYING.txt", "french-IPA-LICENSE.txt",
]

def fail(message: str) -> None:
    raise SystemExit(message)

def fetch_bytes(url: str, limit: int = 40 * 1024 * 1024) -> bytes:
    last = None
    for attempt in range(5):
        try:
            req = Request(url, headers={"User-Agent": "DWSS-Release-Mirror/0.9.117"})
            with urlopen(req, timeout=120) as response:
                data = response.read(limit + 1)
            if not data or len(data) > limit:
                fail("Empty or oversized live asset: " + url)
            return data
        except (HTTPError, URLError, TimeoutError, OSError) as exc:
            last = exc
            if attempt < 4:
                time.sleep(2 ** attempt)
    fail(f"Could not download {url}: {last}")

def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def write_asset(name: str, data: bytes) -> None:
    target = ROOT / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)

def local_reference(value: str, current_url: str):
    absolute = urljoin(current_url, value)
    p, b = urlparse(absolute), urlparse(BASE_URL)
    if p.scheme not in ("https", "http") or p.netloc != b.netloc or not p.path.startswith(BASE_PATH):
        return None
    relative = unquote(p.path[len(BASE_PATH):]).lstrip("/") or "index.html"
    if any(x in (".", "..") for x in Path(relative).parts):
        return None
    return relative, absolute

class HtmlAssets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs = []
    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag in ("script", "link", "img", "source", "video", "audio"):
            for key in ("src", "href", "poster"):
                if values.get(key):
                    self.refs.append(values[key])
        if values.get("srcset"):
            for item in values["srcset"].split(","):
                part = item.strip().split()
                if part:
                    self.refs.append(part[0])

def css_references(text: str):
    refs = re.findall(r"url\(\s*['\"]?([^'\")]+)", text, re.I)
    refs += re.findall(r"@import\s+(?:url\()?['\"]([^'\"]+)['\"]", text, re.I)
    return refs

# Mirror the complete current site, not only changed JavaScript, so all other
# pages, fonts, icons and offline files are retained byte-for-byte.
ROOT.mkdir(parents=True, exist_ok=True)
queue = [(x, urljoin(BASE_URL, x)) for x in REQUIRED]
seen = set()
while queue:
    name, url = queue.pop(0)
    if name in seen:
        continue
    seen.add(name)
    data = fetch_bytes(url + ("&" if "?" in url else "?") + "dwss_mirror=0_9_117")
    write_asset(name, data)
    refs = []
    if name.endswith((".html", ".htm")):
        parser = HtmlAssets()
        parser.feed(data.decode("utf-8"))
        refs = parser.refs
    elif name.endswith(".css"):
        refs = css_references(data.decode("utf-8", errors="replace"))
    elif name.endswith((".webmanifest", ".json")):
        try:
            obj = json.loads(data.decode("utf-8"))
            refs = [v.get("src", "") for v in obj.get("icons", []) if v.get("src")]
        except Exception:
            pass
    elif name == "sw.js":
        source = data.decode("utf-8")
        found = re.search(r"const\s+PRECACHE_URLS\s*=\s*\[(.*?)\];", source, re.S)
        if not found:
            fail("Service Worker PRECACHE_URLS missing.")
        refs = re.findall(r"""['"]([^'"]+)['"]""", found.group(1))
    for ref in refs:
        parsed = local_reference(ref, url)
        if parsed and parsed[0] not in seen:
            queue.append(parsed)

for name in REQUIRED:
    p = ROOT / name
    if not p.is_file() or p.stat().st_size == 0:
        fail("Required 0.9.116 file missing: " + name)

paths = {name: ROOT / name for name in ("VERSION.txt", "index.html", "app.js", "sw.js", "shared-lexicon.js")}
version = paths["VERSION.txt"].read_text(encoding="utf-8")
html = paths["index.html"].read_text(encoding="utf-8")
app = paths["app.js"].read_text(encoding="utf-8")
sw = paths["sw.js"].read_text(encoding="utf-8")
shared = paths["shared-lexicon.js"].read_text(encoding="utf-8")

if f"Version: {OLD_VERSION}" not in version:
    fail("Live site is not 0.9.116; VERSION.txt begins " + repr(version[:100]))
if "DWSS_AUTO_UPDATE_0_9_116" not in html:
    fail("Live HTML cache marker is not 0.9.116.")
if "version:'0.9.116'" not in app:
    fail("Live app.js version is not 0.9.116.")
if "const APP_VERSION = '0.9.116';" not in sw:
    fail("Live Service Worker version is not 0.9.116.")

protected = {name: sha(ROOT / name) for name in PROTECTED}

# Stage 1: when Supabase shared_terms rows are normalized, retain french_text.
start = app.find("function applySharedTerms(rows){")
end = app.find("function applySharedPronunciationVariants", start)
if start < 0 or end < 0:
    fail("Cannot locate shared-term ingestion function.")
ingest = app[start:end]
if ingest.count("french:'',") != 1:
    fail("Expected exactly one empty French field in shared-term ingestion.")
ingest = ingest.replace("french:'',", "french:String(t.french_text||'').trim(),", 1)
app = app[:start] + ingest + app[end:]

# Stage 2: rebuild() receives normalized sharedCustom rows, so use c.french and
# c.frenchReadingZh, not the raw Supabase column names which no longer exist here.
start = app.find("// Shared terms supplement the built-in and personal dictionaries.")
end = app.find("for(const v of sharedPronunciationVariants", start)
if start < 0 or end < 0:
    fail("Cannot locate shared-term dictionary rebuild block.")
rebuild = app[start:end]
rebuild = replace_once = rebuild.replace(
    "french:String(c.french_text||'').trim()",
    "french:String(c.french||'').trim()",
    1
)
if "french:String(c.french||'').trim()" not in rebuild:
    fail("French spelling is not preserved in the normalized shared dictionary merge.")
rebuild2 = rebuild.replace(
    "frenchReadingZh:String(c.french_pronunciation_cn||c.frenchReadingZh||'').trim()",
    "frenchReadingZh:String(c.frenchReadingZh||'').trim()",
    1
)
if rebuild2 == rebuild and "frenchReadingZh:String(c.frenchReadingZh||'').trim()" not in rebuild:
    fail("French homophone is not preserved in the normalized shared dictionary merge.")
app = app[:start] + rebuild2 + app[end:]

# Match the French result field to the existing Swahili result field exactly.
# Remove French-only colors, gradient, font weight and focus treatment.
old_result_rule = '#resultCard #resultFrenchReading{display:block;width:100%;min-height:88px;height:auto;max-height:42vh;resize:vertical;padding:10px 12px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5;text-align:left;font-family:inherit;font-weight:760;box-sizing:border-box;border-color:#dce6f6;background:linear-gradient(135deg,#fff8e8,#fff0d2);color:#79664c}'
new_result_rule = '#resultCard #resultFrenchReading{display:block!important;align-items:initial!important;width:100%!important;min-height:88px!important;height:auto!important;max-height:42vh!important;resize:vertical!important;padding:10px 12px!important;white-space:pre-wrap!important;overflow-wrap:anywhere!important;line-height:1.5!important;text-align:left!important;font-family:inherit!important;box-sizing:border-box!important}'
if html.count(old_result_rule) != 1:
    fail("French result style anchor mismatch; refusing to apply an uncertain CSS edit.")
html = html.replace(old_result_rule, new_result_rule, 1)
old_focus_rule = '#resultCard #resultFrenchReading:focus{outline:none;border-color:#c8a45b;box-shadow:0 0 0 3px rgba(200,164,91,.18)}'
new_focus_rule = '#resultCard #resultFrenchReading:focus{outline:2px solid rgba(184,141,46,.35)!important;outline-offset:2px!important}'
if html.count(old_focus_rule) != 1:
    fail("French result focus style anchor mismatch.")
html = html.replace(old_focus_rule, new_focus_rule, 1)
old_placeholder_rule = '#resultCard #resultFrenchReading.empty::placeholder{color:#a89a80;opacity:1}'
if html.count(old_placeholder_rule) != 1:
    fail("French result placeholder style anchor mismatch.")
html = html.replace(old_placeholder_rule, '', 1)
empty_rule = '#resultCard #resultFrenchReading.empty{display:block!important;font-size:15px!important;font-weight:500!important;color:#93a0b2!important}'
focus_end = new_focus_rule
if html.count(focus_end) != 1:
    fail("French result focus rule uniqueness check failed.")
html = html.replace(focus_end, focus_end + '\n' + empty_rule, 1)

# Bump HTML, app metadata and Service Worker cache as one consistent release.
html = html.replace(OLD_VERSION, NEW_VERSION)
if html.count("DWSS_AUTO_UPDATE_0_9_117") == 0:
    html = html.replace("DWSS_AUTO_UPDATE_0_9_116", "DWSS_AUTO_UPDATE_0_9_117", 1)
if "DWSS_AUTO_UPDATE_0_9_117" not in html:
    fail("New automatic-update marker could not be applied.")
app = app.replace("version:'0.9.116'", "version:'0.9.117'", 1)
sw = sw.replace("const APP_VERSION = '0.9.116';", "const APP_VERSION = '0.9.117';", 1)
version = version.replace("Version: 0.9.116", "Version: 0.9.117", 1)
version = version.rstrip() + (
    "\n\n0.9.117: Fixed French shared-term readback. The app now retains french_text "
    "when rows are normalized from Supabase and passes the normalized French spelling "
    "and French Chinese-homophone into the dictionary index. This ensures saved French "
    "corrections are visible to other users after cloud sync. All 0.9.116 French UI, "
    "offline lexicon, IPA data, translation, pronunciation lookup, cover and Android "
    "installer remain unchanged.\n"
)

paths["VERSION.txt"].write_text(version, encoding="utf-8", newline="\n")
paths["index.html"].write_text(html, encoding="utf-8", newline="\n")
paths["app.js"].write_text(app, encoding="utf-8", newline="\n")
paths["sw.js"].write_text(sw, encoding="utf-8", newline="\n")

for name, expected in protected.items():
    if sha(ROOT / name) != expected:
        fail("Protected asset changed unexpectedly: " + name)

print("PASS: DWSS 0.9.118 preserves french_text through Supabase normalization and dictionary rebuild; French pronunciation field remains intact; all offline French assets, cover and APK unchanged.")
