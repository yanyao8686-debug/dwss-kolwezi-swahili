#!/usr/bin/env python3
"""DWSS 0.9.127: tolerant French Chinese-homophone pronunciation search."""
from __future__ import annotations

import hashlib
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urljoin, urlparse
from urllib.request import Request, urlopen

BASE_URL = "https://yanyao8686-debug.github.io/dwss-kolwezi-swahili/"
BASE_PATH = "/dwss-kolwezi-swahili/"
OLD_VERSION = "0.9.126"
NEW_VERSION = "0.9.127"
ROOT = Path("public")

REQUIRED = [
    "VERSION.txt", "index.html", "app.js", "shared-lexicon.js", "pwa.js", "sw.js",
    "boot.js", "pronunciation-search.js", "dwss-pronunciation-controls.js",
    "manifest.webmanifest", "dictionary-overrides.js", "dictionary.js.gz",
    "supabase.min.js", "cover.webp", "DWSS-Android-Installer.apk",
    "french-extension.js", "french-translation-runtime.js",
    "french-gloss-index.tsv.gz", "french-pronunciation-index.json", "french-word-index.json",
    "french-lexicon-sources.txt", "french-LEXIK-LICENSE.txt",
    "french-FREEDICT-COPYING.txt", "french-IPA-LICENSE.txt", "french-ipa-index.tsv.gz",
]
PROTECTED = [
    "cover.webp", "DWSS-Android-Installer.apk", "dictionary.js.gz",
    "dictionary-overrides.js", "shared-lexicon.js", "pwa.js", "boot.js",
    "manifest.webmanifest", "pronunciation-search.js",
    "dwss-pronunciation-controls.js", "supabase.min.js",
]

def fail(message: str) -> None:
    raise SystemExit(message)

def fetch_bytes(url: str, limit: int = 120 * 1024 * 1024) -> bytes:
    last = None
    for attempt in range(5):
        try:
            req = Request(url, headers={"User-Agent": "DWSS-Release-Mirror/0.9.127"})
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
    if any(part in (".", "..") for part in Path(relative).parts):
        return None
    return relative, absolute

class AssetParser(HTMLParser):
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

# Mirror every file directly referenced by the HTML, CSS, manifest or Service Worker.
ROOT.mkdir(parents=True, exist_ok=True)
queue = [(name, urljoin(BASE_URL, name)) for name in REQUIRED]
seen = set()
while queue:
    name, url = queue.pop(0)
    if name in seen:
        continue
    seen.add(name)
    data = fetch_bytes(url + ("&" if "?" in url else "?") + "dwss_mirror=0_9_123")
    write_asset(name, data)
    refs = []
    if name.endswith((".html", ".htm")):
        parser = AssetParser()
        parser.feed(data.decode("utf-8"))
        refs = parser.refs
    elif name.endswith(".css"):
        refs = css_references(data.decode("utf-8", errors="replace"))
    elif name.endswith((".webmanifest", ".json")):
        try:
            obj = json.loads(data.decode("utf-8"))
            refs = [item.get("src", "") for item in obj.get("icons", []) if item.get("src")]
        except Exception:
            pass
    elif name == "sw.js":
        source = data.decode("utf-8")
        match = re.search(r"const\s+PRECACHE_URLS\s*=\s*\[(.*?)\];", source, re.S)
        if not match:
            fail("Service Worker PRECACHE_URLS is missing.")
        refs = re.findall(r"""['"]([^'"]+)['"]""", match.group(1))
    for ref in refs:
        parsed = local_reference(ref, url)
        if parsed and parsed[0] not in seen:
            queue.append(parsed)

for name in REQUIRED:
    path = ROOT / name
    if not path.is_file() or path.stat().st_size == 0:
        fail("Required live asset is missing: " + name)

# Copy the on-demand pronunciation files too; they are intentionally not all in the
# Service Worker precache, but both French lookup and translated-sentence reading need them.
pron_meta = json.loads((ROOT / "french-pronunciation-index.json").read_text(encoding="utf-8"))
word_meta = json.loads((ROOT / "french-word-index.json").read_text(encoding="utf-8"))
pron_keys = pron_meta.get("firstKeys", [])
word_keys = word_meta.get("prefixes", [])
if len(pron_keys) < 100 or len(word_keys) < 100:
    fail("French on-demand shard metadata is incomplete.")
shard_downloads = []
for folder, keys in (("french-pronunciation-shards", pron_keys), ("french-word-shards", word_keys)):
    for key in keys:
        name = f"{folder}/{key}.tsv.gz"
        target = ROOT / name
        if target.is_file() and target.stat().st_size >= 20:
            continue
        url = urljoin(BASE_URL, name) + "?dwss_mirror=0_9_123"
        shard_downloads.append((name, url))

def download_shard(item):
    name, url = item
    return name, fetch_bytes(url, limit=20 * 1024 * 1024)

# Bounded concurrency speeds up the many small immutable shard downloads without
# overwhelming GitHub Pages or retaining the complete dataset in memory.
with ThreadPoolExecutor(max_workers=12) as executor:
    futures = [executor.submit(download_shard, item) for item in shard_downloads]
    for future in as_completed(futures):
        name, data = future.result()
        write_asset(name, data)

for folder, keys in (("french-pronunciation-shards", pron_keys), ("french-word-shards", word_keys)):
    for key in keys:
        name = f"{folder}/{key}.tsv.gz"
        target = ROOT / name
        if not target.is_file() or target.stat().st_size < 20:
            fail("French on-demand shard is missing or empty: " + name)

paths = {name: ROOT / name for name in ("VERSION.txt", "index.html", "app.js", "sw.js")}
version = paths["VERSION.txt"].read_text(encoding="utf-8")
html = paths["index.html"].read_text(encoding="utf-8")
app = paths["app.js"].read_text(encoding="utf-8")
sw = paths["sw.js"].read_text(encoding="utf-8")

# In French mode, stop the Swahili renderer from overwriting the French result
# and French single-word gloss after each input event. Preserve local history on blur.
render_guard = "const frenchModeButton=document.getElementById('dwssMainFrMode');if(frenchModeButton&&frenchModeButton.classList.contains('active')){if(options.recordHistory===true){const currentDraft=document.getElementById('inputText');if(currentDraft)saveRecent(currentDraft.value);}return;}"
render_anchor = "function renderTranslation(options={}){"
if render_guard not in app:
    if app.count(render_anchor) != 1:
        fail("Cannot locate the single main translation renderer for the French-mode guard.")
    app = app.replace(render_anchor, render_anchor + "\n " + render_guard, 1)

# Expose a safe, no-history re-render hook so switching back to Swahili uses
# the existing Chinese draft instead of requiring the user to type it again.
render_hook = "window.DWSSRenderTranslation = () => renderTranslation({recordHistory:false});"
if render_hook not in app:
    anchor = "window.KolweziSwahili={"
    if app.count(anchor) != 1:
        fail("Cannot locate the single public dictionary API for the language-switch render hook.")
    app = app.replace(anchor, render_hook + chr(10) + anchor, 1)

# The French shared-correction submit panel was removed in 0.9.125. Accept
# either an older baseline (remove it once) or the current baseline (already absent).
html, removed_panels = re.subn(
    r'\s*<div id="dwssFrenchCorrectionPanel"[^>]*>[\s\S]*?</div>',
    '',
    html,
    count=1
)
if removed_panels not in (0, 1):
    fail("Unexpected number of French shared-correction panels: " + str(removed_panels))
if 'id="dwssSaveFrenchCorrection"' in html or '提交法语修正并同步所有用户' in html:
    fail("French shared-correction submit control remains in the interface.")

# Give the single-word explanation title a stable ID. The mobile layout script
# moves this label into .dwss-secondary-details, so JS can switch it by language.
old_gloss_title = '<div class="resultlabel" style="margin-top:14px">单个斯语读法释义：</div>'
new_gloss_title = '<div id="singleReadingGlossLabel" class="resultlabel" style="margin-top:14px">单个斯语读法释义：</div>'
if 'id="singleReadingGlossLabel"' not in html:
    if html.count(old_gloss_title) != 1:
        fail("Expected one static Swahili single-word gloss title to make language-aware.")
    html = html.replace(old_gloss_title, new_gloss_title, 1)

if f"Version: {OLD_VERSION}" not in version and f"Version: {NEW_VERSION}" not in version:
    fail("Live site is not the supported 0.9.125/0.9.127 baseline: " + repr(version[:120]))
if f"version:'{OLD_VERSION}'" not in app and f"version:'{NEW_VERSION}'" not in app:
    fail("Live app.js version is not 0.9.125 or 0.9.127.")
if f"const APP_VERSION = '{OLD_VERSION}';" not in sw and f"const APP_VERSION = '{NEW_VERSION}';" not in sw:
    fail("Live Service Worker version is not 0.9.125 or 0.9.127.")


protected = {name: sha(ROOT / name) for name in PROTECTED}

# Use the compact translation UI runtime maintained in this repository.
runtime_source = Path(__file__).with_name("french-translation-runtime.js")
if not runtime_source.is_file() or runtime_source.stat().st_size < 10000:
    fail("Updated French translation runtime source is missing or unexpectedly small.")
write_asset("french-translation-runtime.js", runtime_source.read_bytes())
runtime = (ROOT / "french-translation-runtime.js").read_text(encoding="utf-8")
extension_source = Path(__file__).with_name("french-extension-0127.js")
if not extension_source.is_file() or extension_source.stat().st_size < 20000:
    fail("Merged French extension source is missing or unexpectedly small.")
write_asset("french-extension.js", extension_source.read_bytes())
extension = (ROOT / "french-extension.js").read_text(encoding="utf-8")
for required in ("if (machineRuntime && typeof machineRuntime.translateCurrentChinese === \"function\") return;",
                 "formatCombinedFrenchResult(result.words, result.reading)",
                 "DWSSFrenchCombinedResult.parse", "dwssFrenchSpellingBlock",
                 "renderFrenchSingleGloss", "单个法语读法释义：",
                 "glossSegments", "window.DWSSRenderTranslation",
                 "machine.scheduleTranslation(80)",
                 "searchFrenchCandidates", "FRENCH_NEAR_INITIAL_GROUPS",
                 "nearFirstKeys", "输入听到却不懂意思的法语中文谐音时，即便是同音不同字的中文，系统也会自动查询近似的读音来匹配对应发音的法语"):
    if required not in extension:
        fail("Merged French extension is missing: " + required)

if 'const results = searchFrenchCandidates(query, candidates, engine, 20);' not in extension:
    fail("French pronunciation query is still using the overly strict generic matcher.")
for required in ('action: "translate"', 'action: "check"',
                 'await autoCheckFrenchGrammar(french, requestId)',
                 'autoCheckFrenchGrammar',
                 '翻译时自动检查法语语法，译文会发送至外部服务。',
                 'window.DWSSFrenchCombinedResult', 'formatCombinedResult',
                 'parseCombinedResult', 'mirrorSwahiliResultStyle',
                 'output.readOnly = false;', 'output.disabled = false;'):
    if required not in runtime:
        fail("Compact French runtime is missing a required feature or notice: " + required)
for removed in ('runGrammarCheck', 'grammarButton', 'dwssSaveFrenchCorrection',
                'combinedOutput.addEventListener("blur"'):
    if removed in runtime:
        fail("Manual grammar/correction submission UI or implicit sync remains in runtime: " + removed)
for removed in ("法语整句来源：", "逐词 IPA：", "发音来源：LeXiK", "查看校对建议",
                "使用免密公共翻译节点和第三方法语校对"):
    if removed in runtime:
        fail("Verbose French translation UI text remains: " + removed)

# The legacy 0.9.118/0.9.120 styles force display:block!important on the French result
# textarea and pronunciation instruction. That defeats the HTML hidden attribute.
# Override only those two hidden states; the selected language still uses the existing
# display styles and the original fields, text, events and data remain untouched.
style = """<style id="dwss-ui-hidden-state-fix-0121">
/* Respect mutually exclusive language panels even when legacy styles use display:block!important. */
#resultCard #resultFrenchReading[hidden],
#resultCard #resultFrenchReading.empty[hidden]{
  display:none!important;
}
#pronunciation .pronunciation-lookup-card .pronunciation-lookup-instruction[hidden]{
  display:none!important;
}
#pronunciation #dwssFrenchQueryPanel[hidden]{
  display:none!important;
}
</style>"""
style_id = 'id="dwss-ui-hidden-state-fix-0121"'
if html.count(style_id) > 1:
    fail("Duplicate 0.9.121 hidden-state style blocks found.")
if style_id in html:
    html, count = re.subn(
        r'<style id="dwss-ui-hidden-state-fix-0121">[\s\S]*?</style>',
        lambda _: style, html, count=1
    )
    if count != 1:
        fail("Could not replace the existing hidden-state style block.")
else:
    if "</head>" not in html:
        fail("Cannot find </head> for the hidden-state CSS fix.")
    html = html.replace("</head>", style + "\n</head>", 1)

# Bump the website, application and Service Worker together. A workflow rerun after
# a deployment is idempotent: it keeps 0.9.127 rather than attempting another bump.
if f"Version: {OLD_VERSION}" in version:
    version = version.replace(f"Version: {OLD_VERSION}", f"Version: {NEW_VERSION}", 1)
    version = re.sub(r"^Release date: .*$", "Release date: 2026-11-09", version, count=1, flags=re.M)
    version = version.rstrip() + (
        "\n\n0.9.127: French pronunciation lookup now searches exact homophones written with different Chinese characters and close phonetic variants, ranks the closest readings first, and uses the requested concise instruction. Vocabulary indexes, the existing Swahili lookup, cover and Android installer are preserved.\n"
    )
if f"version:'{OLD_VERSION}'" in app:
    app = app.replace(f"version:'{OLD_VERSION}'", f"version:'{NEW_VERSION}'", 1)
if f"const APP_VERSION = '{OLD_VERSION}';" in sw:
    sw = sw.replace(
        f"const APP_VERSION = '{OLD_VERSION}';",
        f"const APP_VERSION = '{NEW_VERSION}';", 1
    )
html = html.replace(OLD_VERSION, NEW_VERSION)
old_marker = "DWSS_AUTO_UPDATE_0_9_125"
new_marker = "DWSS_AUTO_UPDATE_0_9_127"
if new_marker not in html:
    if html.count(old_marker) != 1:
        fail("Expected one 0.9.126 auto-update marker; found " + str(html.count(old_marker)))
    html = html.replace(old_marker, new_marker, 1)

# Release-level structural checks; fail closed rather than publishing an uncertain patch.
if html.count(style_id) != 1:
    fail("0.9.121 hidden-state CSS block is missing or duplicated.")
compact_style = """<style id="dwss-french-compact-ui-0122">
#resultCard #dwssFrenchIpaMeta{display:none!important}
.dwss-fr-machine-tools{gap:6px!important;margin:6px 0 2px!important}
.dwss-fr-machine-tools small{font-size:10px!important;line-height:1.35!important;opacity:.68!important}
.dwss-fr-machine-tools .dwss-french-grammar-status[hidden]{display:none!important}
</style>"""
compact_style_id = 'id="dwss-french-compact-ui-0122"'
if html.count(compact_style_id) > 1:
    fail("Duplicate compact French UI style blocks found.")
if compact_style_id not in html:
    if "</head>" not in html:
        fail("Cannot find </head> for compact French UI styles.")
    html = html.replace("</head>", compact_style + "\n</head>", 1)

merged_style = """<style id="dwss-french-single-result-0123">
#resultCard #dwssFrenchSpellingBlock{display:none!important}
</style>"""
merged_style_id = 'id="dwss-french-single-result-0123"'
if html.count(merged_style_id) > 1:
    fail("Duplicate single-result French UI styles found.")
if merged_style_id not in html:
    if "</head>" not in html:
        fail("Cannot find </head> for single-result French UI styles.")
    html = html.replace("</head>", merged_style + "\n</head>", 1)

ux_style = """<style id="dwss-french-ux-0125">
/* Exact visual treatment of the native Swahili result textarea (0.9.123). */
#resultCard #resultFrenchReading{
  width:100%!important;
  box-sizing:border-box!important;
  min-height:112px!important;
  padding:13px 14px!important;
  border:1px solid #E4D1A5!important;
  border-radius:16px!important;
  background:#FFF0D2!important;
  color:#183B60!important;
  font-family:"Noto Sans SC","PingFang SC","Microsoft YaHei",system-ui,sans-serif!important;
  font-size:clamp(24px,4.8vw,28px)!important;
  font-weight:650!important;
  line-height:1.55!important;
  letter-spacing:0!important;
  box-shadow:inset 0 1px 2px rgba(86,62,21,.035)!important;
  height:auto!important;
  max-height:42vh!important;
  resize:vertical!important;
  white-space:pre-wrap!important;
  overflow-wrap:anywhere!important;
  text-align:left!important;
  display:block!important;
  cursor:text!important;
}
#resultCard #resultFrenchReading.empty{
  font-size:15px!important;
  font-weight:500!important;
  color:#93a0b2!important;
}
#resultCard #resultFrenchReading:focus-visible{
  outline:2px solid rgba(28,86,136,.35)!important;
  outline-offset:3px!important;
}
@media(max-width:520px){
  #resultCard #resultFrenchReading{min-height:108px!important;font-size:24px!important}
}
/* Do not mix Swahili-only match details into the French translation view. */
#resultCard[data-dwss-lang="fr"] > .stats,
#resultCard[data-dwss-lang="fr"] > .quality-note,
#resultCard[data-dwss-lang="fr"] > .resultlabel,
#resultCard[data-dwss-lang="fr"] > .segmentlist,
#resultCard[data-dwss-lang="fr"] > #translationActionNotice,
#resultCard[data-dwss-lang="fr"] #dwssFrenchCorrectionPanel,
#resultCard[data-dwss-lang="fr"] .dwss-french-correction-panel,
#resultCard[data-dwss-lang="fr"] .dwss-fr-machine-tools{display:none!important}
#resultCard #dwssFrenchCorrectionPanel{display:none!important}
#dwssFrenchAutomaticGrammarNotice{display:block!important;margin:5px 2px 0!important;font-size:10px!important;line-height:1.4!important;color:#8995a5!important}
</style>"""
ux_style_id = 'id="dwss-french-ux-0125"'
if html.count(ux_style_id) > 1:
    fail("Duplicate 0.9.127 French output styles found.")
if ux_style_id not in html:
    if "</head>" not in html:
        fail("Cannot find </head> for the French result style fix.")
    html = html.replace("</head>", ux_style + "\n</head>", 1)

# The responsive layout moves the glossary title and list into this wrapper.
# Keep the same one-word area visible in both modes; its title and contents switch.
dual_mode_style = """<style id="dwss-dual-language-gloss-0126">
#resultCard .dwss-secondary-details{display:block!important}
#resultCard .dwss-secondary-details .dwss-secondary-title{display:block!important}
#resultCard #segmentList{display:flex!important}
#resultCard[data-dwss-lang="fr"] .dwss-secondary-details .seg .rd-detail{
  display:block!important;margin-top:2px;font-size:11px;line-height:1.4;color:#65758a
}
#resultCard[data-dwss-lang="fr"] .dwss-secondary-details .seg .rd strong{color:#294967;font-weight:800}
</style>"""
dual_mode_style_id = 'id="dwss-dual-language-gloss-0126"'
if html.count(dual_mode_style_id) > 1:
    fail("Duplicate dual-language gloss style blocks found.")
if dual_mode_style_id not in html:
    if "</head>" not in html:
        fail("Cannot find </head> for dual-language gloss styles.")
    html = html.replace("</head>", dual_mode_style + "\n</head>", 1)
for selector in (
    "#resultCard #resultFrenchReading[hidden]",
    "#resultCard #resultFrenchReading.empty[hidden]",
    "#pronunciation .pronunciation-lookup-card .pronunciation-lookup-instruction[hidden]",
    "#pronunciation #dwssFrenchQueryPanel[hidden]",
):
    if selector not in html:
        fail("Hidden-state CSS selector is missing: " + selector)
if html.count('id="resultReading"') != 1 or html.count('id="resultFrenchReading"') != 1:
    fail("Swahili/French result textarea IDs are missing or duplicated.")
if html.count('id="dwssFrenchQueryPanel"') != 1:
    fail("French pronunciation-query panel is missing or duplicated.")
if html.count('id="pronunciationSearch"') != 1 or html.count('id="pronunciationFrenchSearch"') != 1:
    fail("Swahili/French pronunciation inputs are missing or duplicated.")
if "DWSS_AUTO_UPDATE_0_9_127" not in html:
    fail("Automatic-update marker was not advanced to 0.9.127.")
if 'id="singleReadingGlossLabel"' not in html:
    fail("Language-aware single-word gloss title is missing.")
if 'id="dwss-dual-language-gloss-0126"' not in html:
    fail("Dual-language gloss wrapper visibility styles are missing.")
if render_hook not in app:
    fail("Swahili result refresh hook was not injected into app.js.")
if render_guard not in app:
    fail("Swahili renderer can still overwrite the French-language gloss.")

if ux_style_id not in html:
    fail("French result style and French-mode-only detail hiding rules are missing.")
for selector in (
    '#resultCard[data-dwss-lang="fr"] > .resultlabel',
    '#resultCard[data-dwss-lang="fr"] > .segmentlist',
    '#resultCard[data-dwss-lang="fr"] > .stats',
    '#resultCard[data-dwss-lang="fr"] > .quality-note',
    '#resultCard[data-dwss-lang="fr"] #dwssFrenchCorrectionPanel',
    '#resultCard #resultFrenchReading:focus-visible'
):
    if selector not in html:
        fail("French UI selector missing: " + selector)
if "dwss-release=0.9.127" not in html:
    fail("HTML asset cache-busting URLs were not advanced to 0.9.127.")
if "Version: 0.9.127" not in version or "version:'0.9.127'" not in app:
    fail("Website and app version markers do not agree at 0.9.127.")
if "const APP_VERSION = '0.9.127';" not in sw:
    fail("Service Worker cache version is not 0.9.127.")

paths["VERSION.txt"].write_text(version, encoding="utf-8", newline="\n")
paths["index.html"].write_text(html, encoding="utf-8", newline="\n")
paths["app.js"].write_text(app, encoding="utf-8", newline="\n")
paths["sw.js"].write_text(sw, encoding="utf-8", newline="\n")

for name, expected in protected.items():
    if sha(ROOT / name) != expected:
        fail("Protected asset changed unexpectedly: " + name)

(ROOT / ".nojekyll").write_text("", encoding="utf-8")
print(f"PASS: preserved all French data assets and copied {len(pron_keys)} pronunciation shards plus {len(word_keys)} spelling shards.")
print("PASS: DWSS 0.9.127 combined French original and Chinese approximate pronunciation in one Swahili-styled result box; separate source input hidden.")
print("PASS: all protected translation/query assets, vocabulary indexes, shared sync, cover and Android APK remain unchanged.")
