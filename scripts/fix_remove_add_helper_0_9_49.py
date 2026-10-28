from pathlib import Path
P=Path("public")
def r(n): return (P/n).read_text(encoding="utf-8")
def w(n,s): (P/n).write_text(s,encoding="utf-8")
def once(s,a,b,label):
    n=s.count(a)
    if n!=1: raise SystemExit(f"{label}: expected one match, found {n}")
    return s.replace(a,b,1)
a=r("app.js")
old="""   if(variants.length){segments.push({type:'local',zh:input.slice(i,i+foundLen),canonical:found.zh,reading:variants.map(v=>v.reading).join(VARIANT_SEPARATOR),latin,source:variants.map(v=>v.source||'原始资料').join('；'),variants,item:found});localChars+=foundLen;localHits++;}"""
new="""   if(variants.length){const chosen=variants[0];segments.push({type:'local',zh:input.slice(i,i+foundLen),canonical:found.zh,reading:chosen.reading,latin,source:chosen.source||'原始资料',variants,item:found});localChars+=foundLen;localHits++;}"""
a=once(a,old,new,"select first local reading")
a=once(a,"const detailParts=[];if(s.variants&&s.variants.length>1)detailParts.push('同一中文意思，不同当地读音（依次分隔）');if(s.source)detailParts.push('斯语来源：'+s.source);","const detailParts=[];if(s.source)detailParts.push('斯语来源：'+s.source);","remove multiple-reading detail")
a=once(a,"version:'0.9.50'","version:'0.9.51'","app version")
w("app.js",a)
sw=once(r("sw.js"),"const APP_VERSION = '0.9.50';","const APP_VERSION = '0.9.51';","service worker")
w("sw.js",sw)
h=r("index.html")
h=once(h,'content="0.9.50"','content="0.9.51"',"meta version")
h=once(h,'DWSS_AUTO_UPDATE_0_9_50','DWSS_AUTO_UPDATE_0_9_51',"auto update marker")
h=once(h,'版本 0.9.50 · DWSS 智能翻译 PWA','版本 0.9.51 · DWSS 智能翻译 PWA',"visible version")
w("index.html",h)
v=once(r("VERSION.txt"),"Version: 0.9.50","Version: 0.9.51","VERSION")
v+="\n0.9.51: For each matched Chinese headword, the translation result now displays only the first preferred local Swahili Chinese homophone; it no longer appends alternative readings into the spoken result box.\n"
w("VERSION.txt",v)
print("PASS: one preferred Swahili reading per matched Chinese headword.")
