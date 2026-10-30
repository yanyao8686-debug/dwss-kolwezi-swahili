#!/usr/bin/env python3
"""DWSS 0.9.82: remove variant help text and the optional region/context field only."""
from pathlib import Path
import os,re

ROOT=Path(os.environ.get("DWSS_PUBLIC_DIR","public"))
def need(name):
    p=ROOT/name
    if not p.is_file():raise SystemExit(f"Missing required asset: {p}")
    return p
def once(text,old,new,label):
    n=text.count(old)
    if n!=1:raise SystemExit(f"{label}: expected exactly one occurrence, found {n}")
    return text.replace(old,new,1)

for name in ("VERSION.txt","sw.js","index.html","app.js","boot.js","pwa.js",
             "dictionary.js.gz","dictionary-overrides.js","shared-lexicon.js",
             "supabase.min.js","manifest.webmanifest","hanzi-pinyin.js",
             "pronunciation-search.js","_headers","COPYRIGHT_AND_LICENSE.txt"):
    need(name)

hp=need("index.html")
html=hp.read_text(encoding="utf-8")
help_text='<div class="field-hint">若这个中文意思已经收录，保存时会询问是否将新读法追加为当地发音变体；不会覆盖原读音。新变体先待确认。</div>'
html=once(html,help_text,"","red-circled pronunciation-variant explanation")
region_field='  <div class="field"><label for="newVariantNote">听到的地区或场景（可选）</label><input id="newVariantNote" maxlength="300" placeholder="例如：科卢韦齐市区常见说法；不要填写人名"></div>\n'
html=once(html,region_field,"","red-circled region/context input")
html=once(html,'.field-hint{font-size:11px;color:#788697;line-height:1.5;margin-top:4px}',"","unused field-hint CSS")
for forbidden in ("newVariantNote","听到的地区或场景","若这个中文意思已经收录","新变体先待确认"):
    if forbidden in html:raise SystemExit("Red-circled UI remains: "+forbidden)
for old,new,label in (
    ('content="0.9.81">','content="0.9.82">',"HTML update metadata"),
    ("<!-- DWSS_AUTO_UPDATE_0_9_81 -->","<!-- DWSS_AUTO_UPDATE_0_9_82 -->","HTML update marker"),
    ("版本 0.9.81 · 刚果金斯语翻译","版本 0.9.82 · 刚果金斯语翻译","visible version")):
    html=once(html,old,new,label)
count=html.count("dwss-release=0.9.81")
if count<3:raise SystemExit(f"Expected at least three versioned script URLs; found {count}.")
html=html.replace("dwss-release=0.9.81","dwss-release=0.9.82")
hp.write_text(html,encoding="utf-8")

ap=need("app.js")
app=ap.read_text(encoding="utf-8")
app=once(app,"variantNote:$('newVariantNote')?$('newVariantNote').value.trim():''};","variantNote:'',","variant note binding")
if "newVariantNote" in app:raise SystemExit("JavaScript still references removed input.")
if "submitPronunciationVariant" not in app or "source_note:d.variantNote||''" not in app:
    raise SystemExit("Pronunciation variant API contract changed unexpectedly.")
app=once(app,"version:'0.9.81'","version:'0.9.82'","application version")
ap.write_text(app,encoding="utf-8")

vp=need("VERSION.txt")
version=once(vp.read_text(encoding="utf-8"),"Version: 0.9.81","Version: 0.9.82","VERSION.txt")
version=re.sub(r"^Release date: .*$","Release date: 2026-10-30",version,count=1,flags=re.M)
version+="\n0.9.82: Remove the redundant pronunciation-variant help paragraph and optional region/context input. Existing-word variant confirmation, pending review, shared submission and local/French pronunciation fields remain unchanged; variant source_note is submitted empty.\n"
vp.write_text(version,encoding="utf-8")

sp=need("sw.js")
sw=once(sp.read_text(encoding="utf-8"),"const APP_VERSION = '0.9.81';","const APP_VERSION = '0.9.82';","Service Worker version")
sp.write_text(sw,encoding="utf-8")
print("PASS: removed the circled explanation, region/context input and its unused CSS.")
print("PASS: retained Chinese meaning, local pronunciation and French pronunciation fields.")
print("PASS: existing-word variant confirmation and shared submission remain; context note is blank.")
print("PASS: PWA cache and release metadata advanced to 0.9.82.")
