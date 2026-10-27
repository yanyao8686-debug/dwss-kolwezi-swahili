from pathlib import Path
P=Path("public")
def r(name): return (P/name).read_text(encoding="utf-8")
def w(name,text): (P/name).write_text(text,encoding="utf-8")
def once(text,old,new,label):
    count=text.count(old)
    if count!=1: raise SystemExit(f"{label}: expected exactly one anchor, found {count}")
    return text.replace(old,new,1)

h=r("index.html")
old=""" <div class="formgrid compact-add-form">
  <div class="field"><label for="newZh">中文意思 <span class="required">*</span></label><input id="newZh" maxlength="100" placeholder="例如：夜班" required autocomplete="off"></div>
  <div class="field"><label for="newReading">当地斯语中文谐音 <span class="required">*</span></label><input id="newReading" aria-required="true" maxlength="200" placeholder="填写经科卢韦齐当地人核实的中文读音" required autocomplete="off"></div>
 </div>
 <div class="legacy-entry-fields" hidden aria-hidden="true">
  <input id="newFrench" value=""><input id="newFrenchReadingZh" value=""><input id="newLatin" value="">
  <select id="newCategory"><option selected>其他</option></select>
  <input id="newSource" value="用户手动添加"><input id="newNote" value="">
 </div>"""
new=""" <div class="formgrid compact-add-form">
  <div class="field"><label for="newZh">中文意思 <span class="required">*</span></label><input id="newZh" maxlength="100" placeholder="例如：夜班" required autocomplete="off"></div>
  <div class="field"><label for="newReading">当地斯语中文谐音（可选）</label><input id="newReading" maxlength="200" placeholder="有当地斯语时，填写经科卢韦齐当地人核实的中文读音" autocomplete="off"></div>
  <div class="field"><label for="newFrench">法语备用表达（可选）</label><input id="newFrench" maxlength="200" placeholder="当地斯语没有对应词时，填写法语表达" autocomplete="off"></div>
  <div class="form-note" id="addWordLanguageHint">中文意思必填；当地斯语中文谐音和法语备用表达至少填写一项。翻译时优先使用当地斯语；没有斯语词条时自动用法语补位。法语词也会自动同步到云端共享词库。</div>
 </div>
 <div class="legacy-entry-fields" hidden aria-hidden="true">
  <input id="newFrenchReadingZh" value=""><input id="newLatin" value="">
  <select id="newCategory"><option selected>其他</option></select>
  <input id="newSource" value="用户手动添加"><input id="newNote" value="">
 </div>"""
h=once(h,old,new,"compact add-word form")
css="#maintenance #maintenanceMessage{margin-top:10px;padding:7px 9px;font-size:11px;line-height:1.45}"
h=once(h,css,css+"\n#maintenance .form-note{font-size:11px;line-height:1.55;color:#667085;padding:0 2px}\n#maintenance #newFrench{border-color:#b8c9d7}","French helper style")
h=once(h,'content="0.9.45"','content="0.9.46"',"auto-update meta version")
h=once(h,"DWSS_AUTO_UPDATE_0_9_45","DWSS_AUTO_UPDATE_0_9_46","auto-update marker")
h=once(h,"版本 0.9.45 · DWSS 智能翻译 PWA","版本 0.9.46 · DWSS 智能翻译 PWA","visible version")
h=once(h,"<!-- DWSS_AUTO_UPDATE_0_9_46 -->","<!-- DWSS_AUTO_UPDATE_0_9_46 --><!-- DWSS 0.9.46 shared French fallback -->","release marker")
w("index.html",h)

a=r("app.js")
a=once(a,"const PRODUCT_META = Object.freeze({id:'com.dwss.kolwezi.swahili',name:'DWSS 科卢韦齐斯瓦西里语助手',owner:'DWSS / 陈谍',version:'0.9.45'});",
        "const PRODUCT_META = Object.freeze({id:'com.dwss.kolwezi.swahili',name:'DWSS 科卢韦齐斯瓦里语助手',owner:'DWSS / 陈谍',version:'0.9.46'});".replace("科卢韦齐斯瓦里","科卢韦齐斯瓦西里"),
        "app metadata version")
a=once(a,'''function frenchFor(item){
 const v=(item.variants||[]).find(x=>x.french);
 return v?.french || FRENCH_MAP.get(norm(item.zh)) || '';
}''','''function preferredFrenchVariant(item){
 const rank={personal:0,shared:1,builtin:2};
 return (item.variants||[]).filter(v=>String(v.french||'').trim())
  .map((v,index)=>({v,index}))
  .sort((a,b)=>(rank[a.v.origin]??3)-(rank[b.v.origin]??3)||a.index-b.index)
  .map(x=>x.v)[0]||null;
}
function frenchFor(item){
 const v=preferredFrenchVariant(item);
 return String(v?.french||FRENCH_MAP.get(norm(item.zh))||'').trim();
}''',"French entry priority")
a=once(a,'''function lookupFrenchWithoutLocalOverlap(input,index){
 // Absolute language guard: never return French when any local Swahili entry matches here.
 if(lookupLocalAt(input,index))return null;
 for(const key of FRENCH_KEYS){
  const raw=input.slice(index,index+key.length);
  if(norm(raw)!==key)continue;
  const end=index+key.length;
  let overlap=false;
  for(let pos=index+1;pos<end;pos++){
   if(lookupLocalAt(input,pos)){overlap=true;break;}
  }
  if(!overlap)return {key,french:FRENCH_MAP.get(key)};
 }
 return null;
}
function lookupFrenchNumberAt(input,index){
 for(const key of ['十三','十二','十一','13','12','11']){
  if(norm(input.slice(index,index+key.length))!==norm(key))continue;
  const exactLocal=keys.some(item=>norm(item.zh||'')===norm(key)&&localOrigin(item));
  if(!exactLocal){
   const french=FRENCH_MAP.get(norm(key));
   if(french)return {key,french};
  }
 }
 return null;
}''','''function frenchFallbackCandidates(){
 const byKey=new Map();
 // Personal and shared French-only entries can fill gaps, but never outrank a local Swahili match.
 for(const item of all){
  if(localOrigin(item))continue;
  const variant=preferredFrenchVariant(item);
  if(!variant)continue;
  const key=String(item.zh||'').trim(),normalized=norm(key);
  if(!normalized)continue;
  const rank={personal:0,shared:1,builtin:2};
  byKey.set(normalized,{
   key,french:String(variant.french||'').trim(),
   frenchReadingZh:String(variant.frenchReadingZh||'').trim(),
   source:variant.origin==='shared'?'云端共享词库中的法语补位':'用户新增法语备用词条',
   rank:rank[variant.origin]??3
  });
 }
 // Keep the two original built-in French fallback datasets; custom/cloud entries win same-key conflicts.
 for(const key of FRENCH_KEYS){
  if(!byKey.has(key))byKey.set(key,{key,french:FRENCH_MAP.get(key),frenchReadingZh:'',source:'DWSS 法语辅助词表',rank:4});
 }
 return [...byKey.values()].filter(x=>x.french).sort((a,b)=>b.key.length-a.key.length||a.rank-b.rank);
}
function lookupFrenchWithoutLocalOverlap(input,index){
 if(lookupLocalAt(input,index))return null;
 for(const candidate of frenchFallbackCandidates()){
  const length=candidate.key.length;
  if(norm(input.slice(index,index+length))!==norm(candidate.key))continue;
  let overlap=false;
  for(let pos=index+1;pos<index+length;pos++){
   if(lookupLocalAt(input,pos)){overlap=true;break;}
  }
  if(!overlap)return {...candidate};
 }
 return null;
}
function lookupFrenchNumberAt(input,index){
 for(const key of ['十三','十二','十一','13','12','11']){
  if(norm(input.slice(index,index+key.length))!==norm(key))continue;
  const exactLocal=keys.some(item=>norm(item.zh||'')===norm(key)&&localOrigin(item));
  if(!exactLocal){
   const candidate=frenchFallbackCandidates().find(x=>norm(x.key)===norm(key));
   if(candidate)return {...candidate,key};
  }
 }
 return null;
}''',"dynamic French fallback matching")
a=once(a,"function localFrenchOverride(item){const v=(item.variants||[]).find(x=>x.french);return v?.french||'';}\nfunction localFrenchPronOverride(item){const v=(item.variants||[]).find(x=>x.frenchReadingZh);return v?.frenchReadingZh||'';}",
        "function localFrenchOverride(item){return preferredFrenchVariant(item)?.french||'';}\nfunction localFrenchPronOverride(item){return preferredFrenchVariant(item)?.frenchReadingZh||'';}",
        "French fallback and pronunciation priority")
a=once(a,"function lookupFrenchAt(input,index){\n for(const key of FRENCH_KEYS){const raw=input.slice(index,index+key.length);if(norm(raw)===key)return {key,french:FRENCH_MAP.get(key)};}\n return null;\n}",
        "function lookupFrenchAt(input,index){return lookupFrenchWithoutLocalOverlap(input,index);}",
        "general French lookup")
a=once(a,"const pron=frenchReadingFor(frenchNumber.french);\n   segments.push({type:'french',zh:input.slice(i,i+frenchNumber.key.length),canonical:frenchNumber.key,french:frenchNumber.french,frenchReadingZh:pron,source:'DWSS 法语辅助词表'});",
        "const pron=frenchReadingFor(frenchNumber.french,frenchNumber.frenchReadingZh||'');\n   segments.push({type:'french',zh:input.slice(i,i+frenchNumber.key.length),canonical:frenchNumber.key,french:frenchNumber.french,frenchReadingZh:pron,source:frenchNumber.source||'DWSS 法语辅助词表'});",
        "French number pronunciation source")
a=once(a,"if(fr){const pron=frenchReadingFor(fr.french);segments.push({type:'french',zh:input.slice(i,i+fr.key.length),canonical:fr.key,french:fr.french,frenchReadingZh:pron,source:'DWSS 法语辅助词表'});frenchChars+=fr.key.length;frenchHits++;i+=fr.key.length;continue;}",
        "if(fr){const pron=frenchReadingFor(fr.french,fr.frenchReadingZh||'');segments.push({type:'french',zh:input.slice(i,i+fr.key.length),canonical:fr.key,french:fr.french,frenchReadingZh:pron,source:fr.source||'DWSS 法语辅助词表'});frenchChars+=fr.key.length;frenchHits++;i+=fr.key.length;continue;}",
        "French fallback result output")
w("app.js",a)

pwa=r("pwa.js")
pwa=once(pwa,"['inputText', 'newZh', 'newReading']","['inputText', 'newZh', 'newReading', 'newFrench']","automatic-update French draft preservation")
w("pwa.js",pwa)

sw=r("sw.js")
sw=once(sw,"const APP_VERSION = '0.9.45';","const APP_VERSION = '0.9.46';","service worker cache version")
w("sw.js",sw)

version=once(r("VERSION.txt"),"Version: 0.9.45","Version: 0.9.46","version file")
version+="\n0.9.46: add optional French fallback input to the single add-word form; French-only entries sync to shared_terms as source_language=fr with generated French pronunciation; dynamic personal/cloud French terms are searchable only when no local Swahili entry matches; local Swahili remains first priority.\n"
w("VERSION.txt",version)

assert 'id="newFrench" maxlength="200"' in h
assert 'required autocomplete="off"' not in h[h.index('id="newReading"')-80:h.index('id="newReading"')+220]
assert "function frenchFallbackCandidates()" in a
assert "if(localOrigin(item))continue;" in a
assert "variant.origin==='shared'?'云端共享词库中的法语补位'" in a
assert "newFrench" in pwa
assert "const APP_VERSION = '0.9.46';" in sw
print("PASS: DWSS 0.9.46 French field, cloud synchronization, shared French lookup, and local-Swahili priority patch applied.")
