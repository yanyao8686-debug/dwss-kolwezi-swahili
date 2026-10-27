from pathlib import Path
P=Path("public")
def r(n): return (P/n).read_text(encoding="utf-8")
def w(n,s): (P/n).write_text(s,encoding="utf-8")
write = w
def once(s,a,b,label):
    if s.count(a)!=1: raise SystemExit(f"{label}: expected one anchor")
    return s.replace(a,b,1)
app=r("app.js")
old="""function preferredLocalVariants(item){
 const variants=(item.variants||[]).filter(v=>(v.reading||v.latin)&&!/[（(]\s*法\s*[)）]/.test(v.reading||''));
 // Priority is fixed: the two original source files, then community-shared local Swahili,
 // then personal local additions. French is never treated as a local-language hit.
 for(const origin of ['personal','shared','builtin']){
  const tier=variants.filter(v=>v.origin===origin);
  if(tier.length)return tier;
 }
 return variants;
}"""
new="""const VARIANT_SEPARATOR = '　｜　';
function preferredLocalVariants(item){
 const rank={personal:0,shared:1,builtin:2};
 const variants=(item.variants||[])
  .filter(v=>(v.reading||v.latin)&&!/[（(]\s*法\s*[)）]/.test(v.reading||''))
  .map((v,index)=>({v,index}))
  .sort((a,b)=>(rank[a.v.origin]??3)-(rank[b.v.origin]??3)||a.index-b.index)
  .map(x=>x.v);
 const seen=new Set();
 return variants.filter(v=>{
  const key=v.reading?'r:'+norm(v.reading):'l:'+norm(v.latin||'');
  if(seen.has(key))return false;
  seen.add(key);return true;
 });
}"""
app=once(app,old,new,"all-source pronunciation selection")
app=once(app,"selected.map(v=>v.reading).join(' / ')","selected.map(v=>v.reading).join(VARIANT_SEPARATOR)","translation separator")
app=app.replace("vs.map(v=>v.reading).filter(Boolean).join(' / ')","vs.map(v=>v.reading).filter(Boolean).join(VARIANT_SEPARATOR)")
app=once(app,"   const detailParts=[];\n   if(s.source)detailParts.push('来源：'+s.source);","   const detailParts=[];\n   if(s.variants&&s.variants.length>1)detailParts.push('同一中文意思，不同当地读音（依次分隔）');\n   if(s.source)detailParts.push('来源：'+s.source);","variant label")
app=once(app,"function recommendationReading(item){const v=localReadingVariant(item);if(v?.reading)return v.reading;","function recommendationReading(item){const readings=preferredLocalVariants(item).map(v=>v.reading).filter(Boolean);if(readings.length)return readings.join(VARIANT_SEPARATOR);","recommendation all readings")
write("app.js",app)
sw=r("sw.js");write("sw.js",once(sw,"const APP_VERSION = '0.9.44';","const APP_VERSION = '0.9.45';","service worker version"))
app=r("app.js");write("app.js",once(app,"version:'0.9.44'","version:'0.9.45'","app version"))
html=r("index.html")
html=once(html,"版本 0.9.44 · DWSS 智能翻译 PWA","版本 0.9.45 · DWSS 智能翻译 PWA","visible version")
html=once(html,'content="0.9.44"','content="0.9.45"',"meta version")
html=once(html,"DWSS_AUTO_UPDATE_0_9_44","DWSS_AUTO_UPDATE_0_9_45","meta marker")
html=once(html,"<!-- DWSS_AUTO_UPDATE_0_9_45 -->","<!-- DWSS_AUTO_UPDATE_0_9_45 --><!-- DWSS 0.9.45 multiple pronunciation display -->","release marker")
w("index.html",html)
version=once(r("VERSION.txt"),"Version: 0.9.44","Version: 0.9.45","VERSION")
version+="\n0.9.45: merge all distinct personal, shared and original local pronunciations for the same Chinese headword; identical readings display once.\n"
w("VERSION.txt",version)
print("PASS DWSS 0.9.45 multi-pronunciation patch")
