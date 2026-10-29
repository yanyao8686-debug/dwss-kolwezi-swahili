#!/usr/bin/env python3
"""DWSS 0.9.76: simplify pronunciation screen and include it in Clear All."""
from pathlib import Path
import os,re

ROOT=Path(os.environ.get("DWSS_PUBLIC_DIR","public"))
def need(name):
    p=ROOT/name
    if not p.is_file():raise SystemExit("Missing required release asset: "+str(p))
    return p
def once(text,old,new,label):
    count=text.count(old)
    if count!=1:raise SystemExit(f"{label}: expected exactly one occurrence, found {count}")
    return text.replace(old,new,1)

for name in ("VERSION.txt","sw.js","index.html","app.js","boot.js",
             "dictionary.js.gz","dictionary-overrides.js","shared-lexicon.js",
             "supabase.min.js","manifest.webmanifest","hanzi-pinyin.js",
             "pronunciation-search.js","_headers","COPYRIGHT_AND_LICENSE.txt"):
    need(name)

vp=need("VERSION.txt")
version=once(vp.read_text(encoding="utf-8"),"Version: 0.9.75","Version: 0.9.76","VERSION.txt")
version=re.sub(r"^Release date: .*$","Release date: 2026-10-29",version,count=1,flags=re.M)
version += "\n0.9.76: Remove pronunciation-screen helper copy and empty-state prompts; Clear All also clears the pronunciation query input.\n"
vp.write_text(version,encoding="utf-8")

sp=need("sw.js")
sw=once(sp.read_text(encoding="utf-8"),"const APP_VERSION = '0.9.75';","const APP_VERSION = '0.9.76';","Service Worker version")
if "./hanzi-pinyin.js" not in sw or "./pronunciation-search.js" not in sw:
    raise SystemExit("Pronunciation search modules must remain in offline cache.")
sp.write_text(sw,encoding="utf-8")

hp=need("index.html")
html=hp.read_text(encoding="utf-8")
long_hint='<p class="hint pronunciation-lookup-hint">输入你记得的斯语中文谐音。系统会按拼音音节进行近似发音匹配，不要求每个字完全相同。例如输入“给朽”或近似写法“给晓”，都能查找“明天（该小）”。</p>'
html=once(html,long_hint,"","remove top red-box explanatory paragraph")
summary='<div class="pronunciation-lookup-summary"><span class="chip" id="pronunciationCount">输入谐音后立即查询</span><span class="small-muted">支持同音字与近似读音</span></div>'
html=once(html,summary,"","remove lower red-box hints and redundant status chip")
initial='<div id="pronunciationResults" aria-live="polite"><div class="nores">输入你记得的中文谐音，系统会立即搜索词库中的对应斯语词条。</div></div>'
html=once(html,initial,'<div id="pronunciationResults" aria-live="polite"></div>',"remove default empty-state instruction")
# Remove any now-unused descriptive CSS rules.
html=html.replace(".pronunciation-lookup-hint{margin:0 0 10px}\n","")
html=html.replace(".pronunciation-lookup-summary{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:10px 0 4px;flex-wrap:wrap}\n","")
for old,new,label in (
 ('content="0.9.75">','content="0.9.76">','HTML version metadata'),
 ('DWSS_AUTO_UPDATE_0_9_75','DWSS_AUTO_UPDATE_0_9_76','HTML update marker'),
 ('版本 0.9.75 · 刚果金斯语翻译','版本 0.9.76 · 刚果金斯语翻译','visible version')):
    html=once(html,old,new,label)
scripts=html.count("dwss-release=0.9.75")
if scripts<3:raise SystemExit("Expected at least three 0.9.75 cache-busted scripts.")
html=html.replace("dwss-release=0.9.75","dwss-release=0.9.76")
if "输入你记得的斯语中文谐音。系统会按拼音音节进行近似发音匹配" in html:
    raise SystemExit("Top explanatory copy was not fully removed.")
if "支持同音字与近似读音" in html or "输入谐音后立即查询" in html or "系统会立即搜索词库中的对应斯语词条" in html:
    raise SystemExit("Pronunciation empty-state helper copy remains.")
hp.write_text(html,encoding="utf-8")

ap=need("app.js")
app=ap.read_text(encoding="utf-8")
app=once(app,"version:'0.9.75'","version:'0.9.76'","application metadata")
app=once(app,
 "const host=$('pronunciationResults'),input=$('pronunciationSearch'),count=$('pronunciationCount');",
 "const host=$('pronunciationResults'),input=$('pronunciationSearch');",
 "lookup DOM references")
app=once(app,
 "if(!host||!input||!count)return;",
 "if(!host||!input)return;",
 "lookup DOM availability")
app=once(app,
 "if(!query){count.textContent='输入谐音后立即查询';host.innerHTML='<div class=\"nores\">输入你记得的中文谐音，系统会立即搜索词库中的对应斯语词条。</div>';return;}",
 "if(!query){host.innerHTML='';return;}",
 "empty query state")
app=once(app,
 "if(!engine||typeof engine.search!=='function'){count.textContent='发音模块尚未就绪';host.innerHTML='<div class=\"nores\">发音查询模块尚未加载完成，请重新打开页面。</div>';return;}",
 "if(!engine||typeof engine.search!=='function'){host.innerHTML='';return;}",
 "search engine wait state")
app=once(app,
 "count.textContent='找到 '+results.length+' 条近似结果（当前词库 '+all.length+' 条）';\n ",
 "",
 "result count removal")
# Clear the pronunciation field through the same existing clear button.
old_clear="""function clearAllInputs(){
 clearTimeout(dwssInputTimer);clearTimeout(dwssMissingHandoffTimer);
 $('inputText').value='';clearEntryForm();
 setMessage('','');
 renderTranslation({recordHistory:false});
}"""
new_clear="""function clearAllInputs(){
 clearTimeout(dwssInputTimer);clearTimeout(dwssMissingHandoffTimer);
 $('inputText').value='';clearEntryForm();
 const pronunciationInput=$('pronunciationSearch');
 if(pronunciationInput){pronunciationInput.value='';renderPronunciationLookup();}
 setMessage('','');
 renderTranslation({recordHistory:false});
}"""
app=once(app,old_clear,new_clear,"clear all inputs")
if "$('pronunciationSearch').value=''" not in app and "pronunciationInput.value=''" not in app:
    raise SystemExit("Clear All does not clear the pronunciation query.")
if "function renderPronunciationLookup()" not in app:
    raise SystemExit("Pronunciation lookup function missing.")
ap.write_text(app,encoding="utf-8")

print("PASS: removed both marked helper-text areas and the empty-state prompt.")
print("PASS: query input moves directly under the pronunciation heading.")
print("PASS: result list stays empty until the user enters a search term.")
print("PASS: Clear All empties the pronunciation query and resets its results.")
print("PASS: version 0.9.76 and Service Worker update marker applied.")
