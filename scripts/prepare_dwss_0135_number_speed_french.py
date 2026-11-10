#!/usr/bin/env python3
"""DWSS 0.9.142: editable French word-by-word gloss with isolated language data."""
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
OLD_VERSION = "0.9.141"
NEW_VERSION = "0.9.142"
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
    "dictionary-overrides.js", "pwa.js", "boot.js",
    "manifest.webmanifest", "pronunciation-search.js",
    "dwss-pronunciation-controls.js", "supabase.min.js",
]

def fail(message: str) -> None:
    raise SystemExit(message)

def fetch_bytes(url: str, limit: int = 120 * 1024 * 1024) -> bytes:
    last = None
    for attempt in range(5):
        try:
            req = Request(url, headers={"User-Agent": "DWSS-Release-Mirror/0.9.142"})
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

def ensure_precache_asset(source: str, asset_name: str) -> str:
    match = re.search(r"(const\s+PRECACHE_URLS\s*=\s*\[)([\s\S]*?)(\];)", source)
    if not match:
        fail("Service Worker PRECACHE_URLS is missing while adding French offline dictionary files.")
    asset_url = urljoin(BASE_URL, asset_name)
    body = match.group(2)
    if asset_url not in body and asset_name not in body:
        source = source[:match.start(2)] + body + f'\n  "{asset_url}",' + source[match.end(2):]
    return source

for offline_asset in ("french-gloss-index.tsv.gz", "french-pronunciation-index.json", "french-word-index.json"):
    sw = ensure_precache_asset(sw, offline_asset)


# In French mode, stop the Swahili renderer from overwriting the French result
# and French single-word gloss after each input event. Preserve local history on blur.
render_guard = "const frenchModeButton=document.getElementById('dwssMainFrMode');if(frenchModeButton&&frenchModeButton.classList.contains('active')){if(options.recordHistory===true){const currentDraft=document.getElementById('inputText');if(currentDraft)saveRecent(currentDraft.value);}return;}"
render_anchor = "function renderTranslation(options={}){"
if render_guard not in app:
    if app.count(render_anchor) != 1:
        fail("Cannot locate the single main translation renderer for the French-mode guard.")
    app = app.replace(render_anchor, render_anchor + "\n " + render_guard, 1)

# Keep the Swahili tokenizer strictly Swahili-only. French pronunciation lookup
# remains available in its own French mode, but is not an acceptable Swahili fallback.
def replace_app_fragment(source, old, new, label):
    old_count = source.count(old)
    new_count = source.count(new)
    if old_count == 1:
        return source.replace(old, new, 1)
    if old_count == 0 and new_count == 1:
        return source
    fail("Could not apply Swahili/French separation patch: " + label)

def remove_french_fallback(source):
    pattern = r"  if\(frenchMatch\)\{[\s\S]*?\n  \}\n"
    updated, count = re.subn(pattern, "", source, count=1)
    if count == 1:
        return updated
    if "if(frenchMatch){" not in source:
        return source
    fail("Could not remove the French fallback segment from the Swahili tokenizer.")

app = replace_app_fragment(
    app,
    """  const localMatch=lookupLocalAt(input,i);
  const frenchMatch=lookupFrenchPronunciationAt(input,i);
  const reviewMatch=lookupSourceReviewAt(input,i);
  const bestVerifiedLength=Math.max(localMatch?localMatch.length:0,frenchMatch?frenchMatch.length:0);""",
    """  const localMatch=lookupLocalAt(input,i);
  const reviewMatch=lookupSourceReviewAt(input,i);
  const bestVerifiedLength=localMatch?localMatch.length:0;""",
    "remove French candidate from Swahili tokenizer"
)
app = replace_app_fragment(
    app,
    """  // A real local Swahili phrase always wins when it is an equal or longer match.
  // A longer French-only entry may replace a short incidental local prefix.""",
    """  // The Swahili translator only matches verified local Swahili entries.
  // French readings are reserved for the separate French translation mode.""",
    "update language-selection comment"
)
app = replace_app_fragment(
    app,
    "  const useLocal=!!localMatch&&(!frenchMatch||localMatch.length>=frenchMatch.length);",
    "  const useLocal=!!localMatch;",
    "select local Swahili matches only"
)
app = remove_french_fallback(app)
app = replace_app_fragment(
    app,
    "  while(j<input.length&&!isPunct(input[j])&&!lookupLocalAt(input,j)&&!lookupFrenchPronunciationAt(input,j))j++;",
    "  while(j<input.length&&!isPunct(input[j])&&!lookupLocalAt(input,j))j++;",
    "unknown-span scan must not split on French words"
)
app = replace_app_fragment(
    app,
    "r.unknownChars?'仍有未收录部分':r.reviewHits?'有原始资料待核对，暂不输出可疑读音':r.frenchHits?'已用法语替代缺失的当地词条':'当地斯语词条已匹配'",
    "r.unknownChars?'仍有未收录部分':r.reviewHits?'有原始资料待核对，暂不输出可疑读音':'当地斯语词条已匹配'",
    "remove French fallback status"
)
app = replace_app_fragment(
    app,
    "`斯语 ${r.localHits} 处 · 法语替代 ${r.frenchHits} 处 · 待核对 ${r.reviewHits} 处 · 未收录 ${r.unknownChars} 字`",
    "`斯语 ${r.localHits} 处 · 待核对 ${r.reviewHits} 处 · 未收录 ${r.unknownChars} 字`",
    "remove French fallback counter"
)

old_accuracy_note = "翻译时优先使用科卢韦齐当地斯语词条。当地斯语没有对应词条时，才使用“添加新词”中手动填写的法语中文谐音作为替代，并在匹配明细中标出“法语替代”。系统不会自动猜测或生成读音。重要安保指令请当地人员复核。"
new_accuracy_note = "斯语翻译只使用科卢韦齐当地斯语词条和对应中文谐音。法语词条及法语中文谐音只在法语翻译选项中使用，两种语言分别保存、互不替代。系统不会自动猜测当地读音。重要安保指令请当地人员复核。"
if old_accuracy_note in html:
    html = html.replace(old_accuracy_note, new_accuracy_note, 1)
elif new_accuracy_note not in html:
    fail("Cannot locate the Swahili/French separation accuracy note.")

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
    fail("Live site is not the supported 0.9.141/0.9.142 baseline: " + repr(version[:120]))
if f"version:'{OLD_VERSION}'" not in app and f"version:'{NEW_VERSION}'" not in app:
    fail("Live app.js version is not 0.9.141 or 0.9.142.")
if f"const APP_VERSION = '{OLD_VERSION}';" not in sw and f"const APP_VERSION = '{NEW_VERSION}';" not in sw:
    fail("Live Service Worker version is not 0.9.141 or 0.9.142.")


protected = {name: sha(ROOT / name) for name in PROTECTED}

# Package the French-aware shared queue from repository source rather than the older mirrored site copy.
shared_lexicon_source = Path("shared-lexicon.js")
if not shared_lexicon_source.is_file() or shared_lexicon_source.stat().st_size < 10000:
    fail("Updated shared lexicon source is missing or unexpectedly small.")
write_asset("shared-lexicon.js", shared_lexicon_source.read_bytes())
shared_lexicon = (ROOT / "shared-lexicon.js").read_text(encoding="utf-8")
for required in ("async function submitFrenchPronunciationCorrection(entry)",
                 "french_pronunciation_cn: reading",
                 "queue.unshift(payload)",
                 "submitFrenchPronunciationCorrection,"):
    if required not in shared_lexicon:
        fail("Shared lexicon is missing offline French correction sync: " + required)

# Use the compact translation UI runtime maintained in this repository.
runtime_source = Path(__file__).with_name("french-translation-runtime.js")
if not runtime_source.is_file() or runtime_source.stat().st_size < 10000:
    fail("Updated French translation runtime source is missing or unexpectedly small.")
write_asset("french-translation-runtime.js", runtime_source.read_bytes())
runtime = (ROOT / "french-translation-runtime.js").read_text(encoding="utf-8")
extension_source = Path(__file__).with_name("french-extension-0135.js")
if not extension_source.is_file() or extension_source.stat().st_size < 20000:
    fail("Merged French extension source is missing or unexpectedly small.")
write_asset("french-extension.js", extension_source.read_bytes())
extension = (ROOT / "french-extension.js").read_text(encoding="utf-8")
for required in ("if (machineRuntime && typeof machineRuntime.translateCurrentChinese === \"function\") return;",
                 "formatCombinedFrenchResult(result.words, result.reading)",
                 "dwssFrenchSpellingBlock",
                 "renderFrenchSingleGloss", "单个法语读法释义：",
                 "glossSegments", "window.DWSSRenderTranslation", "function parseNumberAt(text, start)", "function frenchIntegerToWords(n)", "function expandFrenchNumerals(value)", "numberToFrench", "isNumericExpression",
                 "machine.scheduleTranslation(50)",
                 "searchFrenchCandidates", "FRENCH_NEAR_INITIAL_GROUPS",
                 "nearFirstKeys", "rowsForShards",
                 "function renderFrenchSingleGloss(raw, frenchOriginal, enrichedWordReadings)",
                 "tokenizeFrenchPhrase", "buildFrenchWordReadingLookup", "buildFrenchWordPairs",
                 'const GLOSS_URL = "./french-gloss-index.tsv.gz";',
                 'const META_URL = "./french-pronunciation-index.json";',
                 "buildFrenchGlossLookup(sourceRows)", "findFrenchGloss(result.zh)",
                 "rowsForShards", "loadPronunciationShard",
                 "该法语词形暂未收录中文释义（法中词典没有对应词条）",
                 'pronunciation-hit-meaning',
                 "function getWordChineseReading(record)", "translateOfflineChinese(raw)", "getPhraseWordPairs(phrase)", "refreshActiveMeaningIndex()", "activeRowsSignature", 'const all = (shared.getTerms() || []).filter(item => item && item.source_language === "fr")', 'item.french_pronunciation_cn || item.frenchReadingZh', "api.frenchReading(word)", "enrichedWordReadings", "function setupFrenchPronunciationEditor()", "submitFrenchPronunciationCorrection", "保存并同步所有用户",
                 'const readingFromResult = String(output.value || "").trim()', 'output.insertAdjacentElement("afterend", wrap);', 'output.readOnly = false;',
                 "dwss-french-word-pair", "dwss-french-word-original", "dwss-french-word-pronunciation", "replaceFrenchPhraseWords", "中文谐音：",
                 "谐音待补",
                 "const phrase = original || result.words",
                 "输入听到却不懂意思的法语中文谐音时，即便是同音不同字的中文，系统也会自动查询近似的读音来匹配对应发音的法语"):
    if required not in extension:
        fail("Merged French extension is missing: " + required)

for forbidden in ('id="dwssFrenchPronunciationEdit"', 'id="dwssFrenchPronunciationValue"', 'id="dwssFrenchPronunciationPanel"', 'id="dwssFrenchPronunciationCancel"'):
    if forbidden in extension:
        fail("French editor must not create a second edit control or text field: " + forbidden)

if 'const results = searchFrenchCandidates(query, candidates, engine, 20);' not in extension:
    fail("French pronunciation query is still using the overly strict generic matcher.")
if 'host.innerHTML = pairs.map((pair, index) =>' not in extension or 'class="seg dwss-french-word-pair"' not in extension:
    fail("French original sentence is not rendered as editable Swahili-style word-by-word segment rows.")
if 'findFrenchGloss(result.zh)' not in extension:
    fail("French pronunciation result does not use the dedicated Chinese-gloss lookup.")
if "function getWordChineseReading(record)" not in extension or "buildFrenchWordPairs" not in extension:
    fail("A Chinese approximate pronunciation is missing from individual French word pairs.")
if "function tokenizeFrenchPhrase(value)" not in extension or "buildFrenchWordReadingLookup" not in extension:
    fail("French sentence is not being split and matched by individual word.")
if "originalMarkup" in extension or "dwss-french-original-in-gloss" in extension:
    fail("The verbose full-sentence block remains in the French word renderer.")
if 'const candidates = rowsForShards(shardLines, 24000);' not in extension:
    fail("French pronunciation query does not use on-demand LeXiK pronunciation shards.")
if 'firstRanges' in extension or 'const DATA_URL =' in extension:
    fail("Legacy monolithic French pronunciation loader remains enabled.")
for required in ('action: "translate"', 'action: "check"',
                 'localPreviewCompleteChinese',
                 'await localTools.prepareOfflineChinese(chinese)',
                 '法语优先使用本机词库；未收录内容联网后调用机器翻译服务。',
                 'window.DWSSFrenchCombinedResult', 'formatCombinedResult',
                 'parseCombinedResult', 'mirrorSwahiliResultStyle',
                 'function formatCombinedResult(_french, reading)',
                 'return String(reading || "").trim();',
                 'glossTools.renderSingleGloss(lastChinese, french)', 'enrichedGlossTools.renderSingleGloss(lastChinese, french, enriched.wordReadings)', 'numberTools.expandFrenchNumerals(rawFrench)', 'numeralTools.isNumericExpression(chinese)', 'const immediate = tools.translateOfflineChinese(chinese)',
                 'output.placeholder = "输入中文后翻译结果中文谐音会显示在这里";',
                 'function showInstantLocalDraft(chinese)', 'PERSISTED_CACHE_KEY',
                 'restorePersistentTranslations()', 'persistTranslations()',
                 'buildLocalPhraseReading(french)', 'delay == null ? 60 : delay',
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
# a deployment is idempotent: it keeps 0.9.137 rather than attempting another bump.
if f"Version: {OLD_VERSION}" in version:
    version = version.replace(f"Version: {OLD_VERSION}", f"Version: {NEW_VERSION}", 1)
    version = re.sub(r"^Release date: .*$", "Release date: 2026-11-10", version, count=1, flags=re.M)
    version = version.rstrip() + (
        "\n\n0.9.142: Swahili and French save-and-sync panels are borderless and compact; explanatory copy is removed and the save buttons move up without changing sync behavior.\n"
    )
if f"version:'{OLD_VERSION}'" in app:
    app = app.replace(f"version:'{OLD_VERSION}'", f"version:'{NEW_VERSION}'", 1)
if f"const APP_VERSION = '{OLD_VERSION}';" in sw:
    sw = sw.replace(
        f"const APP_VERSION = '{OLD_VERSION}';",
        f"const APP_VERSION = '{NEW_VERSION}';", 1
    )
html = html.replace(OLD_VERSION, NEW_VERSION)
old_marker = "DWSS_AUTO_UPDATE_0_9_141"
new_marker = "DWSS_AUTO_UPDATE_0_9_142"
if new_marker not in html:
    if html.count(old_marker) != 1:
        fail("Expected one 0.9.141 auto-update marker; found " + str(html.count(old_marker)))
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
    fail("Duplicate 0.9.131 French output styles found.")
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

french_original_style = """<style id="dwss-french-original-in-gloss-0128">
#resultCard .dwss-french-original-in-gloss{
  display:block!important;margin:0 0 12px!important;padding:10px 12px!important;
  border:1px solid #E4D8BD!important;border-radius:12px!important;background:#FFF9EE!important;
}
#resultCard .dwss-french-original-label{
  margin:0 0 4px!important;font-size:12px!important;font-weight:750!important;color:#9A6A24!important;
}
#resultCard .dwss-french-original-text{
  font-size:16px!important;line-height:1.6!important;font-weight:650!important;
  color:#294967!important;overflow-wrap:anywhere!important;white-space:pre-wrap!important;
}
</style>"""
french_original_style_id = 'id="dwss-french-original-in-gloss-0128"'
if html.count(french_original_style_id) > 1:
    fail("Duplicate French original-in-gloss style blocks found.")
if french_original_style_id not in html:
    if "</head>" not in html:
        fail("Cannot find </head> for French original-in-gloss styles.")
    html = html.replace("</head>", french_original_style + "\n</head>", 1)

french_gloss_visible_style = """<style id="dwss-french-gloss-visible-0129">
#pronunciationFrenchResults .pronunciation-hit-meta{
  display:block!important;visibility:visible!important;opacity:1!important;
}
#pronunciationFrenchResults .pronunciation-hit-meaning{
  margin-top:7px!important;padding:7px 9px!important;border-radius:8px!important;
  border-left:3px solid #D7A54A!important;background:#F7F9FC!important;
  color:#34465E!important;font-size:13px!important;font-weight:650!important;
  line-height:1.55!important;overflow-wrap:anywhere!important;
}
#pronunciationFrenchResults .pronunciation-hit-meaning strong{
  color:#183B60!important;font-weight:850!important;
}
</style>"""
french_gloss_visible_style_id = 'id="dwss-french-gloss-visible-0129"'
if html.count(french_gloss_visible_style_id) > 1:
    fail("Duplicate French gloss visibility styles found.")
if french_gloss_visible_style_id not in html:
    if "</head>" not in html:
        fail("Cannot find </head> for French Chinese-meaning styles.")
    html = html.replace("</head>", french_gloss_visible_style + "\n</head>", 1)

french_word_reading_style = """<style id="dwss-french-word-reading-0130">
#resultCard .dwss-secondary-details .dwss-french-word-gloss .dwss-french-word-reading{
  display:block!important;visibility:visible!important;opacity:1!important;
  margin:7px 0 6px!important;padding:7px 10px!important;
  border-left:3px solid #D6A34B!important;border-radius:7px!important;
  background:#FFF7E8!important;color:#244363!important;
  font-size:14px!important;line-height:1.55!important;overflow-wrap:anywhere!important;
}
#resultCard .dwss-secondary-details .dwss-french-word-reading-label{
  color:#8B642A!important;font-size:12px!important;font-weight:800!important;
}
#resultCard .dwss-secondary-details .dwss-french-word-reading strong{
  display:inline!important;color:#183B60!important;font-size:16px!important;
  font-weight:850!important;letter-spacing:.2px!important;
}
#resultCard .dwss-secondary-details .dwss-french-word-reading-missing{
  color:#8A6B45!important;font-size:12px!important;font-weight:600!important;
}
</style>"""
french_word_reading_style_id = 'id="dwss-french-word-reading-0130"'
if html.count(french_word_reading_style_id) > 1:
    fail("Duplicate per-word French pronunciation styles found.")
if french_word_reading_style_id not in html:
    if "</head>" not in html:
        fail("Cannot find </head> for per-word French pronunciation styles.")
    html = html.replace("</head>", french_word_reading_style + "\n</head>", 1)

french_word_pairs_style = """<style id="dwss-french-word-pairs-0132">
#resultCard[data-dwss-lang="fr"] .dwss-secondary-details #segmentList .dwss-french-word-edit{
  display:inline-block!important;width:100%!important;min-width:0!important;max-width:100%!important;
  box-sizing:border-box!important;margin:0!important;padding:1px 0!important;
  border:0!important;border-bottom:1px dashed transparent!important;border-radius:0!important;
  outline:none!important;background:transparent!important;color:inherit!important;
  font:inherit!important;line-height:inherit!important;box-shadow:none!important;
}
#resultCard[data-dwss-lang="fr"] .dwss-secondary-details #segmentList .dwss-french-word-original{
  color:#30465D!important;font-weight:700!important;
  border:1px solid #D5BE96!important;border-radius:6px!important;
  background:#FFF9ED!important;padding:4px 8px!important;min-height:28px!important;
  box-shadow:0 1px 2px rgba(60,40,12,.06)!important;
}
#resultCard[data-dwss-lang="fr"] .dwss-secondary-details #segmentList .dwss-french-word-pronunciation{width:calc(100% - 68px)!important;max-width:calc(100% - 68px)!important;vertical-align:middle!important;color:#42566E!important;font-weight:600!important;}
#resultCard[data-dwss-lang="fr"] .dwss-secondary-details #segmentList .dwss-french-word-reading-label{color:#8A6B45!important;font-size:10px!important;font-weight:700!important;white-space:nowrap!important;}
#resultCard[data-dwss-lang="fr"] .dwss-secondary-details #segmentList .dwss-french-word-edit:focus{border-bottom-color:#D6A34B!important;background:#FFFAEF!important;outline:none!important;}
#resultCard[data-dwss-lang="fr"] .dwss-secondary-details #segmentList .dwss-french-word-original:focus{border-color:#C98B2C!important;background:#FFFBF2!important;box-shadow:0 0 0 2px rgba(201,139,44,.16)!important;outline:none!important;}
#resultCard[data-dwss-lang="fr"] .dwss-secondary-details #segmentList .dwss-french-edit-hint{
  display:block!important;box-sizing:border-box!important;margin:0 0 7px!important;
  padding:4px 8px!important;border-left:3px solid #D5A24A!important;border-radius:4px!important;
  background:#FFF7E8!important;color:#80623A!important;font-size:11px!important;
  font-weight:500!important;line-height:1.5!important;
}
</style>"""
save_sync_clean_style = """<style id="dwss-save-sync-clean-0142">
#translationCorrectionPanel,
#dwssFrenchPronunciationEditor{
  margin:0!important;padding:0!important;
  border:0!important;border-radius:0!important;outline:0!important;
  background:transparent!important;box-shadow:none!important;
}
#translationCorrectionPanel[hidden],
#dwssFrenchPronunciationEditor[hidden]{display:none!important;}
#translationCorrectionPanel .translation-correction-hint,
#dwssFrenchPronunciationEditor .translation-correction-hint{
  display:none!important;visibility:hidden!important;
  height:0!important;margin:0!important;padding:0!important;
}
#translationCorrectionPanel .translation-correction-actions,
#dwssFrenchPronunciationEditor .translation-correction-actions{
  display:flex!important;align-items:center!important;
  margin:0!important;padding:0!important;
}
#translationCorrectionPanel #submitTranslationCorrection,
#dwssFrenchPronunciationEditor #dwssFrenchPronunciationSave{
  margin-top:0!important;margin-bottom:0!important;
}
</style>"""
save_sync_clean_style_id = 'id="dwss-save-sync-clean-0142"'
if html.count(save_sync_clean_style_id) > 1:
    fail("Duplicate compact save-and-sync styles found.")
if save_sync_clean_style_id in html:
    html, count = re.subn(
        r'<style id="dwss-save-sync-clean-0142">[\s\S]*?</style>',
        lambda _: save_sync_clean_style, html, count=1
    )
    if count != 1:
        fail("Could not replace the compact save-and-sync styles.")
else:
    if "</head>" not in html:
        fail("Cannot find </head> for compact save-and-sync styles.")
    html = html.replace("</head>", save_sync_clean_style + "\n</head>", 1)

french_word_pairs_style_id = 'id="dwss-french-word-pairs-0132"'
if html.count(french_word_pairs_style_id) > 1:
    fail("Duplicate compact French word-pair styles found.")
if french_word_pairs_style_id in html:
    html, count = re.subn(
        r'<style id="dwss-french-word-pairs-0132">[\s\S]*?</style>',
        lambda _: french_word_pairs_style, html, count=1
    )
    if count != 1:
        fail("Could not replace the old French word-pair grid stylesheet.")
else:
    if "</head>" not in html:
        fail("Cannot find </head> for compact French word-pair styles.")
    html = html.replace("</head>", french_word_pairs_style + "\n</head>", 1)
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
if save_sync_clean_style_id not in html:
    fail("Compact borderless save-and-sync styles are missing.")
for selector in (
    "#translationCorrectionPanel .translation-correction-hint",
    "#dwssFrenchPronunciationEditor .translation-correction-hint",
    "#translationCorrectionPanel .translation-correction-actions",
    "#dwssFrenchPronunciationEditor .translation-correction-actions",
):
    if selector not in html:
        fail("Save-and-sync cleanup selector is missing: " + selector)
if '可直接修改上方中文谐音' in extension or '离线时先保存在本机' in extension:
    fail("Verbose French save panel explanation remains in the extension.")
if "DWSS_AUTO_UPDATE_0_9_142" not in html:
    fail("Automatic-update marker was not advanced to 0.9.142.")
if 'id="singleReadingGlossLabel"' not in html:
    fail("Language-aware single-word gloss title is missing.")
if french_gloss_visible_style_id not in html:
    fail("French pronunciation result Chinese meanings may be hidden.")
if french_word_reading_style_id not in html:
    fail("Legacy French word-reading stylesheet marker is missing.")
if french_word_pairs_style_id not in html:
    fail("Compact French word-pair grid stylesheet is missing.")
if french_original_style_id not in html:
    fail("French original sentence style is missing from the single-word gloss area.")
if 'id="dwss-dual-language-gloss-0126"' not in html:
    fail("Dual-language gloss wrapper visibility styles are missing.")
if ".dwss-french-word-edit" not in html or ".dwss-french-word-original" not in html or ".dwss-french-word-reading-label" not in html:
    fail("French word-by-word inputs must use the editable Swahili-style segment-row appearance.")
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
if "dwss-release=0.9.142" not in html:
    fail("HTML asset cache-busting URLs were not advanced to 0.9.142.")
if "Version: 0.9.142" not in version or "version:'0.9.142'" not in app:
    fail("Website and app version markers do not agree at 0.9.142.")
if "const APP_VERSION = '0.9.142';" not in sw:
    fail("Service Worker cache version is not 0.9.142.")
tokenize_start = app.find("function tokenize(raw){")
tokenize_end = app.find("function joinParts(parts){", tokenize_start)
if tokenize_start < 0 or tokenize_end <= tokenize_start:
    fail("Cannot isolate the Swahili tokenizer for language-separation verification.")
sw_tokenizer = app[tokenize_start:tokenize_end]
if "lookupFrenchPronunciationAt" in sw_tokenizer or "frenchFallback" in sw_tokenizer:
    fail("Swahili tokenizer still has a French fallback path.")
if new_accuracy_note not in html:
    fail("Swahili/French separation accuracy note is missing.")
for offline_asset in ("french-gloss-index.tsv.gz", "french-pronunciation-index.json", "french-word-index.json"):
    if offline_asset not in sw:
        fail("French base offline dictionary asset is missing from Service Worker cache: " + offline_asset)


paths["VERSION.txt"].write_text(version, encoding="utf-8", newline="\n")
paths["index.html"].write_text(html, encoding="utf-8", newline="\n")
paths["app.js"].write_text(app, encoding="utf-8", newline="\n")
paths["sw.js"].write_text(sw, encoding="utf-8", newline="\n")

for name, expected in protected.items():
    if sha(ROOT / name) != expected:
        fail("Protected asset changed unexpectedly: " + name)

(ROOT / ".nojekyll").write_text("", encoding="utf-8")
print(f"PASS: preserved all French data assets and copied {len(pron_keys)} pronunciation shards plus {len(word_keys)} spelling shards.")
print("PASS: DWSS 0.9.142 keeps both save-and-sync buttons borderless and compact, removes explanatory text, and preserves correction/sync behavior.")
print("PASS: no secondary French edit field remains; offline-first French sync and strict language separation are preserved.")
