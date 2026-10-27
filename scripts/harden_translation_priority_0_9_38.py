from pathlib import Path
root=Path("public")
def read(name):
 p=root/name
 if not p.is_file(): raise SystemExit(f"Missing {name}")
 return p.read_text(encoding="utf-8")
def write(name,s): (root/name).write_text(s,encoding="utf-8")
def once(s,old,new,label):
 n=s.count(old)
 if n!=1: raise SystemExit(f"{label}: expected exactly one anchor, found {n}")
 return s.replace(old,new,1)

app=read("app.js")
app=once(app,"version:'0.9.37'","version:'0.9.38'","app version")
# Personal and shared local Swahili entries must outrank the original built-in entries.
old_order="for(const origin of ['builtin','shared','personal'])"
if app.count(old_order)!=2: raise SystemExit(f"local source loops expected 2, found {app.count(old_order)}")
app=app.replace(old_order,"for(const origin of ['personal','shared','builtin'])")
app=once(app,"const rankOf={builtin:0,shared:1,personal:2};","const rankOf={personal:0,shared:1,builtin:2};","local lookup source rank")
app=once(app,
 "function lookupFrenchWithoutLocalOverlap(input,index){\n for(const key of FRENCH_KEYS){",
 "function lookupFrenchWithoutLocalOverlap(input,index){\n // Absolute language guard: never return French when any local Swahili entry matches here.\n if(lookupLocalAt(input,index))return null;\n for(const key of FRENCH_KEYS){",
 "French fallback local-first guard")
app=once(app,
 "if(localV){segments.push({type:'local',zh:input.slice(i,i+foundLen),canonical:found.zh,reading:uniqueLocalVariants(found).filter(v=>v.reading).map(v=>v.reading).join(' / '),latin,source:uniqueLocalVariants(found).filter(v=>v.reading).map(v=>v.source||'原始资料').join('；'),variants:uniqueLocalVariants(found).filter(v=>v.reading),item:found,french:fr});",
 "if(localV){const selected=preferredLocalVariants(found).filter(v=>v.reading);segments.push({type:'local',zh:input.slice(i,i+foundLen),canonical:found.zh,reading:selected.map(v=>v.reading).join(' / '),latin,source:selected.map(v=>v.source||'原始资料').join('；'),variants:selected,item:found,french:fr});",
 "main result displays only highest-priority Swahili source tier")
# New terms imported from a personal backup join the same automatic shared-sync queue as manually added terms.
app=once(app," let added=0,updated=0,skipped=0,legacy=0;"," let added=0,updated=0,skipped=0,legacy=0;\n const toShare=[];","import auto-share queue")
app=once(app,
 "  else {custom.push({...v,id:id||makeId(),createdAt:e.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()});added++;}",
 "  else {const entry={...v,id:id||makeId(),createdAt:e.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),...((v.reading||v.french)?{shareSyncStatus:'pending'}:{})};custom.push(entry);if(v.reading||v.french)toShare.push(entry);added++;}",
 "imported new term marked pending")
app=once(app,
 " rebuild();return {ok:true,added,updated,skipped,legacy};\n}",
 " rebuild();\n for(const entry of toShare)window.dispatchEvent(new CustomEvent('dwss:personal-term-added',{detail:{entry:{...entry}}}));\n return {ok:true,added,updated,skipped,legacy};\n}",
 "imported terms dispatch automatic shared-sync event")
write("app.js",app)

html=read("index.html")
html=once(html,
 "summary.textContent='查看翻译依据与匹配详情（需要时展开）';",
 "summary.textContent='单个斯语读法释义（点击加号展开）：';",
 "details label")
old="#resultCard .dwss-secondary-details>summary{list-style:none;cursor:pointer;color:#718096;font-size:12px;padding:5px 2px}"
new="#resultCard .dwss-secondary-details>summary{list-style:none;cursor:pointer;color:#ff4b12!important;font-size:16px!important;font-weight:800!important;line-height:1.2;padding:5px 2px;text-decoration-line:underline!important;text-decoration-color:#ff4b12!important;text-decoration-thickness:2px!important;text-underline-offset:4px!important;white-space:nowrap!important;word-break:keep-all!important;overflow-wrap:normal!important}"
html=once(html,old,new,"details summary heading typography")
html=once(html,
 'content:"＋";display:inline-block;margin-right:7px;color:#c49b43;font-weight:800',
 'content:"＋";display:inline-block;margin-right:7px;color:#ff4b12;font-weight:800',
 "plus icon color")
html=html.replace("DWSS 0.9.37","DWSS 0.9.38")
if "DWSS 0.9.38" not in html: raise SystemExit("HTML release marker missing")
write("index.html",html)

sw=once(read("sw.js"),"const APP_VERSION = '0.9.37';","const APP_VERSION = '0.9.38';","Service Worker cache version")
write("sw.js",sw)
version=once(read("VERSION.txt"),"Version: 0.9.37","Version: 0.9.38","version file")
version += "\nTranslation priority: personal local Swahili > shared local Swahili > original built-in local Swahili > French fallback. New imported local/French entries are queued for automatic shared sync. Details summary matches the primary orange underlined heading.\n"
write("VERSION.txt",version)
assert "for(const origin of ['personal','shared','builtin'])" in app
assert "const rankOf={personal:0,shared:1,builtin:2};" in app
assert "if(lookupLocalAt(input,index))return null;" in app
assert "const selected=preferredLocalVariants(found).filter(v=>v.reading)" in app
assert "summary.textContent='单个斯语读法释义（点击加号展开）：';" in html
assert "font-size:16px!important" in html and "text-decoration-color:#ff4b12!important" in html
assert "shareSyncStatus:'pending'" in app and "dwss:personal-term-added" in app
print("PASS: DWSS 0.9.38 local-first translation, import auto-share, and matching details heading.")
