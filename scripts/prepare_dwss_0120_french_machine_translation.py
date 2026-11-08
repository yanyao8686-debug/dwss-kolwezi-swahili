#!/usr/bin/env python3
"""DWSS 0.9.119: replace the undersized IPA list with the full LeXiK word-form index."""
from __future__ import annotations
import hashlib, json, re, time, gzip, csv, sqlite3, tempfile, collections, io, os, unicodedata
from pypinyin import Style, lazy_pinyin
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urljoin, urlparse
from urllib.request import Request, urlopen

BASE_URL = "https://yanyao8686-debug.github.io/dwss-kolwezi-swahili/"
BASE_PATH = "/dwss-kolwezi-swahili/"
OLD_VERSION = "0.9.119"
NEW_VERSION = "0.9.120"
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
    "dwss-pronunciation-controls.js", "supabase.min.js",
    "french-FREEDICT-COPYING.txt", "french-IPA-LICENSE.txt",
]

def fail(message: str) -> None:
    raise SystemExit(message)

def fetch_bytes(url: str, limit: int = 120 * 1024 * 1024) -> bytes:
    last = None
    for attempt in range(5):
        try:
            req = Request(url, headers={"User-Agent": "DWSS-Release-Mirror/0.9.120"})
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
    data = fetch_bytes(url + ("&" if "?" in url else "?") + "dwss_mirror=0_9_119")
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
        fail("Required 0.9.118 file missing: " + name)

runtime_source = Path("scripts/french-translation-runtime.js")
if not runtime_source.is_file() or runtime_source.stat().st_size < 10000:
    fail("French sentence-translation runtime source is missing or unexpectedly small.")
write_asset("french-translation-runtime.js", runtime_source.read_bytes())

paths = {name: ROOT / name for name in ("VERSION.txt", "index.html", "app.js", "sw.js", "shared-lexicon.js")}
version = paths["VERSION.txt"].read_text(encoding="utf-8")
html = paths["index.html"].read_text(encoding="utf-8")
app = paths["app.js"].read_text(encoding="utf-8")
sw = paths["sw.js"].read_text(encoding="utf-8")
shared = paths["shared-lexicon.js"].read_text(encoding="utf-8")

if f"Version: {OLD_VERSION}" not in version:
    fail("Live site is not 0.9.118; VERSION.txt begins " + repr(version[:100]))
if "DWSS_AUTO_UPDATE_0_9_119" not in html:
    fail("Live HTML cache marker is not 0.9.119.")
if "version:'0.9.118'" not in app:
    fail("Live app.js version is not 0.9.118.")
if "const APP_VERSION = '0.9.118';" not in sw:
    fail("Live Service Worker version is not 0.9.118.")

protected = {name: sha(ROOT / name) for name in PROTECTED}

VOWELS = sorted(["ɑ̃", "ɛ̃", "ɔ̃", "œ̃", "ɑ", "a", "e", "ɛ", "i", "o", "ɔ", "u", "y", "ø", "œ", "ə"], key=len, reverse=True)
ONSET = {
    "b":"波","p":"普","t":"特","d":"德","k":"克","g":"格","f":"夫","v":"维",
    "s":"斯","z":"兹","ʃ":"施","ʒ":"日","m":"姆","n":"呢","l":"勒","ʁ":"赫",
    "j":"耶","w":"乌","ɥ":"于","ɲ":"尼","ŋ":"昂","ʒ":"日","w":"乌","ɥ":"于","tʁ":"特赫","dʁ":"德赫",
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
    "ɲ":"尼","ŋ":"昂","ʒ":"日","w":"乌","ɥ":"于",
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
    # LeXiK conventions: remove optional liaison/alternation notes and aspirated-h markers;
    # choose the first explicitly listed free variant rather than inventing a pronunciation.
    value = unicodedata.normalize("NFC", str(ipa or "").strip().strip("/"))
    value = re.sub(r"\[[^\]]*\]", "", value)
    value = re.sub(r"\*[^*]*\*", "", value)
    while re.search(r"\{([^{}|]+)(?:\|[^{}]*)+\}", value):
        value = re.sub(r"\{([^{}|]+)(?:\|[^{}]*)+\}", r"\1", value)
    value = value.replace("ɡ", "g")
    value = value.replace("ˈ", "").replace("ˌ", "").replace("ː", "").replace("ˑ", "").replace("‿", "")
    value = value.split(";")[0].split(",")[0].strip()
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



# ---------------- Official LeXiK 1.0 pronunciation corpus ----------------
LEXIK_BASE = "https://lexique.lectura.world/telechargements/lexik/"
LEXIK_FILES = {
    "lexik_formes_mots.tsv.gz": "43df3316f4efb4b4192bbd04e15a2abf647b92839313132ffac470008f1bdf6d",
    "lexik_formes_multimots.tsv.gz": "3e3ac257fcf04bdf2de232e50b922b0a92c6d6ea476bbc2acf653f3ad2bb4452",
    "LICENSE": "28a9529c7d0bb4dc51f4bf5c116a3d16ef247a052f7591466768ddf563fd1cf5",
    "checksums.sha256": None,
}
check_bytes = fetch_bytes(LEXIK_BASE + "checksums.sha256", limit=2_000_000)
checksum_lines = check_bytes.decode("utf-8").splitlines()
official_checksums = {}
for line in checksum_lines:
    parts = line.strip().split(None, 1)
    if len(parts) == 2:
        official_checksums[parts[1].lstrip("./")] = parts[0].lower()

for filename, expected in LEXIK_FILES.items():
    if filename == "checksums.sha256":
        continue
    declared = official_checksums.get(filename)
    if not declared or (expected and declared != expected):
        fail("Official LeXiK checksum manifest mismatch for " + filename)

lexik_bytes = fetch_bytes(LEXIK_BASE + "lexik_formes_mots.tsv.gz", limit=100 * 1024 * 1024)
lexik_multi_bytes = fetch_bytes(LEXIK_BASE + "lexik_formes_multimots.tsv.gz", limit=20 * 1024 * 1024)
lexik_license = fetch_bytes(LEXIK_BASE + "LICENSE", limit=500_000)
if hashlib.sha256(lexik_bytes).hexdigest() != LEXIK_FILES["lexik_formes_mots.tsv.gz"]:
    fail("LeXiK word-form file SHA-256 verification failed.")
if hashlib.sha256(lexik_multi_bytes).hexdigest() != LEXIK_FILES["lexik_formes_multimots.tsv.gz"]:
    fail("LeXiK multiword file SHA-256 verification failed.")
if hashlib.sha256(lexik_license).hexdigest() != LEXIK_FILES["LICENSE"]:
    fail("LeXiK license SHA-256 verification failed.")
(ROOT / "french-LEXIK-LICENSE.txt").write_bytes(lexik_license)

# Confidence order follows the LeXiK guide: A, B, C, R, P, K, T, E, N, M, S, G.
# G is explicitly model-predicted and must remain visibly marked as lower confidence.
CONFIDENCE_RANK = {"A":0,"B":1,"C":2,"R":3,"P":4,"K":5,"T":6,"E":7,"N":8,"M":9,"S":10,"G":11,"D":99}
def pinyin_key(reading: str) -> str:
    parts = lazy_pinyin(reading, style=Style.NORMAL, errors=lambda value: list(value))
    return " ".join(x.lower().replace("ü", "v").replace("u:", "v") for x in parts if x and re.search(r"[a-züv]", x.lower()))

database_path = ROOT / ".lexik-build.sqlite"
if database_path.exists():
    database_path.unlink()
db = sqlite3.connect(database_path)
db.execute("PRAGMA journal_mode=OFF")
db.execute("PRAGMA synchronous=OFF")
db.execute("PRAGMA temp_store=FILE")
db.execute("""CREATE TABLE forms (
    word_key TEXT PRIMARY KEY, word TEXT NOT NULL, phone TEXT NOT NULL,
    reading TEXT NOT NULL, pinyin TEXT NOT NULL, confidence TEXT NOT NULL,
    rank INTEGER NOT NULL, kind TEXT NOT NULL
)""")
insert_sql = """INSERT INTO forms(word_key,word,phone,reading,pinyin,confidence,rank,kind)
VALUES(?,?,?,?,?,?,?,?)
ON CONFLICT(word_key) DO UPDATE SET
word=excluded.word, phone=excluded.phone, reading=excluded.reading,
pinyin=excluded.pinyin, confidence=excluded.confidence, rank=excluded.rank, kind=excluded.kind
WHERE excluded.rank < forms.rank"""
source_analysis_rows = 0
normalization_failures = []
ipa_without_phone = 0
batch = []

def ingest_lexik_file(data: bytes, expected_kind: str) -> None:
    global source_analysis_rows, ipa_without_phone
    with gzip.GzipFile(fileobj=io.BytesIO(data), mode="rb") as zipped:
        stream = io.TextIOWrapper(zipped, encoding="utf-8", newline="")
        reader = csv.DictReader(stream, delimiter="\t")
        required = {"ortho", "phone", "confiance"}
        if not required.issubset(set(reader.fieldnames or [])):
            fail("Unexpected LeXiK schema in " + expected_kind + ": " + repr(reader.fieldnames))
        for item in reader:
            source_analysis_rows += 1
            word = (item.get("ortho") or "").strip()
            if not word:
                continue
            word_key = word.casefold()
            confidence = (item.get("confiance") or "D").strip().upper() or "D"
            rank = CONFIDENCE_RANK.get(confidence, 50)
            raw_phone = (item.get("phone") or "").strip()
            kind = "短语" if any(ch.isspace() for ch in word) else "词形"
            if not raw_phone:
                batch.append((word_key, word, "", "", "", confidence if confidence else "D", rank if confidence != "D" else 99, kind))
            else:
                phone = first_pronunciation(raw_phone)
                reading = ipa_to_chinese(phone)
                key = pinyin_key(reading) if reading else ""
                if not phone or not reading or not key:
                    normalization_failures.append((word, raw_phone, confidence))
                    continue
                batch.append((word_key, word, phone, reading, key, confidence, rank, kind))
            if len(batch) >= 10_000:
                db.executemany(insert_sql, batch)
                db.commit()
                batch.clear()

ingest_lexik_file(lexik_bytes, "Mots")
ingest_lexik_file(lexik_multi_bytes, "MultiMots")
if batch:
    db.executemany(insert_sql, batch)
    db.commit()
    batch.clear()

if len(normalization_failures) > 100:
    fail("Too many LeXiK pronunciations could not be converted safely: " + str(len(normalization_failures)))
total_unique_forms = db.execute("SELECT COUNT(*) FROM forms").fetchone()[0]
indexed_forms = db.execute("SELECT COUNT(*) FROM forms WHERE phone<>'' AND reading<>'' AND pinyin<>''").fetchone()[0]
missing_pronunciation = db.execute("SELECT COUNT(*) FROM forms WHERE phone=''").fetchone()[0]
if total_unique_forms < 2_100_000 or indexed_forms < 2_100_000:
    fail(f"LeXiK index unexpectedly small: unique={total_unique_forms}, indexed={indexed_forms}")
if indexed_forms + missing_pronunciation != total_unique_forms:
    fail("LeXiK word-form accounting is inconsistent.")

# Build compact first-pinyin-syllable shards. Only the requested shard is loaded by the app;
# the Service Worker caches shards on first successful fetch for subsequent offline use.
shard_root = ROOT / "french-pronunciation-shards"
shard_root.mkdir(parents=True, exist_ok=True)
first_keys = []
confidence_counts = collections.Counter()
kind_counts = collections.Counter()
shard_rows = 0
cursor = db.execute("SELECT word,phone,reading,pinyin,confidence,kind FROM forms WHERE phone<>'' ORDER BY pinyin,word_key")
current_key = None
raw_handle = None
gzip_handle = None
def close_shard():
    global raw_handle, gzip_handle
    if gzip_handle:
        gzip_handle.close()
        gzip_handle = None
    if raw_handle:
        raw_handle.close()
        raw_handle = None

for word, phone, reading, pinyin, confidence, kind in cursor:
    first = pinyin.split(" ", 1)[0]
    if not first:
        continue
    if first != current_key:
        close_shard()
        current_key = first
        first_keys.append(first)
        raw_handle = (shard_root / (first + ".tsv.gz")).open("wb")
        gzip_handle = gzip.GzipFile(filename="", fileobj=raw_handle, mode="wb", compresslevel=9, mtime=0)
    safe_word = re.sub(r"[\t\r\n]+", " ", word).strip()
    safe_phone = re.sub(r"[\t\r\n]+", " ", phone).strip()
    safe_reading = re.sub(r"[\t\r\n]+", " ", reading).strip()
    line = "\t".join((safe_word, safe_phone, safe_reading, confidence, kind)) + "\n"
    gzip_handle.write(line.encode("utf-8"))
    shard_rows += 1
    confidence_counts[confidence] += 1
    kind_counts[kind] += 1
close_shard()

if shard_rows != indexed_forms:
    fail(f"LeXiK shard count mismatch: {shard_rows} != {indexed_forms}")
meta = {
    "source": "LeXiK 1.0, Maxime Carriere (2026), ORTOLANG",
    "sourceUrl": "https://hdl.handle.net/11403/lexik/v1.0",
    "license": "CC BY-SA 4.0",
    "sourceAnalysisRows": source_analysis_rows,
    "uniqueForms": total_unique_forms,
    "formsWithIpa": indexed_forms,
    "formsWithoutIpa": missing_pronunciation,
    "normalizationFailures": len(normalization_failures),
    "indexedRows": shard_rows,
    "confidenceCounts": dict(sorted(confidence_counts.items())),
    "kindCounts": dict(sorted(kind_counts.items())),
    "firstKeys": first_keys,
    "shardPath": "french-pronunciation-shards/{first}.tsv.gz",
    "columns": ["French spelling", "IPA", "Chinese approximate reading", "confidence", "kind"],
}
(ROOT / "french-pronunciation-index.json").write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


# Build compact French-orthography shards for word-level IPA lookup in translated sentences.
# The 0.9.119 reverse-search index is keyed by Chinese pinyin and cannot be queried by French spelling.
word_forms_table = """
CREATE TABLE french_word_forms (
    prefix TEXT NOT NULL, word_key TEXT NOT NULL, word TEXT NOT NULL,
    phone TEXT NOT NULL, reading TEXT NOT NULL, confidence TEXT NOT NULL,
    rank INTEGER NOT NULL, kind TEXT NOT NULL,
    PRIMARY KEY(prefix, word_key)
)
"""
db.execute(word_forms_table)
word_insert = """INSERT INTO french_word_forms(prefix,word_key,word,phone,reading,confidence,rank,kind)
VALUES(?,?,?,?,?,?,?,?)
ON CONFLICT(prefix,word_key) DO UPDATE SET
word=excluded.word, phone=excluded.phone, reading=excluded.reading,
confidence=excluded.confidence, rank=excluded.rank, kind=excluded.kind
WHERE excluded.rank < french_word_forms.rank"""
def french_orthographic_key(value: str) -> str:
    value = str(value or "").casefold().replace("œ", "oe").replace("æ", "ae")
    value = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in value if ch in "abcdefghijklmnopqrstuvwxyz0123456789")
word_batch = []
for word_key, word, phone, reading, confidence, rank, kind in db.execute(
    "SELECT word_key,word,phone,reading,confidence,rank,kind FROM forms WHERE phone<>''"
):
    if not word or any(ch.isspace() for ch in word):
        continue
    normalized = french_orthographic_key(word)
    if not normalized:
        continue
    prefix = normalized[:2] if len(normalized) >= 2 else normalized + "_"
    clean_word = re.sub(r"[\t\r\n]+", " ", word).strip()
    clean_phone = re.sub(r"[\t\r\n]+", " ", phone).strip()
    clean_reading = re.sub(r"[\t\r\n]+", " ", reading).strip()
    word_batch.append((prefix, normalized, clean_word, clean_phone, clean_reading, confidence, rank, kind))
    if len(word_batch) >= 10_000:
        db.executemany(word_insert, word_batch)
        db.commit()
        word_batch.clear()
if word_batch:
    db.executemany(word_insert, word_batch)
    db.commit()
    word_batch.clear()

word_shard_root = ROOT / "french-word-shards"
word_shard_root.mkdir(parents=True, exist_ok=True)
word_prefixes = []
word_shard_rows = 0
current_prefix = None
word_raw = None
word_gzip = None
def close_word_shard():
    global word_raw, word_gzip
    if word_gzip:
        word_gzip.close()
        word_gzip = None
    if word_raw:
        word_raw.close()
        word_raw = None

for prefix, normalized, word, phone, reading, confidence, kind in db.execute(
    "SELECT prefix,word_key,word,phone,reading,confidence,kind FROM french_word_forms ORDER BY prefix,word_key"
):
    if prefix != current_prefix:
        close_word_shard()
        current_prefix = prefix
        word_prefixes.append(prefix)
        word_raw = (word_shard_root / (prefix + ".tsv.gz")).open("wb")
        word_gzip = gzip.GzipFile(filename="", fileobj=word_raw, mode="wb", compresslevel=9, mtime=0)
    safe = [re.sub(r"[\t\r\n]+", " ", str(x or "")).strip() for x in (normalized, word, phone, reading, confidence, kind)]
    word_gzip.write(("\t".join(safe) + "\n").encode("utf-8"))
    word_shard_rows += 1
close_word_shard()

if word_shard_rows < 1_000_000 or not {"bo", "me"}.issubset(set(word_prefixes)):
    fail(f"French orthographic IPA index unexpectedly small: rows={word_shard_rows}, prefixes={len(word_prefixes)}")
word_meta = {
    "source": "LeXiK 1.0, Maxime Carriere (2026), ORTOLANG",
    "sourceUrl": "https://hdl.handle.net/11403/lexik/v1.0",
    "license": "CC BY-SA 4.0",
    "wordFormsWithIpa": word_shard_rows,
    "prefixCount": len(word_prefixes),
    "prefixes": word_prefixes,
    "shardPath": "french-word-shards/{prefix}.tsv.gz",
    "columns": ["normalized spelling", "French spelling", "IPA", "Chinese approximate reading", "confidence", "kind"],
}
(ROOT / "french-word-index.json").write_text(
    json.dumps(word_meta, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
)


# Rebuild the small French->Chinese-gloss dictionary, preferring LeXiK IPA when available.
# FreeDict+WikDict remains the Chinese-meaning source; LeXiK supplies stronger pronunciation metadata.
legacy_path = ROOT / "french-ipa-index.tsv.gz"
if not legacy_path.is_file():
    fail("Legacy French-Chinese glossary is missing; refusing to lose Chinese meanings.")
gloss_path = ROOT / "french-gloss-index.tsv.gz"
gloss_count = 0
with legacy_path.open("rb") as raw_input, gloss_path.open("wb") as raw_output:
    with gzip.GzipFile(fileobj=raw_input, mode="rb") as zinput, gzip.GzipFile(filename="", fileobj=raw_output, mode="wb", compresslevel=9, mtime=0) as zoutput:
        reader = io.TextIOWrapper(zinput, encoding="utf-8")
        for line in reader:
            fields = line.rstrip("\r\n").split("\t")
            if len(fields) < 5 or not fields[4].strip():
                continue
            word = fields[1].strip()
            found = db.execute("SELECT phone,reading,confidence FROM forms WHERE word_key=?", (word.casefold(),)).fetchone()
            if found and found[0] and found[1]:
                phone, reading, confidence = found
            else:
                phone, reading, confidence = fields[2], fields[3], "I"
            key = pinyin_key(reading) if reading else fields[0]
            if not key or not reading:
                continue
            clean_word = re.sub(r"[\t\r\n]+", " ", word)
            clean_gloss = re.sub(r"[\t\r\n]+", " ", fields[4]).strip()
            out = "\t".join((key, clean_word, phone, reading, clean_gloss, confidence)) + "\n"
            zoutput.write(out.encode("utf-8"))
            gloss_count += 1
if gloss_count < 9_000:
    fail("Rebuilt French-Chinese gloss index is unexpectedly small: " + str(gloss_count))

# Remove the obsolete monolithic IPA dictionary from precache. Keep it as a compatibility
# asset, but load only the small gloss index and metadata at startup; pronunciation shards load on demand.
precache = re.search(r"const\s+PRECACHE_URLS\s*=\s*\[(.*?)\];", sw, re.S)
if not precache:
    fail("Cannot locate Service Worker precache list.")
items = re.findall(r"""['"]([^'"]+)['"]""", precache.group(1))
items = [x for x in items if x != "./french-ipa-index.tsv.gz"]
for required_asset in ("./french-gloss-index.tsv.gz", "./french-pronunciation-index.json", "./french-LEXIK-LICENSE.txt", "./french-word-index.json", "./french-translation-runtime.js"):
    if required_asset not in items:
        items.append(required_asset)
replacement = "const PRECACHE_URLS = [\n" + "".join("  '" + x.replace("'", "\\'") + "',\n" for x in items) + "];"
sw, n = re.subn(r"const\s+PRECACHE_URLS\s*=\s*\[.*?\];", replacement, sw, count=1, flags=re.S)
if n != 1:
    fail("Could not update Service Worker precache list.")

# Patch the existing French interface to use the sharded index and expose confidence labels.
ext_path = ROOT / "french-extension.js"
ext = ext_path.read_text(encoding="utf-8")
ext = ext.replace('const DATA_URL = "./french-ipa-index.tsv.gz";',
                  'const GLOSS_URL = "./french-gloss-index.tsv.gz";\n  const META_URL = "./french-pronunciation-index.json";\n  const SHARD_BASE = "./french-pronunciation-shards/";')
ext = ext.replace("let firstRanges = new Map();", "let firstKeys = [];\n  let firstKeySet = new Set();\n  let shardCache = new Map();\n  const MAX_SHARD_CACHE = 12;")
ext = ext.replace("const raw = String(ipa || \"\").trim().replace(/^\\/|\\/$/g, \"\").split(/[;,]/)[0]\n      .toLowerCase().replace(/[ˈˌːˑ‿]/g, \"\");",
                  "const raw = normalizeLeXiKPhone(ipa);")
# Put the official notation normalizer ahead of the IPA converter.
normalizer_js = r'''  function normalizeLeXiKPhone(value) {
    let phone = String(value || "").normalize("NFC").trim().replace(/^\/|\/$/g, "").toLowerCase();
    phone = phone.replace(/\[[^\]]*\]/g, "");
    phone = phone.replace(/\*[^*]*\*/g, "");
    phone = phone.replace(/\{([^{}|]+)(?:\|[^{}]*)+\}/g, "$1");
    phone = phone.replace(/ɡ/g, "g").replace(/[ˈˌːˑ‿]/g, "");
    return phone.split(/[;,]/)[0].trim();
  }

'''
ext = ext.replace("  function ipaToChinese(ipa) {", normalizer_js + "  function ipaToChinese(ipa) {", 1)
# Keep the IPA character fallbacks complete for all LeXiK phonemes.
coda_start = ext.find("const coda = {")
coda_end = ext.find("};", coda_start)
if coda_start < 0 or coda_end < 0:
    fail("Cannot locate IPA coda mapping in French runtime.")
coda_block = ext[coda_start:coda_end]
if '"ʒ":"日"' not in coda_block:
    coda_block = coda_block.replace('"ɲ":"尼","ŋ":"昂"', '"ɲ":"尼","ŋ":"昂","ʒ":"日","w":"乌","ɥ":"于"')
ext = ext[:coda_start] + coda_block + ext[coda_end:]
ext = ext.replace("window.DWSSFrenchTools = Object.freeze({ ipaToChinese, normalizeChinese, translateChinese });",
                  "window.DWSSFrenchTools = Object.freeze({ ipaToChinese, normalizeChinese, translateChinese, normalizeLeXiKPhone });")
# Confidence labels are always visible where IPA and sound hints are shown.
confidence_js = r'''  function confidenceLabel(code) {
    const labels = {
      A: "A · 多个独立来源一致",
      B: "B · 单一来源，经独立校验",
      C: "C · 单一来源，未独立校验",
      R: "R · 人工复核并修订",
      P: "P · 按同一词项的另一形式推导",
      K: "K · Wiktionnaire 短语来源",
      T: "T · 人工复核的特殊形式",
      E: "E · 缩写按字母逐个读",
      N: "N · 外来词/外国名发音，经确认",
      M: "M · 外来词/外国名，单一来源",
      S: "S · 由复合词片段组成",
      G: "G · 模型预测，可信度较低",
      I: "IPA-dict 来源，未提供 LeXiK 置信度",
      D: "D · 来源未提供发音"
    };
    return labels[String(code || "").toUpperCase()] || "未标注来源";
  }

'''
ext = ext.replace("  function notifyStatus(message, type) {", confidence_js + "  function notifyStatus(message, type) {", 1)
# Replace the complete monolithic dictionary loader.
load_start = ext.find("  async function loadLexicon() {")
load_end = ext.find("  function renderMainFrench() {", load_start)
if load_start < 0 or load_end < 0:
    fail("Cannot locate French glossary loader for sharding update.")
new_loader = r'''  async function decompressGzip(response, label) {
    if (!response.ok) throw new Error(label + "加载失败（HTTP " + response.status + "）。");
    if (typeof DecompressionStream === "undefined") throw new Error("当前浏览器不支持离线词库解压，请更新安卓 WebView 或浏览器。");
    return new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).text();
  }

  async function loadLexicon() {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      const [metaResponse, glossResponse] = await Promise.all([fetch(META_URL), fetch(GLOSS_URL)]);
      if (!metaResponse.ok) throw new Error("法语发音索引加载失败（HTTP " + metaResponse.status + "）。");
      const meta = await metaResponse.json();
      const decompressed = await decompressGzip(glossResponse, "法语中译词典");
      const lines = decompressed.split(/\r?\n/);
      meaningRows = [];
      for (const line of lines) {
        if (!line) continue;
        const fields = line.split("\t");
        if (fields.length < 5 || !fields[1] || !fields[3]) continue;
        const meanings = (fields[4] || "").split("¦").map(x => x.trim()).filter(Boolean);
        if (!meanings.length) continue;
        meaningRows.push({
          word: fields[1], ipa: cleanIpa(fields[2]), reading: fields[3],
          meanings, confidence: fields[5] || "I", source: "FreeDict 法中释义 + LeXiK/IPA 发音"
        });
      }
      firstKeys = Array.isArray(meta.firstKeys) ? meta.firstKeys : [];
      firstKeySet = new Set(firstKeys);
      if (firstKeys.length < 100 || meaningRows.length < 9000 || Number(meta.formsWithIpa || 0) < 2000000) {
        throw new Error("法语分片词库或中译词典数量异常，已停止使用不完整词库。");
      }
      activeMeaningIndex = createMeaningIndex();
      return { forms: meta.formsWithIpa, glossed: meaningRows.length, shards: firstKeys.length, confidence: meta.confidenceCounts || {} };
    })().catch(error => {
      loadPromise = null;
      throw error;
    });
    return loadPromise;
  }

  async function loadPronunciationShard(first) {
    if (shardCache.has(first)) {
      const cached = shardCache.get(first);
      shardCache.delete(first);
      shardCache.set(first, cached);
      return cached;
    }
    const url = SHARD_BASE + encodeURIComponent(first) + ".tsv.gz";
    const response = await fetch(url);
    const decompressed = await decompressGzip(response, "法语发音分片 " + first);
    const parsed = decompressed.split(/\r?\n/).filter(Boolean);
    shardCache.set(first, parsed);
    while (shardCache.size > MAX_SHARD_CACHE) {
      shardCache.delete(shardCache.keys().next().value);
    }
    return parsed;
  }

'''
ext = ext[:load_start] + new_loader + ext[load_end:]
# Main translation is based on the small bilingual glossary, not pronunciation shard availability.
ext = ext.replace("if (!rows.length)", "if (!meaningRows.length)")
ext = ext.replace("if (!rows.length) loadLexicon()", "if (!meaningRows.length) loadLexicon()")
ext = ext.replace("if (rows.length) activeMeaningIndex = createMeaningIndex();", "if (meaningRows.length) activeMeaningIndex = createMeaningIndex();")
# Source quality accompanies IPA in the Chinese-to-French result.
ext = ext.replace('ipa.push(record.word + " /" + record.ipa + "/");',
                  'ipa.push(record.word + " /" + record.ipa + "/ [" + confidenceLabel(record.confidence) + "]");')
# Replace the old in-memory range search with lazy pinyin-key shards.
old_range_start = ext.find("  function nearFirstKeys(first, engine) {")
old_range_end = ext.find("  function customQueryCandidates()", old_range_start)
if old_range_start < 0 or old_range_end < 0:
    fail("Cannot locate legacy pronunciation candidate range functions.")
new_range = r'''  function nearFirstKeys(first, engine) {
    if (firstKeySet.has(first)) return [first];
    const keys = [];
    for (const key of firstKeys) {
      const distance = typeof engine.syllableDistance === "function" ? engine.syllableDistance(first, key) : (first === key ? 0 : 9);
      if (distance <= 1) keys.push({ key, distance });
    }
    keys.sort((a, b) => a.distance - b.distance || a.key.localeCompare(b.key));
    return keys.slice(0, 6).map(x => x.key);
  }

  function rowsForShards(shards, cap) {
    const candidates = [];
    const seenWords = new Set();
    for (const lines of shards) {
      for (const line of lines) {
        if (candidates.length >= cap) return candidates;
        const fields = line.split("\t");
        if (fields.length < 5 || !fields[0] || !fields[2]) continue;
        const word = fields[0].trim();
        const key = word.toLowerCase();
        if (seenWords.has(key)) continue;
        seenWords.add(key);
        const confidence = fields[3] || "";
        const kind = fields[4] || "词形";
        candidates.push({
          zh: word,
          category: "法语" + kind,
          variants: [{
            reading: fields[2], latin: cleanIpa(fields[1]),
            source: "LeXiK · " + confidenceLabel(confidence),
            kind, status: "canonical", confidence
          }]
        });
      }
    }
    return candidates;
  }

'''
ext = ext[:old_range_start] + new_range + ext[old_range_end:]
# Query now loads only the first-syllable shards which can match this input.
ext = ext.replace("const candidates = rowsForFirst(firstKeys, 16000);",
                  "const shardLines = await Promise.all(firstKeys.map(loadPronunciationShard));\n    const candidates = rowsForShards(shardLines, 24000);")
# Add provenance to pronunciation result cards.
ext = ext.replace("'<div class=\"pronunciation-hit-meta\">IPA 音标：' + esc(ipa) + '</div>' +",
                  "'<div class=\"pronunciation-hit-meta\">IPA 音标：' + esc(ipa) + '</div>' +\n        '<div class=\"pronunciation-hit-meta\">发音来源与可信度：' + esc(confidenceLabel(variant.confidence)) + '</div>' +")
# Keep an explicit note on model-predicted spellings in results.
ext = ext.replace("const label = score >= 99 ? \"读音一致\" : \"近似读音 \" + score + \"%\";",
                  "const label = score >= 99 ? \"读音一致\" : \"近似读音 \" + score + \"%\";")
# Existing refresh logic must not depend on the former whole-table array.
ext = ext.replace("if (rows.length) activeMeaningIndex = createMeaningIndex();", "if (meaningRows.length) activeMeaningIndex = createMeaningIndex();")
# Fail closed if any old whole-table fetch/range logic remains.
if "firstRanges" in ext or "rowsForFirst" in ext or "const DATA_URL =" in ext:
    fail("Old monolithic French data loader remains after sharding patch.")
(ROOT / "french-extension.js").write_text(ext, encoding="utf-8", newline="\n")

# Replace the old public coverage note with accurate coverage and confidence wording.
old_note = "法语词形发音库约覆盖 24 万条记录；带中文释义的法中词条约 1.09 万条。中文近似音为自动提示，可进一步修正。"
new_note = "法语词库约覆盖 212 万种词形，其中约 212 万种有 IPA 与中文近似音；发音来源和可信度会显示在结果中。中文近似音仅作学习提示，IPA 可用于核对。"
if old_note in html:
    html = html.replace(old_note, new_note, 1)

# Update cache list/version and expose the official dataset license/attribution.
ver_text = paths["VERSION.txt"].read_text(encoding="utf-8")
html = html.replace(OLD_VERSION, NEW_VERSION)
if "DWSS_AUTO_UPDATE_0_9_120" not in html:
    html = html.replace("DWSS_AUTO_UPDATE_0_9_119", "DWSS_AUTO_UPDATE_0_9_120", 1)
if "DWSS_AUTO_UPDATE_0_9_120" not in html:
    fail("New automatic-update marker could not be applied.")

runtime_tag = '<script defer src="./french-translation-runtime.js"></script>'
if runtime_tag not in html:
    if "</body>" not in html:
        fail("Cannot find </body> for French machine-translation runtime injection.")
    html = html.replace("</body>", runtime_tag + "\n</body>", 1)


app = app.replace("version:'0.9.119'", "version:'0.9.120'", 1)
sw = sw.replace("const APP_VERSION = '0.9.119';", "const APP_VERSION = '0.9.120';", 1)
version = version.replace("Version: 0.9.119", "Version: 0.9.120", 1)
version = version.rstrip() + (
    "\n\n0.9.119: Expanded the French pronunciation index using checksum-verified LeXiK 1.0. "
    f"Indexed {indexed_forms:,} written forms with IPA and Chinese approximate readings; {missing_pronunciation:,} forms lacked IPA and are not presented as pronounced. "
    f"Confidence counts are preserved (including {confidence_counts.get('G',0):,} model-predicted forms marked G). "
    "The French pronunciation lookup loads first-pinyin-syllable shards for reverse search; an additional French-spelling-keyed IPA index supports translated sentence pronunciation. "
    "French readings are Chinese approximations, not exact audio. The original cover and Android installer remain byte-identical.\n"
)

# Include source attribution, the CC BY-SA 4.0 license, scope, limits and confidence definitions.
sources_path = ROOT / "french-lexicon-sources.txt"
old_sources = sources_path.read_text(encoding="utf-8") if sources_path.exists() else ""
sources_path.write_text(old_sources.rstrip() + f"""

4) LeXiK 1.0 法语词形与发音（新增于 DWSS 0.9.119）
来源：CARRIERE, Maxime (2026). LeXiK — lexique phonétique et grammatical du français, version 1.0. Lectura. ORTOLANG.
永久来源：https://hdl.handle.net/11403/lexik/v1.0
数据文件：lexik_formes_mots.tsv.gz；官方 SHA-256：{LEXIK_FILES["lexik_formes_mots.tsv.gz"]}
许可：Creative Commons Attribution-ShareAlike 4.0 International（CC BY-SA 4.0）；授权文本见 french-LEXIK-LICENSE.txt。
源数据分析行数：{source_analysis_rows:,}
去重书写词形：{total_unique_forms:,}
含 IPA 并生成中文近似音：{indexed_forms:,}
源数据无 IPA 的词形：{missing_pronunciation:,}
发音置信度分布：{json.dumps(dict(sorted(confidence_counts.items())), ensure_ascii=False)}
本应用按词形发音首个中文拼音音节分片，查询时按需加载；Service Worker 会缓存用户已经访问的分片。
置信度标记沿用 LeXiK 原定义：A 多来源一致；B 单一来源并经独立校验；C 单一来源未确认；R 人工复核；G 模型预测、可信度较低；其他代码详见 LeXiK 官方文档。
LeXiK 不包含中文释义；本应用中文输入翻译仍使用 FreeDict+WikDict 的约 1.09 万条法中释义，未收录中文释义的内容不会虚构翻译。中文近似音用于辅助记忆，不能代替法语母语者语音或 IPA；LeXiK 亦不保证覆盖所有地区变体和新造词。
""", encoding="utf-8")

# Precache only small bootstrap data; pronunciation shards are fetched and cached on demand.
for required_asset in ("./french-gloss-index.tsv.gz", "./french-pronunciation-index.json", "./french-LEXIK-LICENSE.txt"):
    if required_asset not in sw:
        # PRECACHE_URLS was rebuilt above; insert before its closing bracket.
        sw = sw.replace("];", "  " + json.dumps(required_asset) + ",\n];", 1)

# Update source paths and preserve all previous non-French assets.
paths["VERSION.txt"].write_text(version, encoding="utf-8", newline="\n")
paths["index.html"].write_text(html, encoding="utf-8", newline="\n")
paths["app.js"].write_text(app, encoding="utf-8", newline="\n")
paths["sw.js"].write_text(sw, encoding="utf-8", newline="\n")

db.close()
database_path.unlink(missing_ok=True)

for name, expected in protected.items():
    if sha(ROOT / name) != expected:
        fail("Protected asset changed unexpectedly: " + name)
for name in ("french-gloss-index.tsv.gz",):
    if not (ROOT / name).is_file() or (ROOT / name).stat().st_size < 100_000:
        fail("Generated French gloss index missing or unexpectedly small.")
if not (ROOT / "french-pronunciation-index.json").is_file():
    fail("Generated LeXiK pronunciation metadata is missing.")
if not (ROOT / "french-word-index.json").is_file() or word_shard_rows != word_meta["wordFormsWithIpa"]:
    fail("Generated French orthographic IPA metadata or shard count is invalid.")
if not (ROOT / "french-translation-runtime.js").is_file():
    fail("French sentence translation runtime missing from release.")

print(
    "PASS: DWSS 0.9.119 built sharded LeXiK 1.0 data; "
    f"{indexed_forms:,} IPA word forms, {gloss_count:,} Chinese-gloss entries, "
    f"{len(first_keys)} pinyin shards, confidence G={confidence_counts.get('G',0):,}; "
    "French result styling and all protected assets unchanged."
)

# 0.9.118 already fixed the shared French spelling/homophone readback.
# Verify both normalized fields remain present and do not re-apply that earlier patch.
start = app.find("function applySharedTerms(rows){")
end = app.find("function applySharedPronunciationVariants", start)
if start < 0 or end < 0:
    fail("Cannot locate shared-term ingestion function.")
ingest = app[start:end]
if "french:String(t.french_text||'').trim()" not in ingest:
    fail("French spelling readback from Supabase regressed.")
start = app.find("// Shared terms supplement the built-in and personal dictionaries.")
end = app.find("for(const v of sharedPronunciationVariants", start)
if start < 0 or end < 0:
    fail("Cannot locate shared-term dictionary rebuild block.")
rebuild = app[start:end]
if "french:String(c.french||'').trim()" not in rebuild:
    fail("Normalized French spelling is not preserved in dictionary rebuild.")
if "frenchReadingZh:String(c.frenchReadingZh||'').trim()" not in rebuild:
    fail("Normalized French Chinese-homophone is not preserved in dictionary rebuild.")
