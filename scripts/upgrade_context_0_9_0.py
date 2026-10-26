#!/usr/bin/env python3
"""Upgrade the existing shared-lexicon DWSS Pages build to 0.9.0."""
from pathlib import Path
import re
import sys

root = Path(sys.argv[1] if len(sys.argv) > 1 else "public")

def read(name):
    p = root / name
    if not p.exists():
        raise SystemExit(f"Required release file missing: {name}")
    return p.read_text(encoding="utf-8")

def write(name, content):
    (root / name).write_text(content, encoding="utf-8")

def replace_once(source, old, new, label):
    if new in source:
        return source
    if old not in source:
        raise SystemExit(f"0.9.0 upgrade anchor missing: {label}")
    return source.replace(old, new, 1)

# 1) Context-aware candidate ranking. Original dictionary matching remains first priority.
app = read("app.js")
app = re.sub(r"version:'(?:0\.6\.5|0\.6\.11|0\.7\.0|0\.7\.1|0\.8\.0)'", "version:'0.9.0'", app, count=1)
if "version:'0.9.0'" not in app:
    raise SystemExit("Could not set app metadata version to 0.9.0")

context_block = r'''const CONTEXT_PROFILES = [
 {id:'security',label:'安保/门岗场景',re:/门岗|门卫|保安|警卫|巡逻|值班|执勤|证件|身份证|护照|放行|出入|访客|人员|盘查|看守|守卫|安全检查|厂区|营地/},
 {id:'vehicle',label:'车辆/交通场景',re:/车辆|汽车|卡车|货车|司机|驾驶|车牌|轮胎|车厢|油箱|刹车|停车|道路|交通|出车|进场|出场/},
 {id:'equipment',label:'设备/维修场景',re:/设备|机器|发动机|发电机|电缆|电线|阀门|电源|柴油|汽油|机油|液压|维修|检修|故障|工具|矿机|挖掘机/},
 {id:'medical',label:'医疗/健康场景',re:/医院|医生|护士|病人|受伤|伤口|疼|痛|发烧|疟疾|药|吃药|急救|救护车|头晕|腹痛|流血/},
 {id:'people',label:'人员/工作关系场景',re:/员工|工人|同事|主管|经理|负责人|班长|老板|上班|下班|交班|交接班|集合|开会|报告|工资|请假/},
 {id:'movement',label:'行动/位置场景',re:/过来|过去|进入|出去|离开|撤离|返回|前面|后面|左边|右边|里面|外面|这里|那里|附近|集合点/}
];
function detectContext(text){
 const hits=CONTEXT_PROFILES.filter(x=>x.re.test(String(text||'')));
 return hits.sort((a,b)=>((String(text||'').match(a.re)||[]).length)-((String(text||'').match(b.re)||[]).length)).map(x=>x.id);
}
function candidateContextScore(item,contextIds){
 if(!contextIds.length)return 0;
 const z=item.zh||'';let score=0;
 if(contextIds.includes('security')&&item.category==='安保与工作')score+=12;
 if(contextIds.includes('vehicle')&&/车辆|汽车|司机|交通|轮胎|停车|道路|驾驶/.test(z))score+=14;
 if(contextIds.includes('equipment')&&item.category==='矿山与设备')score+=12;
 if(contextIds.includes('medical')&&item.category==='医疗与健康')score+=14;
 if(contextIds.includes('people')&&/人员|工作人员|员工|工人|领导|主管|老板|上班|下班|集合|报告/.test(z))score+=10;
 if(contextIds.includes('movement')&&/过来|进去|出去|离开|回来|回去|前面|后面|左边|右边|里面|外面|附近/.test(z))score+=10;
 return score;
}
'''
marker = "const RECOMMENDATION_STOP_CHARS = new Set(["
start = app.find(marker)
if start < 0:
    print("DEBUG: recommendation-related source lines:")
    for line in app.splitlines():
        if "recommend" in line.lower() or "candidate" in line.lower():
            print(line[:1200])
    pos = app.find("function recommendAlternativesForUnknown")
    if pos >= 0:
        end = app.find("\\nfunction ", pos + 10)
        print("DEBUG: recommendation function body:")
        print(app[pos:end if end >= 0 else pos + 9000])
    raise SystemExit("0.9.0 upgrade anchor missing: recommendation stop chars")
line_end = app.find("\n", start)
if "const CONTEXT_PROFILES = [" not in app:
    app = app[:line_end+1] + context_block + app[line_end+1:]
app = replace_once(app, "function recommendAlternativesForUnknown(raw){", "function recommendAlternativesForUnknown(raw,contextText=''){", "recommendation function signature")
app = replace_once(app, "if(!q||q.length>16||q.length<2)return [];\n const ranked=new Map();", "if(!q||q.length>24||q.length<2)return [];\n const contextIds=detectContext(contextText);\n const ranked=new Map();", "recommendation query/context")
app = replace_once(app, "  if(!old||priority>old.priority)ranked.set(key,{item,priority,kind,note,reading:recommendationReading(item),source:variant?.source||'词库来源记录'});", "  const contextScore=candidateContextScore(item,contextIds);\n  if(!old||priority+contextScore>old.priority+old.contextScore)ranked.set(key,{item,priority,contextScore,kind,note,reading:recommendationReading(item),source:variant?.source||'词库来源记录'});", "candidate context score")
app = replace_once(app, " return [...ranked.values()].sort((a,b)=>b.priority-a.priority).slice(0,4);", " return [...ranked.values()].sort((a,b)=>(b.priority+b.contextScore)-(a.priority+a.contextScore)||b.priority-a.priority).slice(0,4).map(x=>({...x,contextLabel:contextIds.length?CONTEXT_PROFILES.filter(p=>contextIds.includes(p.id)).map(p=>p.label).join('、'):'未识别明确场景'}));", "context-aware candidate sort")
app = replace_once(app, "function renderUnknownRecommendations(segment){\n const candidates=recommendAlternativesForUnknown(segment.text);", "function renderUnknownRecommendations(segment,contextText=''){\n const candidates=recommendAlternativesForUnknown(segment.text,contextText);", "recommendation rendering signature")
old_recommend_html = "${esc(c.note||'请结合上下文确认')} · 来源：${esc(c.source)}${c.reading&&!c.reading.startsWith('拉丁拼写：')?"
new_recommend_html = "${esc(c.note||'请结合上下文确认')} · 场景：${esc(c.contextLabel)} · 来源：${esc(c.source)}${c.reading&&!c.reading.startsWith('拉丁拼写：')?"
app = replace_once(app, old_recommend_html, new_recommend_html, "recommendation context label")
app = replace_once(app, "${renderUnknownRecommendations(s)}</div></div>`;", "${renderUnknownRecommendations(s,raw)}</div></div>`;", "pass full sentence into recommendation")
# Expose context identification for diagnostics/integration.
app = replace_once(app, "frenchReading:frenchReadingFor,recommend:recommendAlternativesForUnknown};", "frenchReading:frenchReadingFor,recommend:recommendAlternativesForUnknown,detectContext};", "context diagnostics API")
write("app.js", app)

# 2) Apply the 0.8.0 precision interface layer without changing the brand artwork rules.
html = read("index.html")
css = r'''/* DWSS 0.8.0 — precision interface layer; brand artwork intentionally untouched */
:root{--bg:#f4f6fa;--paper:#fff;--ink:#17243b;--muted:#77839a;--line:#e5eaf2;--green:#173b78;--green2:#edf3ff;--shadow:0 8px 26px rgba(18,39,77,.055)}
body{background:linear-gradient(180deg,#edf2fa 0,#f6f7fa 340px,#f6f7fa 100%)}
.app{max-width:1040px}
/* Do not alter .cover-frame / .cover-image: preserve the supplied top artwork */
.top{position:relative;overflow:hidden}
.top:after{content:"";position:absolute;inset:auto -55px -90px auto;width:210px;height:210px;border:1px solid rgba(255,255,255,.09);border-radius:50%;pointer-events:none}
.pwa-card{display:flex;flex-wrap:wrap;align-items:center;gap:5px 14px}.pwa-card .sectionTitle{flex:1 1 100%}.pwa-card #pwaMessage{flex:1 1 220px;margin:2px 0}.pwa-card .actions{margin:0;flex:0 0 auto}
.tabs{padding:7px 5px;border:1px solid rgba(220,228,240,.8);border-radius:15px;box-shadow:0 5px 18px rgba(22,44,83,.035)}
.tab{letter-spacing:.015em}.tab.active{box-shadow:0 4px 12px rgba(23,59,120,.16)}
.card{box-shadow:0 5px 20px rgba(20,42,82,.045)}
#translate>.card:first-child{padding:clamp(16px,2.4vw,23px)}
.textarea{min-height:148px;background:#fcfdff;border-color:#dce4f0}
#translateBtn{position:relative}.actions #translateBtn{flex:1 1 220px}
#resultCard{scroll-margin-top:80px}
#resultReading{font-weight:760;border-color:#dce6f6;background:linear-gradient(135deg,#f7f9fe,#eff4fc)}
.recommendation-item{gap:12px}.recommendation-main{gap:4px}.recommendation-main small{line-height:1.55}
.recommendation-item button{white-space:nowrap}
#dictResults{margin-top:7px}.dictrow{gap:13px}.dictrow:focus-within{background:#f8faff}
.toolbar select{max-width:100%}
button,.tab,.sample,.star{ -webkit-tap-highlight-color:transparent }
button:disabled{opacity:.48;cursor:not-allowed;transform:none}
input,textarea,select{accent-color:#2459a5}
::selection{background:#dce8fb;color:#142e5a}
@media(min-width:760px){.app{padding-bottom:56px}.panel#translate{display:none}.panel#translate.active{display:grid;grid-template-columns:minmax(0,1.06fr) minmax(0,.94fr);gap:14px;align-items:start}.panel#translate>.card{margin-bottom:0}.panel#translate>.card:first-child{position:sticky;top:82px}.panel#translate>.card:nth-child(2){grid-column:1/-1}.panel#translate>#resultCard{grid-column:2;grid-row:1 / span 2}.panel#translate>.card:nth-child(3){grid-column:1/-1}}
@media(max-width:759px){.pwa-card{display:block}.pwa-card .actions{margin-top:8px}.tabs{gap:5px}.tab{font-size:12px}}
@media(max-width:420px){.toprow{gap:9px}.offline{font-size:9px}.actions button{padding:10px 11px}.recommendation-item{align-items:flex-start}.recommendation-item button{padding:7px 8px;font-size:10px}}
@media(prefers-contrast:more){.hint,.small-muted,.dictmeta{color:#53627a}.chip{color:#42516a;border-color:#c8d2e1}}
'''
if "DWSS 0.8.0 — precision interface layer" not in html:
    html = replace_once(html, "</style>", css + "\n</style>", "interface CSS insertion")
html = re.sub(r"版本 0\.(?:6\.11|7\.0|7\.1|8\.0)\s*[·|｜].{0,30}DWSS[^<]*", "版本 0.9.0 · DWSS 智能翻译 PWA", html, count=1)
write("index.html", html)

# 3) Bump cache identity and deployment metadata so installed clients fetch 0.9.0 assets.
sw = read("sw.js")
sw = re.sub(r"const APP_VERSION = '0\.(?:6\.11|7\.0|7\.1|8\.0)';", "const APP_VERSION = '0.9.0';", sw, count=1)
if "const APP_VERSION = '0.9.0';" not in sw:
    raise SystemExit("Could not set service worker cache version")
write("sw.js", sw)
version = read("VERSION.txt")
version = re.sub(r"Version: 0\.(?:6\.11|7\.0|7\.1|8\.0)", "Version: 0.9.0", version, count=1)
if "Version: 0.9.0" not in version:
    version = "DWSS 科卢韦齐斯瓦希里语助手\nVersion: 0.9.0\nBuild: 2026-10-27\n"
write("VERSION.txt", version)
print("DWSS 0.9.0 context ranking, responsive interface and cache version applied.")
