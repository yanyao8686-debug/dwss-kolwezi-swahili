#!/usr/bin/env python3
"""DWSS 0.9.74: add pronunciation lookup and phonetic similarity search."""
from pathlib import Path
import os, re

ROOT=Path(os.environ.get("DWSS_PUBLIC_DIR","public"))

def need(name):
    path=ROOT/name
    if not path.is_file():raise SystemExit("Missing required asset: "+str(path))
    return path

def once(text,old,new,label):
    count=text.count(old)
    if count!=1:raise SystemExit(f"{label}: expected exactly one match, got {count}")
    return text.replace(old,new,1)

for name in ("index.html","app.js","boot.js","sw.js","VERSION.txt","dictionary.js.gz",
             "dictionary-overrides.js","shared-lexicon.js","supabase.min.js","manifest.webmanifest",
             "_headers","COPYRIGHT_AND_LICENSE.txt","pronunciation-search.js","hanzi-pinyin.js"):
    need(name)

# Release metadata.
vp=need("VERSION.txt")
v=vp.read_text(encoding="utf-8")
v=once(v,"Version: 0.9.72","Version: 0.9.74","VERSION.txt")
v=re.sub(r"^Release date: .*$","Release date: 2026-10-29",v,count=1,flags=re.M)
v += "\n0.9.74: Add a dedicated pronunciation lookup tab; fuzzy-match Chinese homophones against all active local Swahili terms.\n"
vp.write_text(v,encoding="utf-8")

# Cache update and offline modules.
sp=need("sw.js")
sw=sp.read_text(encoding="utf-8")
sw=once(sw,"const APP_VERSION = '0.9.72';","const APP_VERSION = '0.9.74';","Service Worker version")
plain=re.search(r"""(['"])\./dictionary\.js\1""",sw)
if plain:
    q=plain.group(1)
    sw=sw[:plain.start()]+q+"./dictionary.js.gz"+q+sw[plain.end():]
if re.search(r"""(['"])\./dictionary\.js\1""",sw):
    raise SystemExit("Website Service Worker still references missing dictionary.js.")
if not re.search(r"""(['"])\./dictionary\.js\.gz\1""",sw):
    raise SystemExit("Website Service Worker must precache dictionary.js.gz.")
for asset in ("./hanzi-pinyin.js","./pronunciation-search.js"):
    if asset not in sw:
        sw=re.sub(r"(const PRECACHE_URLS = \[[\s\S]*?)(\];)",
                  lambda m:m.group(1)+f"  '{asset}',\n"+m.group(2),sw,count=1)
if "'./hanzi-pinyin.js'" not in sw or "'./pronunciation-search.js'" not in sw:
    raise SystemExit("The pronunciation modules are missing from the Service Worker precache.")
sp.write_text(sw,encoding="utf-8")

# Runtime load order: dictionary is loaded first by boot.js, then pinyin/search modules, then app.js.
bp=need("boot.js")
boot=bp.read_text(encoding="utf-8")
boot=once(boot,
 "for (const src of ['./app.js', './dictionary-overrides.js', './pwa.js']) {",
 "for (const src of ['./hanzi-pinyin.js', './pronunciation-search.js', './app.js', './dictionary-overrides.js', './pwa.js']) {",
 "bootstrap module order")
bp.write_text(boot,encoding="utf-8")

# Navigation entry and dedicated query panel.
hp=need("index.html")
html=hp.read_text(encoding="utf-8")
nav_old='<nav class="tabs"><button class="tab" data-tab="maintenance"><span>添加新词</span></button><button class="tab" data-tab="saved"><span>历史记录</span></button><button class="nav-clear-slot" type="button" aria-label="清空信息">清空信息</button></nav>'
nav_new='<nav class="tabs"><button class="tab" data-tab="maintenance"><span>添加新词</span></button><button class="tab" data-tab="pronunciation"><span>发音查询</span></button><button class="tab" data-tab="saved"><span>历史记录</span></button><button class="nav-clear-slot" type="button" aria-label="清空信息">清空信息</button></nav>'
html=once(html,nav_old,nav_new,"navigation")
panel=r'''<section class="panel" id="pronunciation">
 <div class="card pronunciation-lookup-card">
  <h2>发音查询</h2>
  <p class="hint pronunciation-lookup-hint">输入你记得的斯语中文谐音。系统会按拼音音节进行近似发音匹配，不要求每个字完全相同。例如输入“给朽”或近似写法“给晓”，都能查找“明天（该小）”。</p>
  <input id="pronunciationSearch" class="search" type="search" maxlength="40" autocomplete="off" placeholder="输入中文谐音，例如：给朽" aria-label="输入斯语中文谐音查询发音">
  <div class="pronunciation-lookup-summary"><span class="chip" id="pronunciationCount">输入谐音后立即查询</span><span class="small-muted">支持同音字与近似读音</span></div>
  <div id="pronunciationResults" aria-live="polite"><div class="nores">输入你记得的中文谐音，系统会立即搜索词库中的对应斯语词条。</div></div>
 </div>
</section>
'''
html=once(html,'<section class="panel" id="saved">',panel+'<section class="panel" id="saved">',"pronunciation panel")
style=r'''<style id="dwss-pronunciation-lookup-style">
nav.tabs{grid-template-columns:repeat(4,minmax(0,1fr))!important}
nav.tabs .tab[data-tab="pronunciation"]{font-size:12px!important;font-weight:700!important}
@media(max-width:420px){nav.tabs{grid-template-columns:repeat(4,minmax(0,1fr))!important}nav.tabs .tab[data-tab="pronunciation"]{font-size:11px!important}}
.pronunciation-lookup-card h2{font-size:16px;margin:0 0 8px;color:#173b78}
.pronunciation-lookup-hint{margin:0 0 10px}
.pronunciation-lookup-summary{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:10px 0 4px;flex-wrap:wrap}
.pronunciation-hit{display:flex;gap:10px;align-items:flex-start;padding:13px 0;border-bottom:1px solid #e9edf3}
.pronunciation-hit:last-child{border-bottom:0}
.pronunciation-hit-main{flex:1;min-width:0}
.pronunciation-hit-zh{font-size:16px;font-weight:800;color:#17243b}
.pronunciation-hit-reading{margin-top:4px;color:#173b78;font-size:15px;font-weight:750;line-height:1.55;overflow-wrap:anywhere}
.pronunciation-hit-match{margin-top:4px;color:#60748a;font-size:11px;line-height:1.45;overflow-wrap:anywhere}
.pronunciation-hit-meta{margin-top:3px;color:#8390a0;font-size:10px;line-height:1.5;overflow-wrap:anywhere}
.pronunciation-hit-actions{display:flex;flex-direction:column;gap:5px;flex:0 0 auto}
.pronunciation-hit-actions button{white-space:nowrap}
.pronunciation-match-chip{display:inline-block;margin-left:6px;padding:3px 7px;border-radius:12px;background:#edf3ff;color:#284f83;font-size:10px;font-weight:700;vertical-align:middle}
</style>'''
if 'id="dwss-pronunciation-lookup-style"' not in html:html=html.replace('</head>',style+'\n</head>',1)
else:html=re.sub(r'<style id="dwss-pronunciation-lookup-style">[\s\S]*?</style>',lambda _:style,html,count=1)
html=once(html,"['maintenance','saved','dictionary'].forEach(panelId=>","['maintenance','pronunciation','saved','dictionary'].forEach(panelId=>","panel return navigation")
for old,new,label in (
 ('content="0.9.72">','content="0.9.74">','HTML release meta'),
 ('DWSS_AUTO_UPDATE_0_9_72','DWSS_AUTO_UPDATE_0_9_74','HTML auto update marker'),
 ('版本 0.9.72 · 刚果金斯语翻译','版本 0.9.74 · 刚果金斯语翻译','visible release label')):
    html=once(html,old,new,label)
script_count=html.count('dwss-release=0.9.72')
if script_count<3:raise SystemExit("Expected at least three versioned script URLs.")
html=html.replace('dwss-release=0.9.72','dwss-release=0.9.74')
hp.write_text(html,encoding="utf-8")

# Build the query from the same effective local readings used by the translator:
# built-in, personal, shared-cloud and currently active public overrides.
ap=need("app.js")
app=ap.read_text(encoding="utf-8")
app=once(app,"version:'0.9.72'","version:'0.9.74'","application metadata")
renderer=r'''function renderPronunciationLookup(){
 const host=$('pronunciationResults'),input=$('pronunciationSearch'),count=$('pronunciationCount');
 if(!host||!input||!count)return;
 const query=String(input.value||'').trim();
 if(!query){count.textContent='输入谐音后立即查询';host.innerHTML='<div class="nores">输入你记得的中文谐音，系统会立即搜索词库中的对应斯语词条。</div>';return;}
 const engine=window.DWSSPronunciationSearch;
 if(!engine||typeof engine.search!=='function'){count.textContent='发音模块尚未就绪';host.innerHTML='<div class="nores">发音查询模块尚未加载完成，请重新打开页面。</div>';return;}
 const entries=all.map(item=>({zh:item.zh,category:item.category,variants:preferredLocalVariants(item).filter(v=>String(v.reading||'').trim()).map(v=>({reading:v.reading,latin:v.latin||'',source:v.source||'词库记录',kind:v.kind||''}))}));
 const results=engine.search(query,entries,{limit:20});
 count.textContent='找到 '+results.length+' 条近似结果（当前词库 '+all.length+' 条）';
 host.innerHTML=results.map(result=>{
  const item=map.get(norm(result.zh));
  const readings=item?preferredLocalVariants(item).map(v=>String(v.reading||'').trim()).filter(Boolean):[result.matchedReading];
  const unique=[...new Set(readings)];
  const latin=item?preferredLocalVariants(item).map(v=>String(v.latin||'').trim()).filter(Boolean):[];
  const score=Math.round(result.score*100);
  const matchLabel=score>=99?'读音一致':'近似读音 '+score+'%';
  return '<div class="pronunciation-hit"><div class="pronunciation-hit-main">'
   +'<div class="pronunciation-hit-zh">'+esc(result.zh)+'<span class="pronunciation-match-chip">'+matchLabel+'</span></div>'
   +'<div class="pronunciation-hit-reading">当地斯语中文谐音：'+esc(unique.join(VARIANT_SEPARATOR)||result.matchedReading)+'</div>'
   +'<div class="pronunciation-hit-match">匹配到的读音：'+esc(result.matchedReading)+' · 分类：'+esc(result.category)+'</div>'
   +(latin.length?'<div class="pronunciation-hit-meta">当地拼写：'+esc([...new Set(latin)].join(' / '))+'</div>':'')
   +'<div class="pronunciation-hit-meta">词库来源：'+esc(result.source)+'</div>'
   +'</div><div class="pronunciation-hit-actions"><button class="soft mini" type="button" data-pron-copy="'+esc(unique.join(VARIANT_SEPARATOR)||result.matchedReading)+'">复制读音</button></div></div>';
 }).join('')||'<div class="nores">没有找到足够接近的读音。可以换一个相近的中文同音字再试；系统不会自动编造斯语读音。</div>';
 host.querySelectorAll('[data-pron-copy]').forEach(button=>button.addEventListener('click',async()=>{
  const value=button.dataset.pronCopy||'';let copied=false;
  try{await navigator.clipboard.writeText(value);copied=true;}catch(_){try{const field=document.createElement('textarea');field.value=value;document.body.appendChild(field);field.select();copied=document.execCommand('copy')!==false;field.remove();}catch(__){copied=false;}}
  const original='复制读音';button.textContent=copied?'已复制':'复制失败';setTimeout(()=>{button.textContent=original;},1600);
 }));
}
'''
app=once(app,'function renderDictionary(){',renderer+'function renderDictionary(){',"pronunciation renderer")
app=once(app,
 "function switchTab(tab){document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id===tab));if(tab==='dictionary'){renderDictionary();renderPublicPronunciationOverrides();}if(tab==='saved')renderSaved();if(tab==='maintenance')renderCustomList();}",
 "function switchTab(tab){document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id===tab));if(tab==='dictionary'){renderDictionary();renderPublicPronunciationOverrides();}if(tab==='pronunciation')renderPronunciationLookup();if(tab==='saved')renderSaved();if(tab==='maintenance')renderCustomList();}",
 "tab switching")
app=once(app,'function renderAll(){rebuild();renderDictionary();renderSaved();renderCustomList();}',
          'function renderAll(){rebuild();renderDictionary();renderSaved();renderCustomList();renderPronunciationLookup();}',
          'render-all refresh')
app=once(app,'sharedCustom=next;rebuild();renderDictionary();renderSaved();',
          'sharedCustom=next;rebuild();renderDictionary();renderSaved();renderPronunciationLookup();',
          'shared vocabulary refresh')
app=once(app,'publicPronunciationOverrides=next;rebuild();renderDictionary();renderPublicPronunciationOverrides();',
          'publicPronunciationOverrides=next;rebuild();renderDictionary();renderPublicPronunciationOverrides();renderPronunciationLookup();',
          'public pronunciation refresh')
listener="$('dictSearch').addEventListener('input',()=>{dictVisibleLimit=250;renderDictionary();});$('category').addEventListener('change',()=>{dictVisibleLimit=250;renderDictionary();});"
listener_new=listener+"const pronunciationSearch=$('pronunciationSearch');if(pronunciationSearch){let pronunciationSearchTimer=null;pronunciationSearch.addEventListener('input',()=>{clearTimeout(pronunciationSearchTimer);pronunciationSearchTimer=setTimeout(renderPronunciationLookup,90);});}"
app=once(app,listener,listener_new,"pronunciation input listener")
ap.write_text(app,encoding="utf-8")
print("PASS: patched 0.9.74 pronunciation tab and phonetic search across the active dictionary.")
