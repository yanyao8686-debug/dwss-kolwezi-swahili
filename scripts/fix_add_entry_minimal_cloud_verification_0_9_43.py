from pathlib import Path
import re
P=Path("public")
def r(n):
 p=P/n
 if not p.is_file(): raise SystemExit("Missing "+str(p))
 return p.read_text(encoding="utf-8")
def w(n,s): (P/n).write_text(s,encoding="utf-8")
def once(s,a,b,label):
 n=s.count(a)
 if n!=1: raise SystemExit(label+": expected one anchor; found "+str(n))
 return s.replace(a,b,1)

h=r("index.html")
h,n=re.subn(
 r'<h2 id="entryFormTitle">.*?</h2>\s*<details class="install-help">.*?</details>\s*<div class="maintenance-note" id="personalShareNotice" role="note">.*?</div><form id="entryForm">',
 '<h2 id="entryFormTitle">添加新词</h2><form id="entryForm">',
 h,count=1,flags=re.S)
if n!=1: raise SystemExit("Could not remove the two large explanation blocks")
h,n=re.subn(
 r'<form id="entryForm">.*?</form>',
 '''<form id="entryForm">
 <div class="formgrid compact-add-form">
  <div class="field"><label for="newZh">中文意思 <span class="required">*</span></label><input id="newZh" maxlength="100" placeholder="例如：夜班" required autocomplete="off"></div>
  <div class="field"><label for="newReading">当地斯语中文谐音 <span class="required">*</span></label><input id="newReading" aria-required="true" maxlength="200" placeholder="填写经科卢韦齐当地人核实的中文读音" required autocomplete="off"></div>
 </div>
 <div class="legacy-entry-fields" hidden aria-hidden="true">
  <input id="newFrench" value=""><input id="newFrenchReadingZh" value=""><input id="newLatin" value="">
  <select id="newCategory"><option selected>其他</option></select>
  <input id="newSource" value="用户手动添加"><input id="newNote" value="">
 </div>
 <div class="actions"><button class="primary" id="entrySubmit" type="submit">保存新词</button><button class="plain" id="cancelEdit" type="button" hidden>取消编辑</button></div>
 <div id="maintenanceMessage" class="form-message" role="status">保存后立即用于本机翻译，并自动同步给所有用户。</div>
 </form>''',
 h,count=1,flags=re.S)
if n!=1: raise SystemExit("Could not simplify the add form")
h=once(h,
 '  <div class="actions"><button id="retrySharedSync" class="soft" type="button">重试共享同步</button><span id="shareSyncSummary" class="hint" role="status">检查本机待同步词条，并尝试重新连接云端。</span></div>',
 '  <div class="compact-sync-status"><span id="shareSyncSummary" role="status">云端词库：自动同步</span><button id="retrySharedSync" class="soft mini" type="button" hidden>重试同步</button></div>',
 "compact sync status")
h=once(h,' <div class="card"><div class="sectionTitle"><h2>我自己添加的词条</h2>',
 ' <div class="card legacy-management-card" hidden aria-hidden="true" style="display:none!important"><div class="sectionTitle"><h2>我自己添加的词条</h2>',
 "hide personal list")
h=once(h,' <div class="card"><h2>备份与恢复</h2>',
 ' <div class="card legacy-management-card" hidden aria-hidden="true" style="display:none!important"><h2>备份与恢复</h2>',
 "hide backup panel")
css='''<style id="dwss-compact-add-0-9-43">
#maintenance .install-help,#maintenance #personalShareNotice{display:none!important}
#maintenance .compact-add-form{grid-template-columns:1fr;gap:14px}
#maintenance .compact-add-form .field{margin:0}
#maintenance .compact-add-form label{font-size:14px;font-weight:700}
#maintenance .compact-add-form input{min-height:48px;font-size:16px}
#maintenance #maintenanceMessage{margin-top:10px;padding:7px 9px;font-size:11px;line-height:1.45}
#maintenance .compact-sync-status{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;min-height:22px;color:#667085;font-size:11px}
#maintenance .legacy-entry-fields,#maintenance .legacy-management-card{display:none!important}
</style>'''
if 'dwss-compact-add-0-9-43' not in h: h=once(h,'</head>',css+'</head>','insert compact styles')
h=h.replace('DWSS 0.9.42','DWSS 0.9.43')
for x in ['id="translationWorkspace"','id="entryForm"','id="newZh"','id="newReading"','id="newFrench"','id="newCategory"','id="retrySharedSync"']:
 if x not in h: raise SystemExit("Missing preserved HTML hook "+x)
if '添加说明</summary>' in h or '自动共享说明' in h: raise SystemExit("Long help still remains")
w("index.html",h)

a=r("app.js")
a=once(a,"version:'0.9.42'","version:'0.9.43'","app version")
a=once(a,"clearEntryForm();renderAll();\n if(String(d.reading||'').trim()||String(d.french||'').trim()){",
 "clearEntryForm();renderAll();if($('inputText')&&$('inputText').value.trim())renderTranslation({recordHistory:false});\n if(String(d.reading||'').trim()||String(d.french||'').trim()){",
 "retranslate current input after adding")
a=once(a,
 "window.addEventListener('dwss:personal-share-status',e=>{\n const d=e&&e.detail||{};\n if(d.message)setMessage(d.message,d.type||'ok');\n if(typeof renderCustomList==='function')renderCustomList();\n});",
 "window.addEventListener('dwss:personal-share-status',e=>{\n const d=e&&e.detail||{};\n if(d.message){setMessage(d.message,d.type||'ok');const summary=$('shareSyncSummary');if(summary)summary.textContent=d.message;}\n const retry=$('retrySharedSync');if(retry)retry.hidden=!['failed','queued'].includes(String(d.status||''));\n if(typeof renderCustomList==='function')renderCustomList();\n});",
 "show sync state and retry only when needed")
a=once(a,
 "  setMessage('词条已保存在本机，并已启动共享同步。请查看每条词条的共享状态；只有显示“已确认同步到共享词库”才表示云端已经收到。','ok');",
 "  setMessage('已保存在本机，正在同步到所有用户的共享词库…','ok');",
 "short success status")
w("app.js",a)

s=r("shared-lexicon.js")
if 'local_text: src === "sw" ? (local || null) : null,' not in s: raise SystemExit("0.9.42 NULL payload fix missing")
if 'const permanent = code.startsWith("23") || code === "42501" || code === "PGRST204";' not in s: raise SystemExit("permanent DB failure reporting missing")
if 'document.addEventListener("visibilitychange"' not in s:
 s=once(s,
 '  window.addEventListener("offline", () => setStatus("离线：显示缓存，新词会排队等待联网", "offline"));',
 '  window.addEventListener("offline", () => setStatus("离线：显示缓存，新词会排队等待联网", "offline"));\n  document.addEventListener("visibilitychange", () => { if(document.visibilityState==="visible" && navigator.onLine) connectCloud().catch(() => {}); });',
 "refresh missed cloud terms on app resume")
w("shared-lexicon.js",s)

sw=r("sw.js")
sw=once(sw,"const APP_VERSION = '0.9.42';","const APP_VERSION = '0.9.43';","service worker version")
w("sw.js",sw)
v=once(r("VERSION.txt"),"Version: 0.9.42","Version: 0.9.43","version marker")
v+="\n0.9.43: compact add form, keep translation and legacy storage hooks, retranslate current input after add, refresh cloud data when app returns to foreground.\n"
w("VERSION.txt",v)
print("PASS: compact add form and 0.9.43 cache/index fixes")
