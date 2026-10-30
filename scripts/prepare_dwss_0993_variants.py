from pathlib import Path
import re

root=Path("public")
def read(name): return (root/name).read_text(encoding="utf-8")
def write(name, value): (root/name).write_text(value,encoding="utf-8")
def once(text, old, new, label):
    count=text.count(old)
    if count != 1: raise SystemExit(f"{label}: expected exactly one occurrence, found {count}")
    return text.replace(old,new,1)

html=read("index.html")
anchor=''' <div class="translation-correction-status" id="translationCorrectionStatus" role="status" aria-live="polite" hidden></div>'''
candidate_panel=''' <div class="translation-correction-status" id="translationCorrectionStatus" role="status" aria-live="polite" hidden></div>
 <section class="translation-pronunciation-candidates" id="translationPronunciationCandidates" aria-label="其他用户提交的发音候选" hidden>
  <div class="translation-pronunciation-candidates-title">其他用户提交的读音</div>
  <div id="translationPronunciationCandidateList"></div>
 </section>'''
html=once(html,anchor,candidate_panel,"insert live pronunciation candidates")
html=once(html,'>提交修正</button>','>提交读音候选</button>',"candidate submit label")
candidate_css='''
<style id="dwss-translation-pronunciation-candidates-0993">
.translation-pronunciation-candidates{margin-top:9px;padding-top:9px;border-top:1px solid #eadfca}
.translation-pronunciation-candidates[hidden]{display:none!important}
.translation-pronunciation-candidates-title{margin:0 0 6px;color:#6e5b37;font-size:11px;font-weight:750}
.translation-pronunciation-candidate{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 9px;margin-top:6px;border:1px solid #e8e0d1;border-radius:10px;background:rgba(255,255,255,.84)}
.translation-pronunciation-candidate-main{min-width:0;flex:1}
.translation-pronunciation-candidate-reading{color:#283a54;font-size:16px;font-weight:700;line-height:1.4;overflow-wrap:anywhere}
.translation-pronunciation-candidate-meta{margin-top:2px;color:#87909b;font-size:9px;line-height:1.35}
.translation-pronunciation-candidate-status{display:inline-block;margin-right:5px;padding:2px 6px;border-radius:999px;background:#edf1f5;color:#667588;font-size:9px;font-weight:700}
.translation-pronunciation-candidate-status.common{background:#e4f2e8;color:#36704b}
.translation-pronunciation-candidate-status.confirmed{background:#e8effb;color:#355b91}
.translation-pronunciation-candidate-status.pending{background:#fff2d9;color:#896622}
.translation-pronunciation-candidate-use{flex:0 0 auto;min-height:30px;padding:5px 10px;border:1px solid #d9c48f;border-radius:999px;background:#fff8e8;color:#70531f;font-size:10px;font-weight:700}
#submitTranslationCorrection{min-width:104px}
</style>
'''
html=once(html,"</head>",candidate_css+"\n</head>","candidate panel CSS")
html=once(html,'content="0.9.92"','content="0.9.93"',"HTML release metadata")
html=once(html,"DWSS_AUTO_UPDATE_0_9_92","DWSS_AUTO_UPDATE_0_9_93","HTML update marker")
html=html.replace("dwss-release=0.9.92","dwss-release=0.9.93")
html=once(html,"版本 0.9.92 · 刚果金斯语翻译","版本 0.9.93 · 刚果金斯语翻译","visible app release label")
write("index.html",html)

app=read("app.js")
app=once(app,"version:'0.9.92'","version:'0.9.93'","app version")
old_mapping='''function applySharedPronunciationVariants(rows){
 const next=(Array.isArray(rows)?rows:[]).filter(v=>v&&v.status!=='rejected'&&String(v.pronunciation_cn||'').trim()).map(v=>({
  id:v.id||v.client_submit_id||'',client_submit_id:v.client_submit_id||'',chinese_text:String(v.chinese_text||'').trim(),
  pronunciation_cn:String(v.pronunciation_cn||'').trim(),pinyin_key:String(v.pinyin_key||''),
  dialect:String(v.dialect||'加丹加斯瓦希里语（科卢韦齐）'),status:String(v.status||'pending'),source_note:String(v.source_note||''),__pending:!!v.__pending
 }));
 const signature=JSON.stringify(next);
 if(signature===JSON.stringify(sharedPronunciationVariants))return;
 sharedPronunciationVariants=next;rebuild();renderDictionary();renderPronunciationLookup();
 if($('inputText')&&$('inputText').value.trim())renderTranslation({recordHistory:false});
}'''
new_mapping='''function applySharedPronunciationVariants(rows){
 const field=$('resultReading');
 const preserveDraft=!!(field&&(document.activeElement===field||savingTranslationCorrection));
 const draft=preserveDraft?field.value:'';
 const next=(Array.isArray(rows)?rows:[]).filter(v=>v&&v.status!=='rejected'&&String(v.pronunciation_cn||'').trim()).map(v=>({
  id:v.id||v.client_submit_id||'',client_submit_id:v.client_submit_id||'',chinese_text:String(v.chinese_text||'').trim(),
  pronunciation_cn:String(v.pronunciation_cn||'').trim(),pinyin_key:String(v.pinyin_key||''),
  dialect:String(v.dialect||'加丹加斯瓦希里语（科卢韦齐）'),status:String(v.status||'pending'),
  source_kind:String(v.source_kind||'dictionary'),source_note:String(v.source_note||''),
  created_at:String(v.created_at||''),updated_at:String(v.updated_at||''),__pending:!!v.__pending
 }));
 const signature=JSON.stringify(next);
 if(signature===JSON.stringify(sharedPronunciationVariants))return;
 sharedPronunciationVariants=next;rebuild();renderDictionary();renderPronunciationLookup();
 if($('inputText')&&$('inputText').value.trim()){
  renderTranslation({recordHistory:false});
  if(preserveDraft){field.value=draft;renderTranslationPronunciationCandidates($('inputText').value.trim(),window.DWSSActiveTranslationCorrection);}
 }
}'''
app=once(app,old_mapping,new_mapping,"preserve edits and retain full variant metadata")

candidate_function=r'''function renderTranslationPronunciationCandidates(raw,state){
 const panel=$('translationPronunciationCandidates'),host=$('translationPronunciationCandidateList');
 if(!panel||!host)return;
 const input=String(raw||'').trim(),key=norm(input);
 if(!key){panel.hidden=true;host.innerHTML='';return;}
 const engine=window.DWSSPronunciationSearch;
 const pinyinOf=reading=>engine&&typeof engine.toSyllables==='function'?engine.toSyllables(reading,true).join(' '):'';
 const groups=new Map();
 const rank={common:0,confirmed:1,pending:2,original:3};
 function add(row){
  const reading=String(row.reading||'').trim();if(!reading)return;
  const soundKey=String(row.pinyin_key||'').trim()||pinyinOf(reading)||('reading:'+norm(reading));
  const old=groups.get(soundKey);
  if(!old){groups.set(soundKey,{...row,reading,soundKey});return;}
  if((rank[row.status]??3)<(rank[old.status]??3))groups.set(soundKey,{...row,reading,soundKey,alsoOriginal:old.alsoOriginal||old.status==='original'});
  else if(row.status==='original')old.alsoOriginal=true;
 }
 const exact=sharedPronunciationVariants.filter(v=>norm(v.chinese_text)===key&&String(v.pronunciation_cn||'').trim());
 exact.sort((a,b)=>(rank[a.status]??3)-(rank[b.status]??3)||String(b.updated_at||b.created_at||'').localeCompare(String(a.updated_at||a.created_at||'')));
 for(const item of exact){
  const status=String(item.status||'pending');
  add({reading:item.pronunciation_cn,pinyin_key:item.pinyin_key||'',status,
   label:status==='common'?'常用读法':status==='confirmed'?'已确认':item.__pending?'待联网同步':'待核实',
   meta:item.source_kind==='translation'?'整句候选':'词条候选'});
 }
 const legacy=state&&String(state.overrideReading||'').trim();
 if(legacy)add({reading:legacy,status:'confirmed',label:'旧版云端修正',meta:'历史共享修正'});
 const original=state&&String(state.originalReading||'').trim();
 if(original)add({reading:original,status:'original',label:'原始自动读音',meta:'始终保留，不会被新提交覆盖'});
 const items=[...groups.values()].sort((a,b)=>(rank[a.status]??3)-(rank[b.status]??3)||a.reading.localeCompare(b.reading,'zh-CN'));
 if(!exact.length&&!legacy){panel.hidden=true;host.innerHTML='';return;}
 panel.hidden=false;
 host.innerHTML=items.map((item,index)=>{
  const statusClass=item.status==='common'?'common':item.status==='confirmed'?'confirmed':item.status==='pending'?'pending':'';
  const note=item.alsoOriginal?'与原始自动读音同音，已合并':item.meta||'';
  return '<div class="translation-pronunciation-candidate"><div class="translation-pronunciation-candidate-main"><div class="translation-pronunciation-candidate-reading">'+esc(item.reading)+'</div><div class="translation-pronunciation-candidate-meta"><span class="translation-pronunciation-candidate-status '+statusClass+'">'+esc(item.label||'待核实')+'</span>'+esc(note)+'</div></div><button class="translation-pronunciation-candidate-use" type="button" data-translation-candidate-index="'+index+'">使用</button></div>';
 }).join('');
 host.querySelectorAll('[data-translation-candidate-index]').forEach(button=>button.addEventListener('click',()=>{
  const item=items[Number(button.dataset.translationCandidateIndex)];
  if(!item)return;
  $('resultReading').value=item.reading;
  setTranslationCorrectionStatus('已选中这条候选读音；可直接使用，也可以继续修改后提交。');
 }));
}
'''
app=once(app,"function renderTranslation(options={}){",candidate_function+"\nfunction renderTranslation(options={}){","insert main translation candidate list")

old_display=''' const exactOverride=publicPronunciationOverrides.get(norm(raw))||null;
 const isTranslationOverride=!!(exactOverride&&exactOverride.source_kind==='translation');
 const displayReading=isTranslationOverride?String(exactOverride.local_pronunciation_cn||'').trim():resultText;
 const readingField=$('resultReading');readingField.value=displayReading||'未找到可用的中文谐音';
 readingField.classList.toggle('empty',!displayReading);
 window.DWSSActiveTranslationCorrection={chinese:raw,originalReading:(exactOverride&&exactOverride.original_pronunciation_cn)||resultText,revision:exactOverride?Number(exactOverride.revision||0):0,hasOverride:!!exactOverride,remoteConflict:false};
 const correctionPanel=$('translationCorrectionPanel');if(correctionPanel)correctionPanel.hidden=false;
 const restoreCorrection=$('restoreTranslationCorrection');if(restoreCorrection)restoreCorrection.hidden=!exactOverride;
 const correctionState=$('translationCorrectionStatus');if(correctionState){correctionState.textContent='';correctionState.hidden=true;}'''
new_display=''' const exactOverride=publicPronunciationOverrides.get(norm(raw))||null;
 const exactVariants=sharedPronunciationVariants.filter(v=>norm(v.chinese_text)===norm(raw)&&['common','confirmed'].includes(v.status));
 exactVariants.sort((a,b)=>(a.status==='common'?0:1)-(b.status==='common'?0:1)||String(b.updated_at||b.created_at||'').localeCompare(String(a.updated_at||a.created_at||'')));
 const preferredCommunity=exactVariants[0]||null;
 const isTranslationOverride=!!(exactOverride&&exactOverride.source_kind==='translation');
 const legacyReading=isTranslationOverride?String(exactOverride.local_pronunciation_cn||'').trim():'';
 const displayReading=preferredCommunity?String(preferredCommunity.pronunciation_cn||'').trim():(legacyReading||resultText);
 const originalReading=(exactOverride&&exactOverride.original_pronunciation_cn)||resultText;
 const readingField=$('resultReading');readingField.value=displayReading||'未找到可用的中文谐音';
 readingField.classList.toggle('empty',!displayReading);
 window.DWSSActiveTranslationCorrection={chinese:raw,originalReading,overrideReading:legacyReading,revision:exactOverride?Number(exactOverride.revision||0):0,hasOverride:!!exactOverride,remoteConflict:false};
 const correctionPanel=$('translationCorrectionPanel');if(correctionPanel)correctionPanel.hidden=false;
 const restoreCorrection=$('restoreTranslationCorrection');if(restoreCorrection)restoreCorrection.hidden=!exactOverride;
 const correctionState=$('translationCorrectionStatus');if(correctionState){correctionState.textContent='';correctionState.hidden=true;}
 renderTranslationPronunciationCandidates(raw,window.DWSSActiveTranslationCorrection);'''
app=once(app,old_display,new_display,"prefer reviewed candidates and render candidate list")

start=app.index("async function submitTranslationCorrection(){")
end=app.index("\nasync function restoreTranslationCorrection(){",start)
new_submit=r'''async function submitTranslationCorrection(){
 const state=window.DWSSActiveTranslationCorrection;
 const chinese=$('inputText').value.trim();
 const reading=$('resultReading').value.trim();
 const button=$('submitTranslationCorrection');
 if(!state||!chinese||norm(chinese)!==norm(state.chinese)){setTranslationCorrectionStatus('中文输入已改变，请重新翻译后再提交。','error');return;}
 if(!reading||reading.length>2000){setTranslationCorrectionStatus('请填写 1–2000 个字符的中文谐音。','error');return;}
 const engine=window.DWSSPronunciationSearch;
 const pinyinKey=engine&&typeof engine.toSyllables==='function'?engine.toSyllables(reading,true).join(' '):'';
 if(!pinyinKey){setTranslationCorrectionStatus('无法识别这条中文谐音的完整拼音，请检查汉字写法后再提交。','error');return;}
 const api=window.DWSSSharedLexicon;
 if(!api||typeof api.submitPronunciationVariant!=='function'){
  setTranslationCorrectionStatus('共享发音候选组件尚未就绪，请联网刷新后重试。','error');return;
 }
 savingTranslationCorrection=true;button.disabled=true;button.textContent='正在提交…';
 setTranslationCorrectionStatus('正在检查同音记录并提交候选…');
 try{
  const result=await api.submitPronunciationVariant({
   chinese_text:chinese,pronunciation_cn:reading,pinyin_key:pinyinKey,
   source_kind:'translation',dialect:'加丹加斯瓦希里语（科卢韦齐）',
   source_note:'主翻译界面人工纠音'
  });
  if(!result||!result.ok){setTranslationCorrectionStatus(result&&result.error?result.error:'发音候选提交失败，请重试。','error');return;}
  if(result.duplicate){
   setTranslationCorrectionStatus('相同拼音的读音已存在，已合并为同一候选；没有覆盖原始读音。');
  }else if(result.queued){
   setTranslationCorrectionStatus('候选已暂存在本机，联网后自动同步；原始读音未被覆盖。','warning');
  }else{
   setTranslationCorrectionStatus('新读音已加入云端候选，当前待核实；原始读音未被覆盖。');
  }
  renderTranslationPronunciationCandidates(chinese,window.DWSSActiveTranslationCorrection);
 }catch(error){
  setTranslationCorrectionStatus('提交失败：'+String(error&&error.message||error)+'。原始读音和已有候选均未改变。','error');
 }finally{
  savingTranslationCorrection=false;button.disabled=false;button.textContent='提交读音候选';
 }
}'''
app=app[:start]+new_submit+app[end:]
app=once(app,"button.textContent='提交修正'","button.textContent='提交读音候选'","restore candidate submit button label")
write("app.js",app)

shared=read("shared-lexicon.js")
old='''  const sourceNote = String(input && input.source_note || "").trim();
  if (!chinese || chinese.length > 100) return { ok:false, error:"请填写已收录词条的中文意思（最多 100 字）。" };
  if (!pronunciation || pronunciation.length > 200) return { ok:false, error:"请填写当地中文近似读音（最多 200 字）。" };
  if (!pinyinKey || pinyinKey.length > 400) return { ok:false, error:"无法识别这条中文谐音的完整拼音，请检查输入后重试。" };'''
new='''  const sourceNote = String(input && input.source_note || "").trim();
  const sourceKind = String(input && input.source_kind || "dictionary");
  const isTranslation = sourceKind === "translation";
  if (sourceKind !== "dictionary" && sourceKind !== "translation") return { ok:false, error:"发音候选类型无效。" };
  if (!chinese || chinese.length > (isTranslation ? 2000 : 100)) return { ok:false, error:isTranslation ? "中文短句最多 2000 字。" : "请填写已收录词条的中文意思（最多 100 字）。" };
  if (!pronunciation || pronunciation.length > (isTranslation ? 2000 : 200)) return { ok:false, error:isTranslation ? "当地中文近似读音最多 2000 字。" : "请填写当地中文近似读音（最多 200 字）。" };
  if (!pinyinKey || pinyinKey.length > (isTranslation ? 16000 : 400)) return { ok:false, error:"无法识别这条中文谐音的完整拼音，请检查输入后重试。" };'''
shared=once(shared,old,new,"allow full translation candidate lengths")
shared=once(shared,
'''    client_submit_id: uid(), chinese_text: chinese, pronunciation_cn: pronunciation,
    pinyin_key: pinyinKey, dialect: dialect || "加丹加斯瓦希里语（科卢韦齐）",
    source_note: sourceNote || null, status: "pending"''',
'''    client_submit_id: uid(), chinese_text: chinese, pronunciation_cn: pronunciation,
    pinyin_key: pinyinKey, dialect: dialect || "加丹加斯瓦希里语（科卢韦齐）",
    source_note: sourceNote || null, source_kind: sourceKind, status: "pending"''',
"include candidate source type in payload")
shared=once(shared,
'''    if (result.data) mergePronunciationVariant(result.data);''',
'''    if (result.data && result.data.variant) mergePronunciationVariant(result.data.variant);''',
"merge queued candidate response row correctly")
write("shared-lexicon.js",shared)

sw=read("sw.js")
sw=once(sw,"const APP_VERSION = '0.9.92';","const APP_VERSION = '0.9.93';","service worker release")
write("sw.js",sw)
version=read("VERSION.txt")
version=once(version,"Version: 0.9.92","Version: 0.9.93","release version")
version=re.sub(r"^Release date: .*$","Release date: 2026-10-30",version,count=1,flags=re.M)
version += "\n0.9.93: Main translation corrections are submitted as shared pronunciation candidates instead of replacing a single current reading. Same Mandarin pinyin sequences are deduplicated; distinct/near-sound readings remain separate candidates. Candidate rows are visible under the translation result, pending readings are not automatically forced on users, and only reviewed common/confirmed exact-phrase variants are preferred for future translations. Offline submissions use the existing local queue.\n"
write("VERSION.txt",version)

assert 'id="translationPronunciationCandidates"' in html
assert '>提交读音候选</button>' in html
assert "source_kind:'translation'" in app
assert "submitPronunciationVariant" in app
assert "updateTranslation(" not in app[app.index("async function submitTranslationCorrection"):app.index("async function restoreTranslationCorrection")]
assert "source_kind: sourceKind" in shared
assert "mergePronunciationVariant(result.data.variant)" in shared
assert "APP_VERSION = '0.9.93'" in sw
assert "DWSS_AUTO_UPDATE_0_9_93" in html
print("PASS DWSS 0.9.93: multiple cloud candidates, same-sound deduplication, near-sound separation, offline queue, and reviewed-first rendering.")
