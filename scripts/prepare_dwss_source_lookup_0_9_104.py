from pathlib import Path
import sys,re
root=Path(sys.argv[1] if len(sys.argv)>1 else "public")
p=root/"app.js"; app=p.read_text(encoding="utf-8")
# Normalization and actual input-span consumption must discard exactly the same characters.
s=app.index("function normalizedInputSpan(input,index,target){")
e=app.index("\nfunction lookupLocalAt",s)
app=app[:s]+"""function normalizedInputSpan(input,index,target){
 const wanted=norm(target);if(!wanted)return 0;
 let got='';
 for(let n=0;n<Math.min(input.length-index,Math.max(32,wanted.length*6+16));n++){
  const part=norm(input.slice(index+n,index+n+1));
  if(!part)continue;
  got+=part;if(got===wanted)return n+1;if(!wanted.startsWith(got))return 0;
 }
 return 0;
}"""+app[e:]
# Derive searchable aliases from multi-meaning word heads and parenthetical variants.
helper="""function sourceHeadwordAliases(item){
 const key=String(item&&item.zh||'').trim(),out=new Set(SOURCE_HEADWORD_ALIAS_INDEX.get(norm(key))||[]);
 const add=value=>String(value||'').split(/[、/／]/).forEach(part=>{part=part.replace(/[\\s　]+/g,'').trim();if(part.length>=2&&norm(part)!==norm(key)&&!/[.。…⋯]{2,}/.test(part))out.add(part);});
 add(key);let m;const re=/[（(]([^）)]+)[）)]/g;while((m=re.exec(key)))add(m[1]);
 const outside=key.replace(/[（(][^）)]*[）)]/g,' ').trim();if(outside.length>=2&&norm(outside)!==norm(key))out.add(outside);
 return [...out];
}
"""
if "function sourceHeadwordAliases(item)" not in app: app=app.replace("function rebuild(){",helper+"function rebuild(){",1)
# Recreate alias lookup entries, retaining ambiguous alternatives rather than discarding them.
pat=r"all=\[\.\.\.grouped\.values\(\)\];\s*map=new Map\(all\.map\(x=>\[norm\(x\.zh\),x\]\)\);\s*keys=\[\.\.\.all\]\.sort\(\(a,b\)=>norm\(b\.zh\)\.length-norm\(a\.zh\)\.length\);"
block="""all=[...grouped.values()];map=new Map(all.map(x=>[norm(x.zh),x]));
const matchEntries=all.map(item=>({item,matchKey:item.zh,normalized:norm(item.zh)}));all.forEach(x=>x.aliases=[]);
const owners=new Map();for(const item of all)for(const alias of sourceHeadwordAliases(item)){const k=norm(alias);if(!k||map.has(k))continue;if(!owners.has(k))owners.set(k,{alias,item,items:[item]});else if(!owners.get(k).item===item)owners.get(k).items.push(item);}
for(const [k,o] of owners){if(map.has(k))continue;const alternatives=o.items.slice(1);map.set(k,o.item);o.item.aliases.push(o.alias);matchEntries.push({item:o.item,matchKey:o.alias,normalized:k,alternatives});}
keys=matchEntries.sort((a,b)=>b.normalized.length-a.normalized.length);"""
# handle collisions correctly if second item is distinct
block=block.replace("else if(!owners.get(k).item===item)","else if(!owners.get(k).items.includes(item))")
app,n=re.subn(pat,block,app,count=1)
if n!=1 and "const owners=new Map();" not in app: raise SystemExit("dictionary index block not found")
# Local matcher carries alternative headwords for cases where one short word belongs to two source entries.
s=app.index("function lookupLocalAt(input,index){");e=app.index("\nfunction preferredFrenchPronunciationVariants",s)
app=app[:s]+"""function lookupLocalAt(input,index){
 let found=null,entryFound=null,len=0,rank=99,keyLen=0;const ranks={override:-1,personal:0,shared:1,builtin:2,'pronunciation-variant':3};
 for(const entry of keys){const item=entry.item,k=entry.matchKey;if(!item||!k)continue;const origin=localOrigin(item);if(!origin)continue;const r=ranks[origin];if(r>rank)continue;const n=normalizedInputSpan(input,index,k);if(!n)continue;if(r<rank||(r===rank&&entry.normalized.length>keyLen)){found=item;entryFound=entry;len=n;rank=r;keyLen=entry.normalized.length;}}
 return found?{item:found,length:len,origin:localOrigin(found),alternatives:(entryFound.alternatives||[]).map(x=>x.zh)}:null;
}"""+app[e:]
app=app.replace("const isPunct=ch=>/[\\s，。！？；：、,.!?;:\\-—（）()“”\\\"'‘’]/.test(ch);","const isPunct=ch=>!norm(ch);")
# Original records explicitly marked 法 become French fallbacks, never falsely labeled local Swahili.
s=app.index("function preferredFrenchPronunciationVariants(item){");e=app.index("\nfunction lookupFrenchPronunciationAt",s)
app=app[:s]+"""function preferredFrenchPronunciationVariants(item){
 const rank={personal:0,shared:1,builtin:2},rows=(item.variants||[]).map((v,i)=>{
  const explicit=String(v.frenchReadingZh||'').trim(),marked=/[（(]\\s*法\\s*[)）]/.test(v.reading||'');
  const reading=explicit||(marked?String(v.reading||'').replace(/[（(]\\s*法\\s*[)）]/g,'').trim():'');
  return reading?{v:{...v,frenchReadingZh:reading,sourceFrenchMarker:!explicit&&marked},i}:null;
 }).filter(Boolean).sort((a,b)=>(rank[a.v.origin]??3)-(rank[b.v.origin]??3)||a.i-b.i).map(x=>x.v);
 const seen=new Set();return rows.filter(v=>{const k=norm(v.frenchReadingZh);if(!k||seen.has(k))return false;seen.add(k);return true;});
}"""+app[e:]
# Do not split off the actual punctuation skipped by normalization.
a="segments.push({type:'local',zh:input.slice(i,i+foundLen),canonical:found.zh,reading:duplicate?'':selected.reading,duplicate,latin,source:selected.source||'原始资料',variants:[selected],item:found});"
b="segments.push({type:'local',zh:input.slice(i,i+foundLen),canonical:found.zh,reading:duplicate?'':selected.reading,duplicate,latin,source:selected.source||'原始资料',variants:[selected],item:found,alternatives:localMatch.alternatives||[]});"
if a in app: app=app.replace(a,b,1)
a="const detailParts=[];if(s.source)detailParts.push('斯语来源：'+s.source);"
b="const detailParts=[];if(s.source)detailParts.push('斯语来源：'+s.source);if(s.alternatives&&s.alternatives.length)detailParts.push('此输入还有其他原始词头：'+s.alternatives.join('、')+'；当前显示首个匹配，请结合语境确认。');"
if a in app: app=app.replace(a,b,1)
app=app.replace("version:'0.9.103'","version:'0.9.104'",1);p.write_text(app,encoding="utf-8")
idx=root/"index.html";h=idx.read_text(encoding="utf-8").replace('content="0.9.103"><!-- DWSS_AUTO_UPDATE_0_9_103 -->','content="0.9.104"><!-- DWSS_AUTO_UPDATE_0_9_104 -->',1).replace('id="apkWebVersion">0.9.103</span>','id="apkWebVersion">0.9.104</span>').replace('dwss-release=0.9.103','dwss-release=0.9.104');idx.write_text(h,encoding="utf-8")
sw=root/"sw.js";w=sw.read_text(encoding="utf-8").replace("const APP_VERSION = '0.9.103';","const APP_VERSION = '0.9.104';");sw.write_text(w,encoding="utf-8")
v=root/"VERSION.txt";t=v.read_text(encoding="utf-8").replace("Version: 0.9.103","Version: 0.9.104",1)
t+="\n0.9.104: Exhaustive source lookup; punctuation consumption aligned with normalization; derived composite-headword aliases; ambiguous aliases disclosed; source-marked French fallbacks exposed as French.\n";v.write_text(t,encoding="utf-8")
print("PASS DWSS 0.9.104 patch")
