#!/usr/bin/env python3
from pathlib import Path
import csv, gzip, json, os, re, unicodedata

ROOT=Path(os.environ.get("DWSS_PUBLIC_DIR","public"))
REPO=Path(os.environ.get("DWSS_REPO_DIR","."))
SUPPLEMENT=REPO/"data"/"source_terms_restore_0_9_69.csv"
OLD="0.9.68"
NEW="0.9.69"

def need(name):
 p=ROOT/name
 if not p.is_file(): raise SystemExit("Missing required asset: "+str(p))
 return p

def norm(value):
 value=unicodedata.normalize("NFKC",str(value or "")).lower()
 return re.sub(r"[\s，。！？；：、,.!?;:（）()“”\"'‘’]","",value)

def replace_once(text,old,new,label):
 if text.count(old)!=1: raise SystemExit(f"{label}: expected one marker, found {text.count(old)}")
 return text.replace(old,new,1)

for name in ("index.html","boot.js","app.js","sw.js","VERSION.txt","dictionary.js.gz","manifest.webmanifest"):
 need(name)
if not SUPPLEMENT.is_file(): raise SystemExit("Missing audited source supplement: "+str(SUPPLEMENT))

# Add only records proven missing in the direct source-to-index comparison.
gz=need("dictionary.js.gz")
source=gzip.decompress(gz.read_bytes()).decode("utf-8")
m=re.fullmatch(r"\s*window\.SW_DB\s*=\s*(\[.*\])\s*;\s*",source,re.S)
if not m: raise SystemExit("Unexpected compressed dictionary format.")
db=json.loads(m.group(1))
if len(db)<2000: raise SystemExit("Built-in dictionary unexpectedly small.")
by={}
for item in db:
 k=norm(item.get("zh",""))
 if k and k not in by: by[k]=item
with SUPPLEMENT.open(encoding="utf-8-sig",newline="") as f: rows=list(csv.DictReader(f))
if len(rows)!=51: raise SystemExit(f"Expected 51 audit candidates, got {len(rows)}.")
restored=0
for row in rows:
 zh=str(row.get("chinese","")).strip()
 reading=str(row.get("reading","")).strip()
 if not zh or not reading: raise SystemExit("Empty source head/reading: "+str(row.get("source_id")))
 key=norm(zh)
 item=by.get(key)
 if item is None:
  item={"zh":zh,"variants":[]}; db.append(item); by[key]=item
 variants=item.setdefault("variants",[])
 if any(norm(v.get("reading",""))==norm(reading) for v in variants): continue
 src=str(row.get("source","")).strip()
 page=str(row.get("page","")).strip()
 if page: src+=f" 第{page}页"
 variants.append({
  "reading":reading,"source":src,"kind":"原始资料补录",
  "sourceRecordId":str(row.get("source_id","")).strip(),
  "sourceRawText":str(row.get("raw","")).strip(),
  "verificationStatus":str(row.get("verification","")).strip(),
  "sourceCategory":str(row.get("category","")).strip()
 })
 restored+=1
if restored!=47: raise SystemExit(f"Expected 47 missing first-document variants, restored {restored}.")
for row in rows:
 item=by.get(norm(row["chinese"]))
 if not item or not any(norm(v.get("reading",""))==norm(row["reading"]) for v in item.get("variants",[])):
  raise SystemExit("Source record still absent: "+row["source_id"])
payload="window.SW_DB = "+json.dumps(db,ensure_ascii=False,separators=(",",":"))+";"
gz.write_bytes(gzip.compress(payload.encode("utf-8"),compresslevel=9,mtime=0))

# Bump web release and Service Worker cache.
vp=need("VERSION.txt")
version=vp.read_text(encoding="utf-8")
version=replace_once(version,f"Version: {OLD}",f"Version: {NEW}","VERSION.txt")
version=re.sub(r"^Release date: .*$","Release date: 2026-10-29",version,count=1,flags=re.M)
version+=f"\n{NEW}: Restore 47 missing first-document source records; closable first-open announcement; force versioned resources to bypass stale app caches.\n"
vp.write_text(version,encoding="utf-8")

swp=need("sw.js")
sw=swp.read_text(encoding="utf-8")
sw=replace_once(sw,f"const APP_VERSION = '{OLD}';",f"const APP_VERSION = '{NEW}';","Service Worker version")
swp.write_text(sw,encoding="utf-8")

# Versioned requests bypass stale WebView/Chrome/Safari caches.
bp=need("boot.js")
boot=bp.read_text(encoding="utf-8")
boot=replace_once(boot,"    const response = await fetch('./dictionary.js.gz');",
"""    const release = (document.querySelector('meta[name="dwss-auto-update"]') || {}).content || '0.9.69';
    const versioned = file => file + '?dwss-release=' + encodeURIComponent(release);
    const response = await fetch(versioned('./dictionary.js.gz'), {cache:'no-store'});""","dictionary bootstrap")
boot=replace_once(boot,"        script.src = src;","        script.src = versioned(src);","dynamic script loader")
bp.write_text(boot,encoding="utf-8")

# Product metadata and broader dictionary-search matching.
ap=need("app.js")
app=ap.read_text(encoding="utf-8")
app=replace_once(app,
"const PRODUCT_META = Object.freeze({id:'com.dwss.kolwezi.swahili',name:'DWSS 科卢韦齐斯瓦西里语助手',owner:'DWSS / 陈谍',version:'0.9.63'});",
"const PRODUCT_META = Object.freeze({id:'com.dwss.kolwezi.swahili',name:'刚果金斯语翻译',owner:'德威安全官陈谍',version:'0.9.69'});",
"app metadata")
old="""function renderDictionary(){
 const q=norm($('dictSearch').value),cat=$('category').value;
 const filtered=all.filter(x=>(!q||norm(x.zh).includes(q)||norm(x.variants.map(v=>v.reading||'').join(' ')).includes(q)||norm(x.variants.map(v=>v.frenchReadingZh||'').join(' ')).includes(q)||norm(x.variants.map(v=>v.latin||'').join(' ')).includes(q))&&(cat==='all'||x.category===cat));"""
new="""function renderDictionary(){
 const searchNorm=value=>norm(value).replace(/[.…⋯]/g,'');
 const q=searchNorm($('dictSearch').value),cat=$('category').value;
 const filtered=all.filter(x=>(!q||[
  x.zh,
  x.variants.map(v=>v.reading||'').join(' '),
  x.variants.map(v=>v.frenchReadingZh||'').join(' '),
  x.variants.map(v=>v.latin||'').join(' '),
  x.variants.map(v=>[v.source||'',v.sourceRawText||'',v.kind||''].join(' ')).join(' ')
 ].some(value=>searchNorm(value).includes(q)))&&(cat==='all'||x.category===cat));"""
app=replace_once(app,old,new,"dictionary search")
ap.write_text(app,encoding="utf-8")

# Main HTML title/version and versioned bootstrap URLs.
ip=need("index.html")
html=ip.read_text(encoding="utf-8")
for old,new,label in (
 ('<meta name="dwss-auto-update" content="0.9.68">','<meta name="dwss-auto-update" content="0.9.69">',"update metadata"),
 ("<!-- DWSS_AUTO_UPDATE_0_9_68 -->","<!-- DWSS_AUTO_UPDATE_0_9_69 -->","update marker"),
 ("版本 0.9.68 · 刚果金斯语翻译","版本 0.9.69 · 刚果金斯语翻译","visible version")
): html=replace_once(html,old,new,label)
for name in ("supabase.min.js","shared-lexicon.js","boot.js"):
 old=f'<script defer src="./{name}">'
 new=f'<script defer src="./{name}?dwss-release=0.9.69">'
 html=replace_once(html,old,new,name+" script")

# Closable, scrollable first-open announcement. Dismissal is remembered per release.
if "dwss-announcement-overlay" in html: raise SystemExit("Announcement already exists; refusing to duplicate.")
style=r"""
<style id="dwss-announcement-style">
#dwss-announcement-overlay{position:fixed;inset:0;z-index:100000;background:rgba(12,24,42,.62);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}
#dwss-announcement-overlay[hidden]{display:none}
#dwss-announcement-dialog{width:min(620px,100%);max-height:min(86vh,820px);display:flex;flex-direction:column;background:#fffdf8;color:#24344b;border:1px solid #e7d7ae;border-radius:20px;box-shadow:0 24px 80px #08182c66;overflow:hidden}
#dwss-announcement-head{padding:20px 22px 13px;background:linear-gradient(135deg,#fff5d8,#fffdf8);border-bottom:1px solid #eee2c6}
#dwss-announcement-head h2{margin:0;color:#7e351e;font-size:23px;letter-spacing:2px}
#dwss-announcement-head p{margin:6px 0 0;color:#7a8793;font-size:13px}
#dwss-announcement-body{padding:16px 22px;overflow:auto;overscroll-behavior:contain;font-size:15px;line-height:1.85}
#dwss-announcement-body section{margin:0 0 14px}
#dwss-announcement-body h3{margin:0 0 5px;color:#8c4a21;font-size:16px}
#dwss-announcement-body p{margin:0}
#dwss-announcement-platform{margin-top:12px;padding:10px 12px;border-radius:12px;background:#edf5f2;color:#285b4b;font-size:13px}
#dwss-announcement-actions{padding:12px 18px 16px;border-top:1px solid #eee2c6;background:#fffdf8}
#dwss-announcement-close{width:100%;border:0;border-radius:12px;padding:13px 16px;background:#173e52;color:white;font-size:16px;font-weight:700;cursor:pointer}
@media(max-width:520px){#dwss-announcement-overlay{padding:9px}#dwss-announcement-dialog{max-height:88vh;border-radius:16px}#dwss-announcement-head{padding:17px 17px 11px}#dwss-announcement-body{padding:13px 17px;font-size:14px;line-height:1.8}}
</style>
"""
html=replace_once(html,"</head>",style+"\n</head>","announcement CSS")
notice=r"""
<div id="dwss-announcement-overlay" hidden>
 <section id="dwss-announcement-dialog" role="dialog" aria-modal="true" aria-labelledby="dwss-announcement-title">
  <header id="dwss-announcement-head"><h2 id="dwss-announcement-title">应用公告</h2><p>刚果金斯语翻译 · 请阅读后继续使用</p></header>
  <div id="dwss-announcement-body">
   <section><h3>一、开发目的</h3><p>我开发该应用的目的是：刚果金斯语较为特殊，受外来人员语言融合影响，所以部分单词跟肯尼亚和坦桑尼亚的正式斯语发音不是完全一致，而谷歌翻译软件又无法翻译出准确的刚果金斯语。另一个目的是帮助刚入职的新安全官在工作中提高单词记忆能力，也方便其他安全官在工作过程中忘词或忘记读法时查询使用。</p></section>
   <section><h3>二、底版词库来源</h3><p>该应用底版词库来自德威集团的两份斯语学习稿件，所以单词可能不够全面。其他缺失的单词，安全官们可自行添加。</p></section>
   <section><h3>三、云端共享词库</h3><p>该应用的斯语词库为云端自动同步词库。只要有人添加了新词，符合共享条件后就会自动同步到所有安全官的手机上。也就是说，使用该应用的人越多，词库就会越完善。</p></section>
   <section><h3>四、自动更新与离线使用</h3><p>该应用支持软件自动检查、下载并缓存新版资源，不必每次更新都重新下载 APK；同时支持离线使用和离线添加新词。手机在巡逻途中没有网络、又一时忘记单词或读法时，仍可查询已缓存的词库；离线新增的词条会在恢复联网后自动同步。</p></section>
   <div id="dwss-announcement-platform">平台说明：安卓用户使用安卓 APP；苹果用户继续使用 Safari 网页版。本项目不提供 iOS 安装包，两种使用入口分别维护。</div>
  </div>
  <footer id="dwss-announcement-actions"><button id="dwss-announcement-close" type="button">我已阅读，进入应用</button></footer>
 </section>
</div>
<script id="dwss-announcement-controller">
(function(){
 'use strict';
 const overlay=document.getElementById('dwss-announcement-overlay');
 const button=document.getElementById('dwss-announcement-close');
 if(!overlay||!button)return;
 const key='dwss:announcement-dismissed:0.9.69';
 let dismissed=false;
 try{dismissed=localStorage.getItem(key)==='1';}catch(_){}
 function close(){overlay.hidden=true;try{localStorage.setItem(key,'1');}catch(_){}}
 button.addEventListener('click',close);
 overlay.addEventListener('click',event=>{if(event.target===overlay)close();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!overlay.hidden)close();});
 if(!dismissed)overlay.hidden=false;
})();
</script>
"""
html=replace_once(html,"</body>",notice+"\n</body>","announcement modal")
ip.write_text(html,encoding="utf-8")

manifest=json.loads(need("manifest.webmanifest").read_text(encoding="utf-8"))
if manifest.get("display")!="standalone" or manifest.get("id")!="./?app=dwss-kolwezi-swahili":
 raise SystemExit("PWA install identity changed; refusing to modify Apple web app identity.")
if manifest.get("name")!="刚果金斯语翻译" or manifest.get("short_name")!="刚果金斯语翻译":
 raise SystemExit("PWA app name is not the approved product name.")

print(f"PASS: restored {restored} missing first-document readings; 4 additional source rows were already present after Unicode normalization.")
print(f"PASS: dictionary contains {len(db)} records / {sum(len(x.get('variants',[])) for x in db)} variants.")
print("PASS: versioned resources force stale cached scripts and dictionary to request 0.9.69.")
print("PASS: Apple Safari PWA identity is unchanged; Android remains the separate APK route.")
print("PASS: closable first-open announcement contains all four requested sections.")
