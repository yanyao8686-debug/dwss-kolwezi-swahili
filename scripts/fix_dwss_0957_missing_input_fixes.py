from pathlib import Path

ROOT = Path("public")

def replace_once(path, old, new, label):
    file = ROOT / path
    source = file.read_text(encoding="utf-8")
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one source match, got {count}")
    file.write_text(source.replace(old, new, 1), encoding="utf-8")

old_status = '''window.addEventListener('dwss:personal-share-status',e=>{
 const d=e&&e.detail||{};
 if(d.message){setMessage(d.message,d.type||'ok');const summary=$('shareSyncSummary');if(summary)summary.textContent=d.message;}
 const retry=$('retrySharedSync');if(retry)retry.hidden=!['failed','queued'].includes(String(d.status||''));
 if(typeof renderCustomList==='function')renderCustomList();
});'''
new_status = '''const SHARE_STATUS_LABELS={synced:'共享词库：已同步',queued:'共享词库：等待同步',pending:'共享词库：等待同步',connecting:'共享词库：正在同步',failed:'共享词库：同步失败',offline:'共享词库：等待联网','needs-info':'共享词库：待补充当地中文谐音'};
window.addEventListener('dwss:personal-share-status',e=>{
 const d=e&&e.detail||{};
 if(d.message)setMessage(d.message,d.type||'ok');
 const summary=$('shareSyncSummary');if(summary)summary.textContent=SHARE_STATUS_LABELS[String(d.status||'')]||'共享词库：自动同步';
 const retry=$('retrySharedSync');if(retry)retry.hidden=!['failed','queued'].includes(String(d.status||''));
 if(typeof renderCustomList==='function')renderCustomList();
});'''
replace_once("app.js", old_status, new_status, "single-copy share status")

old_nav = '''function switchTab(tab){document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id===tab));if(tab==='dictionary'){renderDictionary();renderPublicPronunciationOverrides();}if(tab==='saved')renderSaved();if(tab==='maintenance')renderCustomList();}
document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));$('openPublicPronunciationEditor').addEventListener('click',()=>{switchTab('dictionary');$('dictSearch').value='';dictVisibleLimit=250;renderDictionary();renderPublicPronunciationOverrides();});
let dwssInputTimer=null;const scheduleDwssLiveTranslation=delay=>{clearTimeout(dwssInputTimer);dwssInputTimer=setTimeout(()=>renderTranslation({recordHistory:false}),delay);};$('inputText').addEventListener('compositionstart',()=>clearTimeout(dwssInputTimer));$('inputText').addEventListener('compositionend',()=>scheduleDwssLiveTranslation(180));$('inputText').addEventListener('input',event=>{if(event&&event.isComposing)return;scheduleDwssLiveTranslation(420);});$('translateBtn').addEventListener('click',renderTranslation);$('clearBtn').addEventListener('click',()=>{$('inputText').value='';renderTranslation();});const saveHistoryBtn=$('saveHistoryBtn');if(saveHistoryBtn)saveHistoryBtn.addEventListener('click',()=>{const t=$('inputText').value.trim();if(t)saveRecent(t);});$('dictSearch').addEventListener('input',()=>{dictVisibleLimit=250;renderDictionary();});$('category').addEventListener('change',()=>{dictVisibleLimit=250;renderDictionary();});$('clearHistory').addEventListener('click',()=>{if(!safeRemove('sw_history'))return;renderSaved();});'''
new_nav = '''function getMissingChineseSegments(raw){
 const r=tokenize(String(raw||'').trim()),seen=new Set(),result=[];
 for(const segment of r.segments){
  const text=String(segment.type==='latinOnly'?segment.zh:segment.type==='unknown'?segment.text:'').trim();
  if(!text||seen.has(text))continue;
  seen.add(text);result.push(text);
 }
 return result;
}
function switchTab(tab){document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id===tab));if(tab==='dictionary'){renderDictionary();renderPublicPronunciationOverrides();}if(tab==='saved')renderSaved();if(tab==='maintenance')renderCustomList();}
function handoffMissingChinese(raw){
 const missing=getMissingChineseSegments(raw);
 if(!missing.length)return false;
 const field=$('newZh'),first=missing[0];
 const hadDraft=!!String(field.value||'').trim();
 if(!hadDraft){
  field.value=first;
 }
 switchTab('maintenance');
 if(hadDraft&&field.value!==first){
  setMessage('检测到未收录中文“'+first+'”。已自动转入添加新词页面；你原来尚未保存的中文草稿已保留，请先保存或清空草稿后补录。','offline');
 }else{
  setMessage('检测到未收录中文“'+first+'”，已自动填入“中文意思”。请填写经当地确认的斯语中文谐音后保存。','offline');
 }
 return true;
}
document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{
 const active=document.querySelector('main .panel.active');
 if(b.dataset.tab==='maintenance'&&active&&active.id==='translate'&&handoffMissingChinese($('inputText').value))return;
 switchTab(b.dataset.tab);
}));$('openPublicPronunciationEditor').addEventListener('click',()=>{switchTab('dictionary');$('dictSearch').value='';dictVisibleLimit=250;renderDictionary();renderPublicPronunciationOverrides();});
let dwssInputTimer=null,dwssMissingHandoffTimer=null;
const scheduleDwssLiveTranslation=delay=>{clearTimeout(dwssInputTimer);dwssInputTimer=setTimeout(()=>renderTranslation({recordHistory:false}),delay);};
const scheduleMissingWordHandoff=delay=>{
 clearTimeout(dwssMissingHandoffTimer);
 const snapshot=$('inputText').value.trim();if(!snapshot)return;
 dwssMissingHandoffTimer=setTimeout(()=>{
  if($('inputText').value.trim()!==snapshot)return;
  const active=document.querySelector('main .panel.active');
  if(active&&active.id==='translate')handoffMissingChinese(snapshot);
 },delay);
};
$('inputText').addEventListener('compositionstart',()=>{clearTimeout(dwssInputTimer);clearTimeout(dwssMissingHandoffTimer);});
$('inputText').addEventListener('compositionend',()=>{scheduleDwssLiveTranslation(180);scheduleMissingWordHandoff(1300);});
$('inputText').addEventListener('input',event=>{if(event&&event.isComposing)return;scheduleDwssLiveTranslation(420);scheduleMissingWordHandoff(1300);});
$('translateBtn').addEventListener('click',()=>{const raw=$('inputText').value;renderTranslation();handoffMissingChinese(raw);});
function clearAllInputs(){
 clearTimeout(dwssInputTimer);clearTimeout(dwssMissingHandoffTimer);
 $('inputText').value='';clearEntryForm();
 setMessage('','');
 renderTranslation({recordHistory:false});
}
$('clearBtn').addEventListener('click',clearAllInputs);
const saveHistoryBtn=$('saveHistoryBtn');if(saveHistoryBtn)saveHistoryBtn.addEventListener('click',()=>{const t=$('inputText').value.trim();if(t)saveRecent(t);});$('dictSearch').addEventListener('input',()=>{dictVisibleLimit=250;renderDictionary();});$('category').addEventListener('change',()=>{dictVisibleLimit=250;renderDictionary();});$('clearHistory').addEventListener('click',()=>{if(!safeRemove('sw_history'))return;renderSaved();});'''
replace_once("app.js", old_nav, new_nav, "missing word handoff and clear all")

old_submit = '''$('entryForm').addEventListener('submit',e=>{
 e.preventDefault();
 const wasEditing=!!editingId,id=editingId,d=formData(),r=wasEditing?updateCustomEntry(id,d):addCustomEntry(d);
 if(!r.ok){setMessage(r.error,'err');return;}
 clearEntryForm();renderAll();if($('inputText')&&$('inputText').value.trim())renderTranslation({recordHistory:false});
 if(String(d.reading||'').trim()||String(d.frenchReadingZh||'').trim()){
  setMessage('已保存在本机，正在同步到所有用户的共享词库…','ok');
 }else{
  setMessage('词条已保存在本机；还没有可共享的中文谐音。请补充斯语或法语中文谐音。','offline');
 }
});'''
new_submit = '''$('entryForm').addEventListener('submit',e=>{
 e.preventDefault();
 const wasEditing=!!editingId,id=editingId,d=formData(),r=wasEditing?updateCustomEntry(id,d):addCustomEntry(d);
 if(!r.ok){setMessage(r.error,'err');return;}
 clearEntryForm();renderAll();if($('inputText')&&$('inputText').value.trim())renderTranslation({recordHistory:false});
 if(String(d.reading||'').trim()||String(d.frenchReadingZh||'').trim()){
  setMessage('已保存在本机，正在同步到所有用户的共享词库…','ok');
 }else{
  setMessage('词条已保存在本机；还没有可共享的中文谐音。请补充斯语或法语中文谐音。','offline');
 }
 const remaining=getMissingChineseSegments($('inputText').value);
 if(remaining.length){$('newZh').value=remaining[0];setMessage('当前输入中还有未收录内容“'+remaining[0]+'”，已自动填入下一条中文意思，请继续补录。','offline');}
});'''
replace_once("app.js", old_submit, new_submit, "continue adding remaining unmatched words")

replace_once("app.js", "version:'0.9.55'", "version:'0.9.57'", "product version")
replace_once("index.html", 'content="0.9.56"><!-- DWSS_AUTO_UPDATE_0_9_56 -->', 'content="0.9.57"><!-- DWSS_AUTO_UPDATE_0_9_57 -->', "PWA update marker")
replace_once("index.html", "版本 0.9.55 · DWSS 智能翻译 PWA", "版本 0.9.57 · DWSS 智能翻译 PWA", "visible release version")
replace_once("index.html", "云端词库：自动同步", "共享词库：自动同步", "compact status label")
replace_once("sw.js", "const APP_VERSION = '0.9.56';", "const APP_VERSION = '0.9.57';", "service worker cache key")

version = ROOT / "VERSION.txt"
info = version.read_text(encoding="utf-8").replace("Version: 0.9.56", "Version: 0.9.57", 1)
note = "0.9.57: Automatically route untranslated Chinese to Add New Word; clear both translation and new-word inputs; show one detailed save message with a compact sync status label.\n"
if note not in info:
    info = info.rstrip() + "\n" + note
version.write_text(info, encoding="utf-8")
print("PASS: DWSS 0.9.57 patch applied to the verified 0.9.56 baseline.")
