from pathlib import Path
import hashlib
import os
import re
import shutil

root=Path(os.environ.get('DWSS_PUBLIC_DIR','public'))
apk_source=Path(os.environ.get('DWSS_APK_SOURCE','.dwss-android-artifact/刚果金斯语翻译-0.9.80.apk'))
apk_size=5806530
apk_sha256='9df93884f7eafe9e3cf8ba77d61c61e7a1b050360be691d1a39e6999e3fa37f5'
if not apk_source.is_file(): raise SystemExit(f'Missing verified Android APK: {apk_source}')
apk_bytes=apk_source.read_bytes()
if len(apk_bytes)!=apk_size: raise SystemExit(f'Unexpected Android APK size: {len(apk_bytes)}')
if hashlib.sha256(apk_bytes).hexdigest()!=apk_sha256: raise SystemExit('Android APK checksum mismatch')
shutil.copyfile(apk_source,root/'DWSS-Android-0.9.80.apk')

def read(n): return (root/n).read_text(encoding='utf-8')
def write(n,s): (root/n).write_text(s,encoding='utf-8')
def once(s,a,b,label):
    n=s.count(a)
    if n!=1: raise SystemExit(f'{label}: expected exactly one match, found {n}')
    return s.replace(a,b,1)

# Main translation output becomes a real editable textarea, with cloud actions below it.
html=read('index.html')
old='<div class="phonetic empty" id="resultReading">输入中文后，翻译结果中文谐音会显示在这里</div>'
new='''<textarea class="phonetic empty" id="resultReading" rows="3" maxlength="2000" aria-label="可直接修改的斯语中文谐音" placeholder="输入中文后，翻译结果中文谐音会显示在这里" spellcheck="false"></textarea>
<div class="translation-correction-panel" id="translationCorrectionPanel" hidden>
 <div class="translation-correction-help">认为上面的斯语中文谐音不正确？可以直接在黄色输入框内修改，然后提交给云端。</div>
 <div class="translation-correction-actions">
  <button class="primary mini" id="submitTranslationCorrection" type="button">提交修正并同步所有用户</button>
  <button class="plain mini" id="restoreTranslationCorrection" type="button" hidden>恢复自动翻译</button>
 </div>
 <div class="translation-correction-status" id="translationCorrectionStatus" role="status" aria-live="polite" hidden></div>
</div>'''
html=once(html,old,new,'editable translation output')
# Remove the obsolete PWA install prompt from the upper status strip.
pattern=r'''<button\b(?=[^>]*\bid=["']installAppBtn["'])[^>]*>.*?</button>'''
html,n=re.subn(pattern,'',html,count=1,flags=re.S)
if n!=1 or 'id="installAppBtn"' in html: raise SystemExit('Obsolete top PWA install button was not removed.')
# Add styles at the actual document head boundary; do not rely on a particular style-block layout.
styles='''
<style id="dwss-translation-cloud-correction-0991">
#resultCard #resultReading{display:block!important;align-items:initial!important;width:100%!important;min-height:88px!important;height:auto!important;max-height:42vh!important;resize:vertical!important;padding:10px 12px!important;white-space:pre-wrap!important;overflow-wrap:anywhere!important;line-height:1.5!important;text-align:left!important;font-family:inherit!important;box-sizing:border-box!important}
#resultCard #resultReading.empty{display:block!important;font-size:15px!important;font-weight:500!important;color:#93a0b2!important}
#resultCard #resultReading:focus{outline:2px solid rgba(184,141,46,.35)!important;outline-offset:2px!important}
.translation-correction-panel{margin:7px 0 5px;padding:9px 10px;border:1px solid #e7d9b4;border-radius:12px;background:#fffaf0}
.translation-correction-panel[hidden]{display:none!important}
.translation-correction-help{font-size:10px;line-height:1.5;color:#81724f}
.translation-correction-actions{display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin-top:7px}
#submitTranslationCorrection{background:linear-gradient(135deg,#173b78,#2457a0)!important;color:#fff!important;border:1px solid #173b78!important}
#restoreTranslationCorrection{background:#f1f3f6!important;color:#566579!important;border:1px solid #dfe5ec!important}
.translation-correction-status{margin-top:6px;color:#426b4d;font-size:11px;line-height:1.5;overflow-wrap:anywhere}
.translation-correction-status.error{color:#a23e31}
.translation-correction-status.warning{color:#946b23}
@media(max-width:520px){#resultCard #resultReading{font-size:23px!important;min-height:88px!important}.translation-correction-actions button{min-height:36px}}
</style>
'''
html=once(html,'</head>',styles+'\n</head>','translation correction styles insertion')
html=once(html,'content="0.9.89">','content="0.9.91">','HTML release metadata')
html=once(html,'<!-- DWSS_AUTO_UPDATE_0_9_89 -->','<!-- DWSS_AUTO_UPDATE_0_9_91 -->','HTML update marker')
html=once(html,'版本 0.9.89 · 刚果金斯语翻译','版本 0.9.91 · 刚果金斯语翻译','visible release label')
html=html.replace('dwss-release=0.9.89','dwss-release=0.9.91')
# Add/restore the small Android download card at page bottom.
if 'id="dwss-apk-download"' in html: raise SystemExit('APK panel already exists in baseline.')
apk='''
<section id="dwss-apk-download" aria-label="安卓 APP 下载">
  <img class="apk-cover" src="./cover.webp" alt="DWSS 斯语应用封面" width="74" height="74" loading="lazy" decoding="async">
  <p class="apk-title">刚果金斯语翻译 · 安卓 APP</p>
  <p class="apk-meta">版本 0.9.80 · 约 5.81 MB</p>
  <a class="apk-download-btn" href="./DWSS-Android-0.9.80.apk" download="刚果金斯语翻译-0.9.80.apk">下载并安装安卓 APP</a>
  <p class="apk-note">仅适用于 Android 手机</p>
</section>
'''
footers=list(re.finditer(r'<div class="footer">.*?</div>',html,re.S))
if len(footers)!=1: raise SystemExit(f'Expected one footer block, got {len(footers)}')
pos=footers[0].end()
html=html[:pos]+'\n'+apk+html[pos:]
# Keep the compact download CSS previously agreed with the user.
apk_css='''
<style id="dwss-apk-download-style-0991">
#dwss-apk-download{max-width:320px;margin:14px auto 26px;padding:12px 14px 13px;border:1px solid #dfe6ee;border-radius:20px;background:rgba(255,255,255,.88);box-shadow:0 6px 18px rgba(20,42,82,.055);display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center}
#dwss-apk-download .apk-cover{display:block;width:74px;height:74px;object-fit:cover;border-radius:15px;box-shadow:0 3px 10px rgba(0,35,85,.16)}
#dwss-apk-download .apk-title{margin:0;color:#17395e;font-size:13px;line-height:1.35;font-weight:750}
#dwss-apk-download .apk-meta{margin:0;color:#78869a;font-size:10px;line-height:1.4}
#dwss-apk-download .apk-download-btn{display:inline-flex;align-items:center;justify-content:center;min-height:38px;width:min(220px,100%);box-sizing:border-box;margin-top:2px;padding:9px 16px;border:1px solid #d5b45f;border-radius:999px;background:linear-gradient(135deg,#f7e8bd,#e9cf89);color:#5d351d;text-decoration:none;font-size:12px;font-weight:750;box-shadow:0 3px 9px rgba(155,120,39,.11)}
#dwss-apk-download .apk-download-btn:focus-visible{outline:3px solid rgba(207,169,77,.35);outline-offset:3px}
#dwss-apk-download .apk-note{margin:0;color:#929cac;font-size:9px;line-height:1.35}
</style>
'''
html=once(html,'</head>',apk_css+'\n</head>','APK CSS insertion')
write('index.html',html)

# App runtime: cloud sentence overrides are applied only to the exact full input and never leak into substring matching.
app=read('app.js')
app=once(app,"version:'0.9.89'","version:'0.9.91'",'application metadata')
app=once(app,
 " for(const item of grouped.values()) item.publicOverride=publicPronunciationOverrides.get(norm(item.zh))||null;",
 " for(const item of grouped.values()){const override=publicPronunciationOverrides.get(norm(item.zh))||null;item.publicOverride=override&&override.source_kind!=='translation'?override:null;}",
 'keep sentence-only overrides out of token-level dictionary matching')
app=once(app,
 "  $('resultReading').textContent='输入中文后，翻译结果中文谐音会显示在这里';$('resultReading').classList.add('empty');",
 "  $('resultReading').value='';$('resultReading').placeholder='输入中文后，翻译结果中文谐音会显示在这里';$('resultReading').classList.add('empty');window.DWSSActiveTranslationCorrection=null;const correctionPanel=$('translationCorrectionPanel');if(correctionPanel)correctionPanel.hidden=true;",
 'empty translation output')
app=once(app,
 " const resultText=joinParts(resultParts),latin=joinParts(latinParts);\n $('resultReading').textContent=resultText||'未找到可用的中文谐音';\n $('resultReading').classList.toggle('empty',!r.localHits&&!r.frenchHits);",
 " const resultText=joinParts(resultParts),latin=joinParts(latinParts);\n const exactOverride=publicPronunciationOverrides.get(norm(raw))||null;\n const isTranslationOverride=!!(exactOverride&&exactOverride.source_kind==='translation');\n const displayReading=isTranslationOverride?String(exactOverride.local_pronunciation_cn||'').trim():resultText;\n const readingField=$('resultReading');readingField.value=displayReading||'未找到可用的中文谐音';\n readingField.classList.toggle('empty',!displayReading);\n window.DWSSActiveTranslationCorrection={chinese:raw,originalReading:(exactOverride&&exactOverride.original_pronunciation_cn)||resultText,revision:exactOverride?Number(exactOverride.revision||0):0,hasOverride:!!exactOverride,remoteConflict:false};\n const correctionPanel=$('translationCorrectionPanel');if(correctionPanel)correctionPanel.hidden=false;\n const restoreCorrection=$('restoreTranslationCorrection');if(restoreCorrection)restoreCorrection.hidden=!exactOverride;\n const correctionState=$('translationCorrectionStatus');if(correctionState){correctionState.textContent=exactOverride?'当前中文已有云端修正（版本 '+Number(exactOverride.revision||0)+'），所有用户共用。':'可以直接编辑上方谐音并提交云端。';correctionState.className='translation-correction-status';correctionState.hidden=false;}",
 'render exact shared sentence correction')
app=once(app,"$('copyReading').addEventListener('click',()=>copyText($('resultReading').textContent,'copyReading','复制谐音'));",
 "$('copyReading').addEventListener('click',()=>copyText($('resultReading').value,'copyReading','复制谐音'));",'copy editable reading value')
app=once(app," const localOk=$('resultReading').textContent.trim().length>0;",
 " const localOk=$('resultReading').value.trim().length>0;",'translation result health check')
# Dictionary panel list must remain a word-level tool, not turn full-sentence corrections into broken dictionary entries.
app=once(app,
 " const rows=[...publicPronunciationOverrides.values()].sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||'')));",
 " const rows=[...publicPronunciationOverrides.values()].filter(x=>x.source_kind!=='translation'&&map.has(norm(x.chinese_text))).sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||'')));",
 'separate sentence corrections from dictionary editor list')
# Correction status and submit/restore logic.
anchor="$('savePublicPronunciation').addEventListener('click',savePublicPronunciation);"
insert=r'''let savingTranslationCorrection=false;
function setTranslationCorrectionStatus(message,kind=''){
 const host=$('translationCorrectionStatus');if(!host)return;
 host.textContent=message||'';host.className='translation-correction-status'+(kind?' '+kind:'');host.hidden=!message;
}
async function submitTranslationCorrection(){
 const state=window.DWSSActiveTranslationCorrection;
 const chinese=$('inputText').value.trim();
 const reading=$('resultReading').value.trim();
 const button=$('submitTranslationCorrection');
 if(!state||!chinese||norm(chinese)!==norm(state.chinese)){setTranslationCorrectionStatus('中文输入已经改变，请先重新翻译，再修改读音。','error');return;}
 if(state.remoteConflict){setTranslationCorrectionStatus('检测到另一位用户刚刚修改了这句中文。请检查上方读音，并再次修改后提交，避免无意覆盖。','warning');return;}
 if(!reading||reading.length>2000){setTranslationCorrectionStatus('请填写 1–2000 个字符的斯语中文谐音。','error');return;}
 if(!window.DWSSDictionaryOverrides||typeof window.DWSSDictionaryOverrides.updateTranslation!=='function'){
  setTranslationCorrectionStatus('云端修正组件尚未就绪。请联网刷新页面后重试。','error');return;
 }
 if(!navigator.onLine){setTranslationCorrectionStatus('当前处于离线状态，无法同步云端。请恢复网络后再提交。','warning');return;}
 savingTranslationCorrection=true;button.disabled=true;button.textContent='正在同步云端…';
 setTranslationCorrectionStatus('正在保存整句修正并通知其他用户…');
 try{
  await window.DWSSDictionaryOverrides.updateTranslation({
   chinese_text:chinese,
   original_pronunciation_cn:state.originalReading||'',
   local_pronunciation_cn:reading,
   expected_revision:state.revision
  });
  setTranslationCorrectionStatus('修正已保存到云端。其他在线用户将自动同步；后来打开应用的用户也会使用这条读音。','');
 }catch(error){
  setTranslationCorrectionStatus(String(error&&error.message||error),'error');
  if(String(error&&error.message||error).includes('刚刚已被其他用户修改')){
   try{await window.DWSSDictionaryOverrides.refresh();}catch(_){ }
  }
 }finally{
  savingTranslationCorrection=false;button.disabled=false;button.textContent='提交修正并同步所有用户';
 }
}
async function restoreTranslationCorrection(){
 const state=window.DWSSActiveTranslationCorrection;
 const chinese=$('inputText').value.trim();
 const button=$('restoreTranslationCorrection');
 if(!state||!state.hasOverride||norm(chinese)!==norm(state.chinese))return;
 if(!window.confirm('确定恢复这句中文的自动翻译读音吗？云端人工修正将从当前版本移除，所有用户都会恢复自动翻译结果。'))return;
 if(!window.DWSSDictionaryOverrides||typeof window.DWSSDictionaryOverrides.restoreTranslation!=='function'){
  setTranslationCorrectionStatus('云端修正组件尚未就绪，请联网刷新页面。','error');return;
 }
 if(!navigator.onLine){setTranslationCorrectionStatus('当前处于离线状态，无法恢复云端读音。请恢复网络后重试。','warning');return;}
 button.disabled=true;setTranslationCorrectionStatus('正在恢复自动翻译读音…');
 try{
  await window.DWSSDictionaryOverrides.restoreTranslation({chinese_text:chinese,original_pronunciation_cn:state.originalReading||'',expected_revision:state.revision});
  setTranslationCorrectionStatus('已恢复自动翻译结果，其他用户也会同步恢复。');
 }catch(error){setTranslationCorrectionStatus(String(error&&error.message||error),'error');}
 finally{button.disabled=false;}
}
$('submitTranslationCorrection').addEventListener('click',submitTranslationCorrection);
$('restoreTranslationCorrection').addEventListener('click',restoreTranslationCorrection);
$('resultReading').addEventListener('input',()=>{
 const state=window.DWSSActiveTranslationCorrection;
 if(state&&state.remoteConflict){state.remoteConflict=false;setTranslationCorrectionStatus('已保留你的修改。再次提交将基于最新云端版本保存，请先核对上方读音。','warning');}
});
'''
app=once(app,anchor,insert+'\n'+anchor,'wire live cloud sentence correction actions')
# Realtime conflict handling: preserve an actively edited draft and make the operator review before resubmitting.
old_event="""window.addEventListener('dwss:dictionary-overrides-updated',event=>{
 const rows=event&&event.detail&&Array.isArray(event.detail.overrides)?event.detail.overrides:[];
 const next=new Map();for(const row of rows){const key=norm(row.chinese_text||'');if(key&&String(row.local_pronunciation_cn||'').trim())next.set(key,row);}
 publicPronunciationOverrides=next;rebuild();renderDictionary();renderPublicPronunciationOverrides();renderPronunciationLookup();
 if($('inputText')&&$('inputText').value.trim())renderTranslation({recordHistory:false});
});"""
new_event="""window.addEventListener('dwss:dictionary-overrides-updated',event=>{
 const readingField=$('resultReading'),preserveDraft=!!(readingField&&document.activeElement===readingField&&!savingTranslationCorrection);
 const draft=preserveDraft?readingField.value:'';
 const rows=event&&event.detail&&Array.isArray(event.detail.overrides)?event.detail.overrides:[];
 const next=new Map();for(const row of rows){const key=norm(row.chinese_text||'');if(key&&String(row.local_pronunciation_cn||'').trim())next.set(key,row);}
 publicPronunciationOverrides=next;rebuild();renderDictionary();renderPublicPronunciationOverrides();renderPronunciationLookup();
 if($('inputText')&&$('inputText').value.trim()){
  renderTranslation({recordHistory:false});
  if(preserveDraft){readingField.value=draft;const state=window.DWSSActiveTranslationCorrection;if(state)state.remoteConflict=true;setTranslationCorrectionStatus('另一位用户刚刚修改了这句中文。已保留你的输入；请核对后再次编辑并提交。','warning');}
 }
});"""
app=once(app,old_event,new_event,'preserve edits during realtime cloud change')
write('app.js',app)

# Existing cloud module reads new metadata and exposes sentence-specific calls using the same validated endpoint.
module=read('dictionary-overrides.js')
module=once(module,
 'select("normalized_chinese,chinese_text,local_pronunciation_cn,updated_at")',
 'select("normalized_chinese,chinese_text,local_pronunciation_cn,original_pronunciation_cn,revision,source_kind,updated_at")',
 'read cloud revision/original metadata')
module=once(module,
 'window.DWSSDictionaryOverrides={refresh,update:data=>send("update",data),restore:data=>send("restore",data),getAll:()=>rows.map(x=>Object.assign({},x))};',
 'window.DWSSDictionaryOverrides={refresh,update:data=>send("update",data),restore:data=>send("restore",data),updateTranslation:data=>send("update",Object.assign({},data,{source_kind:"translation"})),restoreTranslation:data=>send("restore",Object.assign({},data,{source_kind:"translation"})),getAll:()=>rows.map(x=>Object.assign({},x))};',
 'expose sentence correction cloud methods')
write('dictionary-overrides.js',module)

# Service Worker: bump cache version so all users receive the editable UI and new client module.
sw=read('sw.js')
sw=once(sw,"const APP_VERSION = '0.9.89';","const APP_VERSION = '0.9.91';",'service worker cache version')
sw=once(sw,
 "  if (url.origin !== self.location.origin) return;",
 "  if (url.origin !== self.location.origin) return;\n  // APK is a user-triggered download, not an offline-cache asset.\n  if (url.pathname.toLowerCase().endsWith('.apk')) return;",
 'avoid caching the optional APK download')
write('sw.js',sw)

# Release metadata.
version=read('VERSION.txt')
version=once(version,'Version: 0.9.89','Version: 0.9.91','version file')
version=re.sub(r'^Release date: .*$', 'Release date: 2026-10-30', version, count=1, flags=re.M)
version += "\n0.9.91: Main translation result is directly editable. Exact full-sentence corrections save to the shared public override table and apply to all users; Supabase Realtime refreshes connected users. The original automatic reading is preserved, every correction/restoration is recorded in a private history table, and expected revisions prevent silent concurrent overwrites. Restoring removes the current override and falls back to the original automatic dictionary result.\n"
write('VERSION.txt',version)

# The APK remains an optional download, not a Service Worker precache asset.
assert 'id="translationCorrectionPanel"' in html
assert 'id="submitTranslationCorrection"' in html
assert 'id="restoreTranslationCorrection"' in html
assert 'id="installAppBtn"' not in html
assert 'id="dwss-apk-download"' in html
assert "source_kind==='translation'" in app
assert "updateTranslation:data=>send" in module
assert "revision" in module
assert "const APP_VERSION = '0.9.91';" in sw
assert "endsWith('.apk')" in sw
assert (root/'DWSS-Android-0.9.80.apk').stat().st_size==apk_size
print('PASS DWSS 0.9.91 full-sentence editable cloud correction UI, exact phrase overrides, history and optimistic concurrency hooks.')
