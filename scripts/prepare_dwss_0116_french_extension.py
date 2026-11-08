#!/usr/bin/env python3
"""Build DWSS 0.9.116 French homophone extension from verified public dictionaries."""
from __future__ import annotations

import gzip
import hashlib
import html
import json
import os
import re
import sys
import tarfile
import tempfile
import time
from collections import defaultdict
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urljoin, urlparse
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

from pypinyin import Style, lazy_pinyin

BASE_URL = "https://yanyao8686-debug.github.io/dwss-kolwezi-swahili/"
BASE_PATH = "/dwss-kolwezi-swahili/"
OLD_VERSION = "0.9.115"
NEW_VERSION = "0.9.116"
FREEDICT_URL = "https://download.freedict.org/dictionaries/fra-zho/2025.11.23/freedict-fra-zho-2025.11.23.src.tar.xz"
FREEDICT_SHA512 = "3a101af1bdd523e29f217dd8612ade44dbc73b65b4ea1358ac778ebe155a2cd8b02e3816cb1a9f1dd6500937fa35825d1544db57c5a8aedf71a365c57cdf188a"
IPA_URL = "https://raw.githubusercontent.com/open-dict-data/ipa-dict/master/data/fr_FR.txt"
IPA_SHA256 = "4b4133e294dd3f49f98fcb02bbce1da3f1ed481d7c768e8b4ed93936464dc4cf"
IPA_LICENSE_URL = "https://raw.githubusercontent.com/open-dict-data/ipa-dict/master/LICENSE"

ROOT = Path("public")
REQUIRED = [
    "VERSION.txt", "index.html", "app.js", "pwa.js", "sw.js", "boot.js",
    "pronunciation-search.js", "dwss-pronunciation-controls.js",
    "manifest.webmanifest", "shared-lexicon.js", "dictionary-overrides.js",
    "dictionary.js.gz", "supabase.min.js", "cover.webp", "DWSS-Android-Installer.apk",
]
PROTECTED = [
    "cover.webp", "DWSS-Android-Installer.apk", "dictionary.js.gz",
    "dictionary-overrides.js", "pwa.js", "boot.js", "manifest.webmanifest",
    "pronunciation-search.js", "dwss-pronunciation-controls.js", "supabase.min.js",
]

def fail(message: str) -> None:
    raise SystemExit(message)

def fetch_bytes(url: str, limit: int = 40 * 1024 * 1024) -> bytes:
    last_error = None
    for attempt in range(5):
        try:
            req = Request(url, headers={"User-Agent": "DWSS-French-Lexicon-Build/0.9.116"})
            with urlopen(req, timeout=120) as response:
                data = response.read(limit + 1)
            if len(data) > limit:
                fail(f"Remote asset exceeds safety limit: {url}")
            if not data:
                fail(f"Remote asset is empty: {url}")
            return data
        except (HTTPError, URLError, TimeoutError, OSError) as exc:
            last_error = exc
            if attempt < 4:
                time.sleep(2 ** attempt)
    fail(f"Download failed after 5 attempts: {url}: {last_error}")

def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())

def local_path_for(reference: str, current_url: str):
    absolute = urljoin(current_url, reference)
    parsed = urlparse(absolute)
    base = urlparse(BASE_URL)
    if parsed.scheme not in ("https", "http") or parsed.netloc != base.netloc:
        return None
    if not parsed.path.startswith(BASE_PATH):
        return None
    rel = unquote(parsed.path[len(BASE_PATH):]).lstrip("/") or "index.html"
    parts = Path(rel).parts
    if any(part in ("..", ".") for part in parts):
        return None
    return rel, absolute

class AssetParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs = []
    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        for key in (("src", "href", "poster") if tag in ("script", "link", "img", "source", "video", "audio") else ()):
            if values.get(key):
                self.refs.append(values[key])
        if values.get("srcset"):
            for item in values["srcset"].split(","):
                candidate = item.strip().split()
                if candidate:
                    self.refs.append(candidate[0])

def css_refs(text: str):
    refs = re.findall(r"url\(\s*['\"]?([^'\")]+)", text, flags=re.I)
    refs += re.findall(r"@import\s+(?:url\()?['\"]([^'\"]+)['\"]", text, flags=re.I)
    return refs

def write_file(path: str, data: bytes):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)

def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        fail(f"{label}: expected exactly one anchor, found {count}")
    return text.replace(old, new, 1)

# ---------------- Verified live DWSS 0.9.115 baseline ----------------
ROOT.mkdir(parents=True, exist_ok=True)
queue = [(name, urljoin(BASE_URL, name)) for name in REQUIRED]
seen: set[str] = set()
while queue:
    rel, url = queue.pop(0)
    if rel in seen:
        continue
    seen.add(rel)
    data = fetch_bytes(url + ("&" if "?" in url else "?") + "dwss_mirror=0_9_116")
    write_file(rel, data)
    refs = []
    if rel.endswith((".html", ".htm")):
        parser = AssetParser()
        parser.feed(data.decode("utf-8"))
        refs = parser.refs
    elif rel.endswith((".css",)):
        refs = css_refs(data.decode("utf-8", errors="replace"))
    elif rel.endswith((".webmanifest", ".json")):
        try:
            obj = json.loads(data.decode("utf-8"))
            refs = [item.get("src", "") for item in obj.get("icons", []) if item.get("src")]
        except Exception:
            pass
    elif rel == "sw.js":
        sw_text = data.decode("utf-8")
        match = re.search(r"const\s+PRECACHE_URLS\s*=\s*\[(.*?)\];", sw_text, re.S)
        if not match:
            fail("Cannot find Service Worker PRECACHE_URLS.")
        refs = re.findall(r"""['"]([^'"]+)['"]""", match.group(1))
    for ref in refs:
        found = local_path_for(ref, url)
        if found and found[0] not in seen:
            queue.append(found)

for name in REQUIRED:
    path = ROOT / name
    if not path.is_file() or path.stat().st_size == 0:
        fail(f"Missing required live 0.9.115 asset: {name}")

html_path, app_path = ROOT / "index.html", ROOT / "app.js"
sw_path, ver_path = ROOT / "sw.js", ROOT / "VERSION.txt"
shared_path = ROOT / "shared-lexicon.js"
html_text = html_path.read_text(encoding="utf-8")
app_text = app_path.read_text(encoding="utf-8")
sw_text = sw_path.read_text(encoding="utf-8")
ver_text = ver_path.read_text(encoding="utf-8")
shared_text = shared_path.read_text(encoding="utf-8")

if f"Version: {OLD_VERSION}" not in ver_text:
    fail("The live site is not the expected 0.9.115 baseline.")
if f"DWSS_AUTO_UPDATE_{OLD_VERSION.replace('.', '_')}" not in html_text:
    fail("The live HTML cache marker is not 0.9.115.")
if f"const APP_VERSION = '{OLD_VERSION}';" not in sw_text:
    fail("The live Service Worker cache version is not 0.9.115.")
if f"version:'{OLD_VERSION}'" not in app_text:
    fail("The live application metadata version is not 0.9.115.")
protected_hashes = {name: sha256_file(ROOT / name) for name in PROTECTED}

# ---------------- Download + verify source dictionaries ----------------
freedict_archive = fetch_bytes(FREEDICT_URL)
if hashlib.sha512(freedict_archive).hexdigest() != FREEDICT_SHA512:
    fail("FreeDict French-Chinese source SHA512 verification failed.")
ipa_data = fetch_bytes(IPA_URL, limit=20 * 1024 * 1024)
if sha256_bytes(ipa_data) != IPA_SHA256:
    fail("French IPA dictionary SHA256 verification failed; review source update before release.")
ipa_license = fetch_bytes(IPA_LICENSE_URL, limit=100_000)

with tempfile.TemporaryDirectory() as tmpdir:
    archive_path = Path(tmpdir) / "freedict-fra-zho.tar.xz"
    archive_path.write_bytes(freedict_archive)
    with tarfile.open(archive_path, "r:xz") as archive:
        tei_member = next((m for m in archive.getmembers() if m.isfile() and m.name.endswith("fra-zho.tei")), None)
        copying_member = next((m for m in archive.getmembers() if m.isfile() and m.name.endswith("/COPYING")), None)
        if not tei_member or not copying_member:
            fail("FreeDict source archive is missing the TEI or COPYING license file.")
        tei_bytes = archive.extractfile(tei_member).read()
        freedict_copying = archive.extractfile(copying_member).read()

root = ET.fromstring(tei_bytes)
XML_LANG = "{http://www.w3.org/XML/1998/namespace}lang"
freedict: dict[str, dict] = {}
for entry in root.findall(".//{*}entry"):
    form = entry.find("./{*}form/{*}orth")
    pron = entry.find("./{*}form/{*}pron")
    word = (form.text or "").strip() if form is not None else ""
    ipa = (pron.text or "").strip() if pron is not None else ""
    if not word or not ipa:
        continue
    meanings = []
    for cit in entry.findall(".//{*}cit"):
        lang = cit.attrib.get(XML_LANG, "").lower()
        if lang not in ("zh", "zh-cn", "zh-hans", "zh-hant", "zho"):
            continue
        for quote in cit.findall(".//{*}quote"):
            value = "".join(quote.itertext()).strip()
            if value and value not in meanings:
                meanings.append(value)
    key = word.casefold()
    if key not in freedict:
        freedict[key] = {"word": word, "ipa": ipa, "meanings": meanings}
    else:
        old = freedict[key]
        for meaning in meanings:
            if meaning not in old["meanings"]:
                old["meanings"].append(meaning)
        if not old["ipa"] and ipa:
            old["ipa"] = ipa

# ---------------- Convert IPA to an editable Chinese sound guide ----------------
VOWELS = sorted(["ɑ̃", "ɛ̃", "ɔ̃", "œ̃", "ɑ", "a", "e", "ɛ", "i", "o", "ɔ", "u", "y", "ø", "œ", "ə"], key=len, reverse=True)
ONSET = {
    "b":"波","p":"普","t":"特","d":"德","k":"克","g":"格","f":"夫","v":"维",
    "s":"斯","z":"兹","ʃ":"施","ʒ":"日","m":"姆","n":"呢","l":"勒","ʁ":"赫",
    "j":"耶","w":"乌","ɥ":"于","ɲ":"尼","ŋ":"昂","tʁ":"特赫","dʁ":"德赫",
    "tr":"特赫","dr":"德赫","pl":"普勒","bl":"布勒","fl":"弗勒","kl":"克勒",
    "gl":"格勒","kr":"克赫","gr":"格赫","fr":"弗赫","vr":"维赫","br":"布赫",
    "pr":"普赫","sp":"斯普","st":"斯特","sk":"斯克","sl":"斯勒","sm":"斯姆",
}
RIME = {
    "ɑ̃":"昂","ɛ̃":"安","ɔ̃":"翁","œ̃":"恩","ɑ":"阿","a":"阿","e":"诶","ɛ":"艾",
    "i":"伊","o":"欧","ɔ":"奥","u":"乌","y":"于","ø":"厄","œ":"厄","ə":"呃",
}
CODA = {
    "ʁ":"赫","ʃ":"施","s":"斯","z":"兹","t":"特","d":"德","k":"克","g":"格",
    "p":"普","b":"波","m":"姆","n":"恩","l":"勒","f":"夫","v":"维","j":"伊",
    "ɲ":"尼","ŋ":"昂",
}
CV = {
    "bɑ̃":"邦","bɔ̃":"邦","ba":"巴","bɑ":"巴","bo":"波","bɔ":"博","bu":"布","be":"贝","bɛ":"贝","bɛ̃":"班","bi":"比","by":"比","bə":"伯","bœ":"伯","bø":"贝",
    "pɑ̃":"庞","pɔ̃":"旁","pa":"帕","pɑ":"帕","po":"坡","pɔ":"泊","pu":"普","pe":"佩","pɛ":"派","pɛ̃":"潘","pi":"皮","py":"匹","pə":"普",
    "tɑ̃":"唐","tɔ̃":"通","ta":"塔","tɑ":"塔","to":"托","tɔ":"托","tu":"图","te":"特","tɛ":"泰","tɛ̃":"滩","ti":"提","ty":"提","tə":"特",
    "dɑ̃":"当","dɔ̃":"东","da":"达","dɑ":"达","do":"多","dɔ":"多","du":"杜","de":"德","dɛ":"代","dɛ̃":"丹","di":"迪","dy":"迪","də":"德",
    "kɑ̃":"康","kɔ̃":"空","ka":"卡","kɑ":"卡","ko":"科","kɔ":"科","ku":"库","ke":"克","kɛ":"凯","kɛ̃":"开","ki":"基","ky":"基","kə":"克",
    "gɑ̃":"刚","gɔ̃":"公","ga":"嘎","gɑ":"嘎","go":"戈","gɔ":"戈","gu":"古","ge":"格","gɛ":"盖","gɛ̃":"干","gi":"吉","gy":"吉","gə":"格",
    "fɑ̃":"方","fɔ̃":"丰","fa":"法","fɑ":"法","fo":"佛","fɔ":"佛","fu":"夫","fe":"费","fɛ":"费","fɛ̃":"芬","fi":"菲","fy":"菲",
    "vɑ̃":"汪","vɔ̃":"翁","va":"瓦","vɑ":"瓦","vo":"沃","vɔ":"沃","vu":"乌","ve":"维","vɛ":"韦","vɛ̃":"万","vi":"维","vy":"维",
    "sɑ̃":"桑","sɔ̃":"松","sa":"萨","sɑ":"萨","so":"索","sɔ":"索","su":"苏","se":"塞","sɛ":"赛","sɛ̃":"森","si":"西","sy":"西",
    "zɑ̃":"藏","zɔ̃":"宗","za":"扎","zɑ":"扎","zo":"佐","zɔ":"佐","zu":"祖","ze":"泽","zɛ":"宅","zɛ̃":"赞","zi":"兹","zy":"兹",
    "ʃɑ̃":"尚","ʃɔ̃":"尚","ʃa":"沙","ʃɑ":"沙","ʃo":"肖","ʃɔ":"肖","ʃu":"舒","ʃe":"谢","ʃɛ":"谢","ʃɛ̃":"山","ʃi":"西","ʃy":"许",
    "ʒɑ̃":"让","ʒɔ̃":"让","ʒa":"扎","ʒɑ":"扎","ʒo":"热","ʒɔ":"若","ʒu":"茹","ʒe":"热","ʒɛ":"热","ʒɛ̃":"让","ʒi":"日","ʒy":"茹",
    "mɑ̃":"芒","mɔ̃":"蒙","ma":"马","mɑ":"马","mo":"莫","mɔ":"莫","mu":"姆","me":"梅","mɛ":"麦","mɛ̃":"曼","mi":"米","my":"米",
    "nɑ̃":"南","nɔ̃":"农","na":"纳","nɑ":"纳","no":"诺","nɔ":"诺","nu":"努","ne":"内","nɛ":"奈","nɛ̃":"南","ni":"尼","ny":"纽",
    "lɑ̃":"朗","lɔ̃":"隆","la":"拉","lɑ":"拉","lo":"洛","lɔ":"洛","lu":"卢","le":"勒","lɛ":"莱","lɛ̃":"兰","li":"里","ly":"吕",
    "ʁɑ̃":"让","ʁɔ̃":"让","ʁa":"拉","ʁɑ":"拉","ʁo":"若","ʁɔ":"若","ʁu":"赫","ʁe":"热","ʁɛ":"赖","ʁɛ̃":"兰","ʁi":"里","ʁy":"于",
    "wa":"瓦","wɑ":"瓦","wɛ":"韦","wi":"威","wɔ":"沃","wo":"沃","ɥi":"于伊","ɥɛ":"于艾","ja":"亚","jɑ":"亚","je":"耶","jɛ":"耶","jo":"约","ju":"优","jy":"于",
}
PHONEMES = sorted(["tʃ","dʒ","ʁ","ʃ","ʒ","ɲ","ŋ","ɥ","j","w","b","p","t","d","k","g","f","v","s","z","m","n","l","h"], key=len, reverse=True)

def first_pronunciation(ipa: str) -> str:
    value = str(ipa or "").strip().strip("/")
    value = value.split(",")[0].split(";")[0].strip()
    value = value.replace("ˈ", "").replace("ˌ", "").replace("ː", "").replace("ˑ", "").replace("‿", "")
    return value

def split_phoneme_tokens(text: str):
    tokens = []
    i = 0
    while i < len(text):
        hit = next((p for p in PHONEMES if text.startswith(p, i)), None)
        if hit:
            tokens.append(hit)
            i += len(hit)
        else:
            tokens.append(text[i])
            i += 1
    return tokens

def ipa_to_chinese(ipa: str) -> str:
    raw = first_pronunciation(ipa).lower()
    if not raw:
        return ""
    result = []
    for syllable in [x for x in re.split(r"[.\s]+", raw) if x]:
        # Find the first IPA vowel nucleus; its onset and coda become one Chinese-like syllable.
        nucleus = None
        pos = -1
        for i in range(len(syllable)):
            candidate = next((v for v in VOWELS if syllable.startswith(v, i)), None)
            if candidate:
                nucleus, pos = candidate, i
                break
        if nucleus is None:
            tokens = split_phoneme_tokens(syllable)
            result.append("".join(CODA.get(t, "") for t in tokens) or "呃")
            continue
        onset, coda = syllable[:pos], syllable[pos + len(nucleus):]
        onset_key = onset + nucleus
        if onset_key in CV:
            rendered = CV[onset_key]
        else:
            rendered = ONSET.get(onset, "")
            if not rendered and onset:
                rendered = "".join(ONSET.get(t, "") for t in split_phoneme_tokens(onset))
            rendered += RIME.get(nucleus, "")
        if coda:
            rendered += "".join(CODA.get(t, "") for t in split_phoneme_tokens(coda))
        result.append(rendered or "呃")
    return "".join(result)

def pinyin_key(reading: str) -> str:
    parts = lazy_pinyin(reading, style=Style.NORMAL, errors=lambda value: list(value))
    return " ".join(x.lower() for x in parts if x and re.search(r"[a-züv]", x.lower()))

# Build the merged headword + inflected-form lexicon. The 10,947-entry bilingual
# source supplies Chinese glosses; the IPA dataset extends pronunciation coverage.
records: dict[str, dict] = {}
ipa_text = ipa_data.decode("utf-8")
ipa_rows = 0
for line in ipa_text.splitlines():
    if "\t" not in line:
        continue
    word, ipa = line.split("\t", 1)
    word, ipa = word.strip(), ipa.strip()
    if not word or not ipa:
        continue
    key = word.casefold()
    ipa_rows += 1
    if key not in records:
        records[key] = {"word": word, "ipa": ipa, "meanings": []}
    elif len(word) < len(records[key]["word"]):
        records[key]["word"] = word

for key, item in freedict.items():
    if key not in records:
        records[key] = {"word": item["word"], "ipa": item["ipa"], "meanings": list(item["meanings"])}
    else:
        records[key]["meanings"] = list(dict.fromkeys(records[key]["meanings"] + item["meanings"]))
        # Prefer FreeDict's syllabified IPA for dictionary headwords.
        if item["ipa"]:
            records[key]["ipa"] = item["ipa"]

rows = []
gloss_count = 0
for item in records.values():
    reading = ipa_to_chinese(item["ipa"])
    if not reading:
        continue
    key = pinyin_key(reading)
    if not key:
        continue
    meanings = []
    for value in item["meanings"]:
        value = re.sub(r"[\t\r\n¦]+", " ", str(value)).strip()
        if value and value not in meanings:
            meanings.append(value)
    if meanings:
        gloss_count += 1
    word = re.sub(r"[\t\r\n]+", " ", item["word"]).strip()
    ipa = re.sub(r"[\t\r\n]+", " ", item["ipa"]).strip()
    gloss_field = "¦".join(meanings)
    rows.append((key, word, ipa, reading, gloss_field))

if len(rows) < 200_000:
    fail(f"French pronunciation lexicon unexpectedly small: {len(rows)} rows.")
if gloss_count < 9_000:
    fail(f"French-Chinese glossary unexpectedly small: {gloss_count} entries.")
if not any(row[1].casefold() == "bonjour" and row[4] for row in rows):
    fail("French-Chinese glossary does not include a glossed 'bonjour' entry.")
if not any(row[1].casefold() == "merci" and row[4] for row in rows):
    fail("French-Chinese glossary does not include a glossed 'merci' entry.")

rows.sort(key=lambda r: (r[0].split(" ", 1)[0], r[0], r[1].casefold()))
data_path = ROOT / "french-ipa-index.tsv.gz"
with data_path.open("wb") as raw_file:
    with gzip.GzipFile(filename="", mode="wb", fileobj=raw_file, compresslevel=9, mtime=0) as zipped:
        for row in rows:
            zipped.write(("\t".join(row) + "\n").encode("utf-8"))

# Include the upstream license files and clear attribution in the deployed site.
(ROOT / "french-FREEDICT-COPYING.txt").write_bytes(freedict_copying)
(ROOT / "french-IPA-LICENSE.txt").write_bytes(ipa_license)
license_note = f"""DWSS 法语词库来源与授权说明（DWSS 0.9.116）

1) 法语—中文释义与词头音标
FreeDict+WikDict French–Chinese (fra-zho), edition 2025-11-23
词头数量：10,947
许可：Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0)
源文件：https://download.freedict.org/dictionaries/fra-zho/2025.11.23/freedict-fra-zho-2025.11.23.src.tar.xz
SHA-512：{FREEDICT_SHA512}
授权文本见 french-FREEDICT-COPYING.txt。

2) 法语词形及 IPA 发音扩展
open-dict-data/ipa-dict, data/fr_FR.txt
源文件：https://raw.githubusercontent.com/open-dict-data/ipa-dict/master/data/fr_FR.txt
原始行数：{ipa_rows}
SHA-256：{IPA_SHA256}
仓库许可：MIT（该仓库注明如无特别说明，材料按 MIT 发布；第三方数据另按其原许可处理）
许可文本见 french-IPA-LICENSE.txt。

3) 本应用处理方式
本应用将上述法语 IPA 音标转换为“中文近似读音”作为学习提示，并保留法语拼写及 IPA 供核对。中文近似音为自动拟音，不是官方拼音/标准汉字转写，不能替代真实法语发音；允许用户直接修正并提交共享词库。
本版生成词形/短语发音记录：{len(rows)}
含法语—中文释义的记录：{gloss_count}
中文释义只取法中词典已有内容；没有中文释义的法语词形不会虚构含义。
任何开放词典都不可能保证覆盖法语所有新词、专名、地区词和专业术语，后续可通过更新词库和用户修正持续扩充。
"""
(ROOT / "french-lexicon-sources.txt").write_text(license_note, encoding="utf-8")

# ---------------- Main translation interface: parallel French mode ----------------
main_heading = '<div class="sectionTitle"><h2>斯语翻译中文谐音：</h2><span id="resultState" hidden aria-hidden="true"></span></div>'
picker = """<div id="dwssMainLanguagePicker" class="dwss-language-picker" role="group" aria-label="翻译语言选择">
 <button id="dwssMainSwMode" type="button" class="dwss-language-choice active" aria-pressed="true">斯语谐音</button>
 <button id="dwssMainFrMode" type="button" class="dwss-language-choice" aria-pressed="false">法语谐音</button>
</div>"""
html_text = replace_once(html_text, main_heading, main_heading + "\n" + picker, "main language selector")

old_result = '<textarea class="phonetic empty" id="resultReading" rows="3" maxlength="2000" aria-label="可直接修改的斯语中文谐音" placeholder="认为翻译结果不正确可自行修改" spellcheck="false"></textarea>'
new_result = old_result + """
<textarea class="phonetic empty" id="resultFrenchReading" rows="3" maxlength="2000" aria-label="可直接修改的法语中文谐音" placeholder="认为翻译结果不正确可自行修改" spellcheck="false" hidden></textarea>
<div id="dwssFrenchSpellingBlock" class="dwss-french-spelling-block" hidden>
 <label for="dwssFrenchSpelling">匹配到的法语原文（可自行修改）</label>
 <input id="dwssFrenchSpelling" class="search" type="text" maxlength="200" autocomplete="off" placeholder="对应法语单词或短句">
 <div id="dwssFrenchIpaMeta" class="dwss-french-ipa-meta" aria-live="polite"></div>
</div>
<div id="dwssFrenchCorrectionPanel" class="dwss-french-correction-panel" hidden>
 <button id="dwssSaveFrenchCorrection" class="primary mini" type="button">提交法语修正并同步所有用户</button>
 <p id="dwssFrenchCorrectionStatus" role="status" aria-live="polite">法语中文近似音由 IPA 自动拟音，可直接修改；保存后进入共享词库。</p>
</div>"""
html_text = replace_once(html_text, old_result, new_result, "French editable translation result field")

# ---------------- Pronunciation lookup: a distinct French search mode ----------------
query_anchor = '<div class="card pronunciation-lookup-card">\n  <input id="pronunciationSearch"'
query_picker = """<div class="card pronunciation-lookup-card">
  <div id="dwssPronunciationMode" class="dwss-language-picker" role="group" aria-label="发音查询语言选择">
   <button id="dwssPronSwMode" type="button" class="dwss-language-choice active" aria-pressed="true">斯语发音查询</button>
   <button id="dwssPronFrMode" type="button" class="dwss-language-choice" aria-pressed="false">法语发音查询</button>
  </div>
  <input id="pronunciationSearch" """
html_text = replace_once(html_text, query_anchor, query_picker, "pronunciation mode selector anchor")
# The above replacement deliberately preserves the existing input attributes after the opening tag.
old_query_results = '<div id="pronunciationResults" aria-live="polite"></div>'
new_query_results = old_query_results + """
  <div id="dwssFrenchQueryPanel" class="dwss-french-query-panel" hidden>
   <input id="pronunciationFrenchSearch" class="search" type="search" maxlength="80" autocomplete="off" placeholder="输入听到的法语中文近似音，例如：邦茹赫" aria-label="输入法语中文近似音查询法语发音">
   <div class="pronunciation-lookup-instruction" role="note">输入听到的法语中文近似音，系统会按相同或近似拼音匹配法语单词，显示法语拼写、IPA 音标和已有中文释义。</div>
   <div id="pronunciationFrenchResults" aria-live="polite"></div>
   <div class="dwss-french-data-note">法语词形发音库约覆盖 24 万条记录；带中文释义的法中词条约 1.09 万条。中文近似音为自动提示，可进一步修正。</div>
  </div>"""
html_text = replace_once(html_text, old_query_results, new_query_results, "French pronunciation query panel")

# Make the French spelling visible in the dictionary-maintenance form.
french_pron_label = '<div class="field"><label for="newFrenchReadingZh">法语中文谐音（可选）</label><input id="newFrenchReadingZh" maxlength="200" placeholder="按标准法语实际发音，用中文同音字填写" autocomplete="off"></div>'
french_word_field = '<div class="field"><label for="newFrench">法语原文（可选）</label><input id="newFrench" maxlength="200" placeholder="例如：bonjour" autocomplete="off"></div>\n  ' + french_pron_label
html_text = replace_once(html_text, french_pron_label, french_word_field, "visible French dictionary word field")
html_text = replace_once(html_text, '<input id="newFrench" value=""><input id="newLatin" value="">', '<input id="newLatin" value="">', "remove duplicate hidden French input")

# ---------------- Same styling as the current Swahili result field ----------------
style = r"""<style id="dwss-french-extension-0116">
.dwss-language-picker{display:flex;gap:8px;margin:8px 0 12px;width:100%}
.dwss-language-choice{flex:1;min-width:0;min-height:40px;border:1px solid #d9e2ee;border-radius:12px;background:#f1f4f8;color:#53647a;font:inherit;font-size:13px;font-weight:750;padding:8px 10px}
.dwss-language-choice.active{background:#fff0d2;border-color:#d8bd80;color:#a94324;box-shadow:inset 0 0 0 1px rgba(216,189,128,.18)}
#resultCard #resultFrenchReading{display:block;width:100%;min-height:88px;height:auto;max-height:42vh;resize:vertical;padding:10px 12px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5;text-align:left;font-family:inherit;font-weight:760;box-sizing:border-box;border-color:#dce6f6;background:linear-gradient(135deg,#fff8e8,#fff0d2);color:#79664c}
#resultCard #resultFrenchReading:focus{outline:none;border-color:#c8a45b;box-shadow:0 0 0 3px rgba(200,164,91,.18)}
#resultCard #resultFrenchReading.empty::placeholder{color:#a89a80;opacity:1}
#resultCard[data-dwss-lang="fr"] #resultReading,
#resultCard[data-dwss-lang="fr"] #translationCorrectionPanel,
#resultCard[data-dwss-lang="fr"] #translationPronunciationCandidates{display:none!important}
#resultCard[data-dwss-lang="fr"] #resultFrenchReading{display:block!important}
.dwss-french-spelling-block{margin:10px 0 4px}
.dwss-french-spelling-block label{display:block;margin-bottom:6px;color:#b94b2b;font-size:13px;font-weight:750;text-decoration:underline;text-decoration-color:#ff4b12;text-decoration-thickness:2px;text-underline-offset:4px}
#dwssFrenchSpelling{width:100%;box-sizing:border-box;min-height:44px;border:1px solid #dfc995;border-radius:12px;background:#fff8e8;color:#65543d;font:inherit;font-size:15px;padding:9px 11px}
.dwss-french-ipa-meta{margin:6px 2px 0;color:#7a6c55;font-size:12px;line-height:1.6;overflow-wrap:anywhere}
.dwss-french-correction-panel{margin:10px 0 2px}
.dwss-french-correction-panel button{width:100%;min-height:42px}
.dwss-french-correction-panel p,.dwss-french-data-note{margin:6px 2px 0;color:#7d8796;font-size:11px;line-height:1.6}
#pronunciationFrenchSearch{width:100%;box-sizing:border-box}
#dwssFrenchQueryPanel .pronunciation-hit{margin-top:9px}
#dwssFrenchQueryPanel .pronunciation-hit-zh{font-size:15px;font-weight:800}
#dwssFrenchQueryPanel .pronunciation-hit-reading{margin-top:5px}
#dwssFrenchQueryPanel .pronunciation-hit-meta{margin-top:4px}
#maintenance #newFrench{border-color:#dfc995;background:#fff8e8}
#maintenance #newFrenchReadingZh{border-color:#dfc995;background:#fff8e8}
#resultCard [hidden],#dwssFrenchQueryPanel[hidden],#dwssFrenchSpellingBlock[hidden],#dwssFrenchCorrectionPanel[hidden]{display:none!important}
@media(max-width:420px){.dwss-language-picker{gap:6px}.dwss-language-choice{font-size:12px;padding:8px 6px}}
</style>
"""
html_text = replace_once(html_text, "</head>", style + "\n</head>", "French extension styles")

script_tag = '<script defer src="./french-extension.js"></script>'
if script_tag not in html_text:
    html_text = replace_once(html_text, "</body>", script_tag + "\n</body>", "French extension runtime script")

# ---------------- Preserve French words and share French spelling + reading ----------------
old_validate = "const zh=String(data.zh||'').trim(),reading=String(data.reading||'').trim(),latin=String(data.latin||'').trim(),frenchReadingZh=String(data.frenchReadingZh||'').trim();"
new_validate = "const zh=String(data.zh||'').trim(),reading=String(data.reading||'').trim(),latin=String(data.latin||'').trim(),french=String(data.french||'').trim(),frenchReadingZh=String(data.frenchReadingZh||'').trim();"
app_text = replace_once(app_text, old_validate, new_validate, "custom term French field validation")
app_text = replace_once(app_text, "if(zh.length>100||reading.length>200||latin.length>200||frenchReadingZh.length>200)", "if(zh.length>100||reading.length>200||latin.length>200||french.length>200||frenchReadingZh.length>200)", "custom term French field length check")
app_text = replace_once(app_text, "return {zh,reading,latin,french:'',frenchReadingZh,category:", "return {zh,reading,latin,french,frenchReadingZh,category:", "preserve French source word in custom term")
old_duplicate = "&&norm(c.frenchReadingZh)===norm(v.frenchReadingZh)"
app_text = app_text.replace(old_duplicate, old_duplicate + "&&norm(c.french)===norm(v.french)")
if app_text.count("&&norm(c.french)===norm(v.french)") < 2:
    fail("French-aware duplicate checks were not added to both custom-word operations; found " + str(app_text.count("&&norm(c.french)===norm(v.french)")) + ".")

old_shared_variant = "french:'',frenchReadingZh:String(c.frenchReadingZh||'').trim(),"
new_shared_variant = "french:String(c.french_text||'').trim(),frenchReadingZh:String(c.french_pronunciation_cn||c.frenchReadingZh||'').trim(),"
app_text = replace_once(app_text, old_shared_variant, new_shared_variant, "read synced French spelling and pronunciation from cloud terms")

# Personal-term cloud payload must retain French spelling as well as its Chinese homophone.
old_payload_anchor = "const frenchReading = String(entry.frenchReadingZh || '').trim();\n  const latin = String(entry.latin || '').trim();"
new_payload_anchor = "const frenchReading = String(entry.frenchReadingZh || '').trim();\n  const french = String(entry.french || '').trim();\n  const latin = String(entry.latin || '').trim();"
shared_text = replace_once(shared_text, old_payload_anchor, new_payload_anchor, "shared vocabulary French spelling field")
shared_text = replace_once(shared_text, "french_text: null,", "french_text: french || null,", "cloud shared French source text")
old_duplicate_payload = 'normalizeSharedText(t.french_pronunciation_cn) === normalizeSharedText(payload.french_pronunciation_cn)'
new_duplicate_payload = old_duplicate_payload + ' &&\n      normalizeSharedText(t.french_text) === normalizeSharedText(payload.french_text)'
shared_text = replace_once(shared_text, old_duplicate_payload, new_duplicate_payload, "shared cloud duplicate detection includes French source")

# ---------------- Service Worker cache/version ----------------
if html_text.count(OLD_VERSION) < 1:
    fail("HTML has no 0.9.115 version marker.")
html_text = html_text.replace(OLD_VERSION, NEW_VERSION)
html_text = replace_once(
    html_text,
    "DWSS_AUTO_UPDATE_0_9_115",
    "DWSS_AUTO_UPDATE_0_9_116",
    "PWA automatic update marker",
)
app_text = replace_once(app_text, f"version:'{OLD_VERSION}'", f"version:'{NEW_VERSION}'", "app metadata version")
sw_text = replace_once(sw_text, f"const APP_VERSION = '{OLD_VERSION}';", f"const APP_VERSION = '{NEW_VERSION}';", "service worker cache version")
precache = re.search(r"const PRECACHE_URLS = \[(.*?)\];", sw_text, re.S)
if not precache:
    fail("Could not find PRECACHE_URLS to add the French lexicon assets.")
for asset in ("./french-extension.js", "./french-ipa-index.tsv.gz", "./french-lexicon-sources.txt", "./french-FREEDICT-COPYING.txt", "./french-IPA-LICENSE.txt"):
    if asset not in precache.group(1):
        insertion = f"  '{asset}',\n"
        sw_text = sw_text[:precache.end(1)] + "\n" + insertion.rstrip("\n") + sw_text[precache.end(1):]
        precache = re.search(r"const PRECACHE_URLS = \[(.*?)\];", sw_text, re.S)
ver_text = replace_once(ver_text, f"Version: {OLD_VERSION}", f"Version: {NEW_VERSION}", "VERSION.txt")
ver_text = ver_text.rstrip() + (
    f"\n\n{NEW_VERSION}: Added a selectable French Chinese-homophone translation mode, editable French result, IPA and French spelling display, a separate French pronunciation lookup using the existing Chinese sound-match engine, and French custom-word sync through the shared lexicon. "
    f"The offline French data pack contains {len(rows)} pronunciation records (including about 244,711 unique single-word forms) and {gloss_count} records with Chinese meanings from FreeDict+WikDict. "
    "Auto-generated Chinese sound guides are approximations; users may correct and sync them. Cover and APK remain unchanged.\n"
)

# ---------------- Final write + immutable asset audit ----------------
html_path.write_text(html_text, encoding="utf-8", newline="\n")
app_path.write_text(app_text, encoding="utf-8", newline="\n")
shared_path.write_text(shared_text, encoding="utf-8", newline="\n")
sw_path.write_text(sw_text, encoding="utf-8", newline="\n")
ver_path.write_text(ver_text, encoding="utf-8", newline="\n")

for name, expected in protected_hashes.items():
    actual = sha256_file(ROOT / name)
    if actual != expected:
        fail(f"Protected asset changed unexpectedly: {name}")

# Structural safeguards before the browser-level regression test.
if html_text.count('id="resultFrenchReading"') != 1:
    fail("French result input is not unique.")
if html_text.count('id="pronunciationFrenchSearch"') != 1:
    fail("French pronunciation query input is not unique.")
if html_text.count('id="dwssMainLanguagePicker"') != 1 or html_text.count('id="dwssPronunciationMode"') != 1:
    fail("French language selectors are missing or duplicated.")
if "french_text: french || null" not in shared_text:
    fail("French spelling is not preserved in cloud payload.")
if "french:String(c.french_text||'').trim()" not in app_text:
    fail("Cloud French spelling is not restored into the application dictionary.")
print(
    "PASS: French lexicon built and verified; "
    f"{len(rows)} pronunciation rows, {gloss_count} Chinese-gloss records; "
    "editable French translation/query UI patched; French spelling sync fixed; "
    "PWA cache/version set to 0.9.116; cover/APK/protected assets unchanged."
)
