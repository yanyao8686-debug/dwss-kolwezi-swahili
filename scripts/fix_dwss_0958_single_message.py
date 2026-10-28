from pathlib import Path

ROOT = Path("public")

def replace_once(path, old, new, label):
    file = ROOT / path
    source = file.read_text(encoding="utf-8")
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one source match, got {count}")
    file.write_text(source.replace(old, new, 1), encoding="utf-8")

replace_once(
    "index.html",
    '<div class="compact-sync-status"><span id="shareSyncSummary" role="status">共享词库：自动同步</span><button id="retrySharedSync" class="soft mini" type="button" hidden>重试同步</button></div>',
    '<div class="compact-sync-status" id="sharedSyncActions" hidden><button id="retrySharedSync" class="soft mini" type="button" hidden>重试同步</button></div>',
    "remove second status sentence and retain retry action only",
)
replace_once(
    "index.html",
    'content="0.9.57"><!-- DWSS_AUTO_UPDATE_0_9_57 -->',
    'content="0.9.58"><!-- DWSS_AUTO_UPDATE_0_9_58 -->',
    "automatic update marker",
)
replace_once(
    "index.html",
    "版本 0.9.57 · DWSS 智能翻译 PWA",
    "版本 0.9.58 · DWSS 智能翻译 PWA",
    "visible release version",
)
replace_once(
    "app.js",
    "version:'0.9.57'",
    "version:'0.9.58'",
    "application version",
)
replace_once(
    "app.js",
    """const SHARE_STATUS_LABELS={synced:'共享词库：已同步',queued:'共享词库：等待同步',pending:'共享词库：等待同步',connecting:'共享词库：正在同步',failed:'共享词库：同步失败',offline:'共享词库：等待联网','needs-info':'共享词库：待补充当地中文谐音'};
window.addEventListener('dwss:personal-share-status',e=>{
 const d=e&&e.detail||{};
 if(d.message)setMessage(d.message,d.type||'ok');
 const summary=$('shareSyncSummary');if(summary)summary.textContent=SHARE_STATUS_LABELS[String(d.status||'')]||'共享词库：自动同步';
 const retry=$('retrySharedSync');if(retry)retry.hidden=!['failed','queued'].includes(String(d.status||''));
 if(typeof renderCustomList==='function')renderCustomList();
});""",
    """window.addEventListener('dwss:personal-share-status',e=>{
 const d=e&&e.detail||{};
 if(d.message)setMessage(d.message,d.type||'ok');
 const retry=$('retrySharedSync');
 if(retry){
  retry.hidden=!['failed','queued'].includes(String(d.status||''));
  const actions=$('sharedSyncActions');
  if(actions)actions.hidden=retry.hidden;
 }
 if(typeof renderCustomList==='function')renderCustomList();
});""",
    "single visible save/sync message; retry button only on exceptions",
)
replace_once(
    "sw.js",
    "const APP_VERSION = '0.9.57';",
    "const APP_VERSION = '0.9.58';",
    "service-worker cache version",
)
version = ROOT / "VERSION.txt"
info = version.read_text(encoding="utf-8").replace("Version: 0.9.57", "Version: 0.9.58", 1)
note = "0.9.58: Remove the separate compact sync-status sentence so save/sync feedback appears only once; keep the retry action available only for queued or failed submissions.\n"
if note not in info:
    info = info.rstrip() + "\n" + note
version.write_text(info, encoding="utf-8")
print("PASS: DWSS 0.9.58 single-message patch applied.")
