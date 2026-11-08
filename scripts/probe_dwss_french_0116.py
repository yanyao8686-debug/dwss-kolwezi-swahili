#!/usr/bin/env python3
from pathlib import Path
from urllib.request import Request, urlopen
import re, json, html as htmlmod

BASE="https://yanyao8686-debug.github.io/dwss-kolwezi-swahili/"
FILES=["VERSION.txt","index.html","app.js","shared-lexicon.js","pronunciation-search.js",
       "dwss-pronunciation-controls.js","pwa.js","sw.js","boot.js","manifest.webmanifest"]
out=Path("probe"); out.mkdir(exist_ok=True)
for name in FILES:
    req=Request(BASE+name+"?probe=0116",headers={"User-Agent":"DWSS-Architecture-Probe"})
    with urlopen(req,timeout=60) as r: data=r.read()
    (out/name).write_bytes(data)

h=(out/"index.html").read_text(encoding="utf-8")
a=(out/"app.js").read_text(encoding="utf-8")
s=(out/"shared-lexicon.js").read_text(encoding="utf-8")
p=(out/"pronunciation-search.js").read_text(encoding="utf-8")
pw=(out/"pwa.js").read_text(encoding="utf-8")
sw=(out/"sw.js").read_text(encoding="utf-8")

print("===VERSION==="); print((out/"VERSION.txt").read_text(encoding="utf-8"))
print("===HTML ELEMENT MAP===")
for m in re.finditer(r'<(input|textarea|button|select|h[1-6]|div|section)[^>]*\bid="([^"]+)"[^>]*>',h,re.I):
    tag, ident=m.group(1),m.group(2)
    line=h[max(0,m.start()-150):min(len(h),m.end()+180)].replace("\n"," ")
    print(f"{tag}#{ident}: {line[:420]}")
print("===HTML NAV/TARGET CONTEXT===")
for term in ['resultReading','pronunciationResults','pronunciationSearch','发音查询','翻译结果中文谐音','历史记录']:
    i=h.find(term)
    if i>=0: print(f"--{term}--\n{h[max(0,i-1800):i+4200]}\n")
print("===APP FUNCTIONS===")
names=re.findall(r'(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(',a)
print("FUNCTION_NAMES:",",".join(names))
for term in ['function renderTranslation','function translate','function renderSaved','function switchTab','function pronunciation','function searchPronunciation','resultReading','pronunciationResults','french','frenchReading','getCustom','addCustom','lookupLocalAt','window.KolweziSwahili']:
    hits=[m.start() for m in re.finditer(re.escape(term),a,re.I)]
    if hits:
        print(f"===APP TERM {term} ({len(hits)})===")
        for i in hits[:4]: print(a[max(0,i-1000):min(len(a),i+3000)])
print("===SHARED FUNCTIONS AND PAYLOAD===")
print("FUNCTION_NAMES:",",".join(re.findall(r'(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(',s)))
for term in ["buildPersonalPayload","frenchReading","local_pronunciation_cn","french_pronunciation_cn","source_language","addCustom","getTerms","variants","language"]:
    hits=[m.start() for m in re.finditer(re.escape(term),s,re.I)]
    if hits:
        print(f"===SHARED TERM {term} ({len(hits)})===")
        for i in hits[:3]: print(s[max(0,i-900):min(len(s),i+2600)])
print("===PRON SEARCH MODULE==="); print(p[:15000])
print("===PWA INPUT PRESERVE===")
for term in ["inputText","newFrench","pronunciation","resultReading"]:
    hits=[m.start() for m in re.finditer(re.escape(term),pw)]
    if hits:
        print(f"--{term}--")
        for i in hits[:2]: print(pw[max(0,i-300):i+650])
print("===SERVICE WORKER PRECACHE===")
m=re.search(r'const\s+PRECACHE_URLS\s*=\s*\[(.*?)\];',sw,re.S)
print(m.group(0)[:6000] if m else "NO PRECACHE")


print("===TARGETED CURRENT FRENCH UI AND ENGINE===")
for term, source in [
    ("newFrenchReadingZh", h),
    ("pronunciationSearch", h),
    ("function preferredFrenchPronunciationVariants", a),
    ("function lookupFrenchPronunciationAt", a),
    ("function translateFrenchHomophone", a),
    ("function renderPronunciationLookup", a),
    ("function tokenize", a),
    ("function sourceHeadwordAliases", a),
    ("function rebuild", a),
    ("function buildPersonalPayload", s),
]:
    i=source.find(term)
    print(f"--{term}--")
    print(source[max(0,i-1300):min(len(source),i+10500)] if i>=0 else "NOT FOUND")


print("===PRECISE CUSTOM WORD API===")
for needle in ["function validateEntry","function addCustomEntry","function updateCustomEntry","window.KolweziSwahili","$('entryForm').addEventListener","function renderPronunciationLookup"]:
    i=a.find(needle)
    if i < 0:
        print("NOT_FOUND",needle); continue
    candidates=[x for x in [a.find("\nfunction ",i+3),a.find("\nconst ",i+3),a.find("\nwindow.",i+3),a.find("\ndocument.",i+3)] if x>i]
    end=min(candidates) if candidates else min(len(a),i+8000)
    print("CODE_BEGIN",needle)
    print(a[i:end][:9000])
    print("CODE_END",needle)

print("===SHARED TERM NORMALIZATION===")
for needle in ["function applySharedTerms","function applySharedPronunciationVariants","sharedCustom=terms.map","sharedCustom = terms.map","const sharedCustom"]:
    i=a.find(needle)
    print("--"+needle+"--")
    if i>=0:
        candidates=[x for x in [a.find("\nfunction ",i+3),a.find("\nconst ",i+3),a.find("\nwindow.",i+3)] if x>i]
        end=min(candidates) if candidates else min(len(a),i+9000)
        print(a[i:end][:9000])
    else:
        print("NOT FOUND")
