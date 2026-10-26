#!/usr/bin/env python3
"""Integrate cloud shared terms into DWSS's main read-only translation index."""
from pathlib import Path
import sys

path = Path(sys.argv[1] if len(sys.argv) > 1 else "app.js")
source = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str) -> None:
    global source
    if new in source:
        return
    if old not in source:
        raise SystemExit(f"Cannot apply shared-search patch: missing anchor {label}")
    source = source.replace(old, new, 1)


replace_once("version:'0.6.3'", "version:'0.6.5'", "product version")
replace_once(
    "let custom = loadCustom();\nlet all = [], map = new Map(), keys = [];",
    "let custom = loadCustom();\n// Shared cloud terms are merged into the read-only search index, never into the user's editable custom list.\nlet sharedCustom = [];\nlet all = [], map = new Map(), keys = [];",
    "shared state",
)
replace_once(
    """ for(const c of custom){
  const k=norm(c.zh); if(!k)continue;
  if(!grouped.has(k))grouped.set(k,{zh:c.zh,variants:[],category:c.category||categoryOf(c.zh),customIds:[]});
  const item=grouped.get(k); item.category=c.category||item.category||categoryOf(c.zh); item.customIds.push(c.id);
  item.variants.push({reading:c.reading||'',latin:c.latin||'',french:c.french||'',frenchReadingZh:c.frenchReadingZh||'',source:c.source||'用户手动添加',kind:'用户补充',note:c.note||'',customId:c.id});
 }
 all=[...grouped.values()]; map=new Map(all.map(x=>[norm(x.zh),x])); keys=[...all].sort((a,b)=>norm(b.zh).length-norm(a.zh).length);""",
    """ for(const c of custom){
  const k=norm(c.zh); if(!k)continue;
  if(!grouped.has(k))grouped.set(k,{zh:c.zh,variants:[],category:c.category||categoryOf(c.zh),customIds:[]});
  const item=grouped.get(k); item.category=c.category||item.category||categoryOf(c.zh); item.customIds.push(c.id);
  item.variants.push({reading:c.reading||'',latin:c.latin||'',french:c.french||'',frenchReadingZh:c.frenchReadingZh||'',source:c.source||'用户手动添加',kind:'用户补充',note:c.note||'',customId:c.id});
 }
 // Shared terms supplement the built-in and personal dictionaries. They remain read-only here.
 for(const c of sharedCustom){
  const zh=String(c.zh||'').trim(), k=norm(zh); if(!k)continue;
  if(!grouped.has(k))grouped.set(k,{zh,variants:[],category:CATEGORIES.includes(c.category)?c.category:categoryOf(zh),customIds:[]});
  const item=grouped.get(k);
  const isFrench=c.source_language==='fr';
  item.variants.push({
   reading:isFrench?'':(c.reading||''), latin:isFrench?'':(c.latin||''),
   french:isFrench?(c.french||''):'', frenchReadingZh:isFrench?(c.frenchReadingZh||''):'',
   source:'云端共享词库', kind:'云端共享', note:c.note||'', sharedId:c.id||c.client_submit_id||''
  });
 }
 all=[...grouped.values()]; map=new Map(all.map(x=>[norm(x.zh),x])); keys=[...all].sort((a,b)=>norm(b.zh).length-norm(a.zh).length);""",
    "shared terms in rebuild",
)
replace_once("function renderTranslation(){\n const raw=$('inputText').value.trim();", "function renderTranslation(options={}){\n const raw=$('inputText').value.trim();", "translation options")
replace_once(" saveRecent(raw);\n}\nfunction saveRecent(raw)", " if(options.recordHistory!==false)saveRecent(raw);\n}\nfunction saveRecent(raw)", "translation history flag")
replace_once(
    "const filtered=all.filter(x=>(!q||norm(x.zh).includes(q)||norm(frenchFor(x)).includes(q)||norm(x.variants.map(v=>v.reading||'').join(' ')).includes(q)||norm(x.variants.map(v=>v.latin||'').join(' ')).includes(q))",
    "const filtered=all.filter(x=>(!q||norm(x.zh).includes(q)||norm(frenchFor(x)).includes(q)||norm(x.variants.map(v=>v.reading||'').join(' ')).includes(q)||norm(x.variants.map(v=>v.frenchReadingZh||'').join(' ')).includes(q)||norm(x.variants.map(v=>v.latin||'').join(' ')).includes(q))",
    "dictionary search fields",
)
replace_once(
    "source:customFr?'用户自定义法语备用':'DWSS 法语辅助词表'",
    "source:customFr?(found.variants.some(v=>v.source==='云端共享词库'&&v.french===customFr)?'云端共享词库（法语补位）':'用户自定义法语备用'):'DWSS 法语辅助词表'",
    "French shared attribution",
)
replace_once(
    "function renderAll(){rebuild();renderDictionary();renderSaved();renderCustomList();}",
    """function applySharedTerms(rows){
 const next=(Array.isArray(rows)?rows:[]).map(t=>({
  zh:String(t.chinese_text||'').trim(),
  reading:t.source_language==='sw'?String(t.local_pronunciation_cn||'').trim():'',
  latin:t.source_language==='sw'?String(t.local_text||'').trim():'',
  french:t.source_language==='fr'?String(t.french_text||'').trim():'',
  frenchReadingZh:t.source_language==='fr'?String(t.local_pronunciation_cn||'').trim():'',
  source_language:t.source_language==='fr'?'fr':'sw',
  category:CATEGORIES.includes(String(t.category||'').trim())?String(t.category).trim():categoryOf(String(t.chinese_text||'')),
  note:String(t.notes||'').trim(),
  id:t.id||t.client_submit_id||''
 })).filter(t=>t.zh&&(t.reading||t.latin||t.french));
 const signature=JSON.stringify(next);
 if(signature===JSON.stringify(sharedCustom))return;
 sharedCustom=next;rebuild();renderDictionary();renderSaved();
 if($('inputText')&&$('inputText').value.trim())renderTranslation({recordHistory:false});
}
function bindSharedLexicon(){
 window.addEventListener('dwss:shared-terms-updated',e=>applySharedTerms(e&&e.detail?e.detail.terms:[]));
 if(window.DWSSSharedLexicon&&typeof window.DWSSSharedLexicon.getTerms==='function')applySharedTerms(window.DWSSSharedLexicon.getTerms());
}
function renderAll(){rebuild();renderDictionary();renderSaved();renderCustomList();}""",
    "shared event bridge",
)
replace_once(
    "window.KolweziSwahili={get dictCount(){return all.length;},get customCount(){return custom.length;},get frenchFallbackCount()",
    "window.KolweziSwahili={get dictCount(){return all.length;},get customCount(){return custom.length;},get sharedCount(){return sharedCustom.length;},get frenchFallbackCount()",
    "shared count API",
)
replace_once(
    "renderDictionary();renderSaved();renderCustomList();clearEntryForm();",
    "renderDictionary();renderSaved();renderCustomList();clearEntryForm();bindSharedLexicon();",
    "bind event bridge at startup",
)

path.write_text(source, encoding="utf-8")
print(f"Shared search integration applied to {path} ({len(source)} characters).")
