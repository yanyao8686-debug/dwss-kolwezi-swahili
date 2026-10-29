#!/usr/bin/env python3
"""DWSS 0.9.75: automatically refresh pronunciation lookup after every new term mutation."""
from pathlib import Path
import os,re

ROOT=Path(os.environ.get("DWSS_PUBLIC_DIR","public"))
def need(name):
    p=ROOT/name
    if not p.is_file():raise SystemExit("Missing required asset: "+str(p))
    return p
def once(text,old,new,label):
    n=text.count(old)
    if n!=1:raise SystemExit(f"{label}: expected exactly one match, got {n}")
    return text.replace(old,new,1)

for f in ("VERSION.txt","sw.js","index.html","app.js","boot.js","dictionary.js.gz",
          "dictionary-overrides.js","shared-lexicon.js","supabase.min.js","manifest.webmanifest",
          "hanzi-pinyin.js","pronunciation-search.js","_headers","COPYRIGHT_AND_LICENSE.txt"):
    need(f)

vp=need("VERSION.txt")
v=once(vp.read_text(encoding="utf-8"),"Version: 0.9.74","Version: 0.9.75","VERSION.txt")
v=re.sub(r"^Release date: .*$","Release date: 2026-10-29",v,count=1,flags=re.M)
v += "\n0.9.75: Refresh the phonetic lookup immediately after every personal term add, edit, delete or import; new terms automatically enter the same all-lexicon pronunciation index.\n"
vp.write_text(v,encoding="utf-8")

sp=need("sw.js")
sw=once(sp.read_text(encoding="utf-8"),"const APP_VERSION = '0.9.74';","const APP_VERSION = '0.9.75';","Service Worker")
if "./hanzi-pinyin.js" not in sw or "./pronunciation-search.js" not in sw:
    raise SystemExit("Pronunciation modules must remain in offline pre-cache.")
sp.write_text(sw,encoding="utf-8")

ap=need("app.js")
app=ap.read_text(encoding="utf-8")
app=once(app,"version:'0.9.74'","version:'0.9.75'","application metadata")

# addCustomEntry and updateCustomEntry already publish this event only after successful local persistence.
# Subscribe centrally so public API calls, form saves and imports all refresh the active lookup.
anchor="}\nfunction renderDictionary(){"
hook=r"""
}
function refreshPronunciationLookup(){
 const panel=$('pronunciation');
 if(panel&&panel.classList.contains('active'))renderPronunciationLookup();
}
// New, edited and imported personal terms enter the same pronunciation index immediately after rebuild().
window.addEventListener('dwss:personal-term-added',refreshPronunciationLookup);
window.addEventListener('dwss:personal-term-removed',refreshPronunciationLookup);
function renderDictionary(){"""
app=once(app,anchor,hook,"pronunciation refresh event hooks")

# Deletion is also an index mutation: notify the same refresh hook after successful save + rebuild.
delete_old="function deleteCustomEntry(id){const previous=custom;const next=custom.filter(c=>c.id!==id);if(next.length===previous.length)return false;custom=next;if(!saveCustom()){custom=previous;return false;}rebuild();return true;}"
delete_new="function deleteCustomEntry(id){const previous=custom;const next=custom.filter(c=>c.id!==id);if(next.length===previous.length)return false;custom=next;if(!saveCustom()){custom=previous;return false;}rebuild();window.dispatchEvent(new CustomEvent('dwss:personal-term-removed',{detail:{id}}));return true;}"
app=once(app,delete_old,delete_new,"personal word deletion event")

required="const entries=all.map(item=>({zh:item.zh,category:item.category,variants:preferredLocalVariants(item)"
if required not in app:
    raise SystemExit("Lookup no longer constructs candidates from the current rebuilt full dictionary.")
if "window.addEventListener('dwss:personal-term-added',refreshPronunciationLookup);" not in app:
    raise SystemExit("Personal term add/update/import listener is missing.")
if "window.addEventListener('dwss:personal-term-removed',refreshPronunciationLookup);" not in app:
    raise SystemExit("Personal term delete listener is missing.")

ap.write_text(app,encoding="utf-8")

hp=need("index.html")
html=hp.read_text(encoding="utf-8")
for old,new,label in (
 ('content="0.9.74">','content="0.9.75">','HTML release metadata'),
 ('DWSS_AUTO_UPDATE_0_9_74','DWSS_AUTO_UPDATE_0_9_75','HTML update marker'),
 ('版本 0.9.74 · 刚果金斯语翻译','版本 0.9.75 · 刚果金斯语翻译','visible version')):
    html=once(html,old,new,label)
n=html.count("dwss-release=0.9.74")
if n<3:raise SystemExit("Expected at least three versioned script URLs.")
html=html.replace("dwss-release=0.9.74","dwss-release=0.9.75")
hp.write_text(html,encoding="utf-8")

print("PASS: the live lookup still rebuilds candidates from the entire current all lexicon.")
print("PASS: personal add/update/import events refresh the lookup after a successful rebuild.")
print("PASS: personal deletion events remove deleted terms from the refreshed lookup.")
print("PASS: shared terms and public pronunciation overrides retain their existing refresh listeners.")
print("PASS: release and Service Worker cache bumped to 0.9.75.")
