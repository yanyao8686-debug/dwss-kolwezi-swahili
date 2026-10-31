#!/usr/bin/env python3
"""DWSS 0.9.114: persist completed main-page translations locally and make local history searchable."""
from __future__ import annotations
import hashlib
import os
import sys
from pathlib import Path

OLD = "0.9.113"
NEW = "0.9.114"
root = Path(sys.argv[1] if len(sys.argv) > 1 else os.environ.get("DWSS_PUBLIC_DIR", "public")).resolve()
if not root.is_dir():
    raise SystemExit(f"DWSS public directory not found: {root}")
required = ["index.html", "app.js", "sw.js", "VERSION.txt"]
for name in required:
    if not (root / name).is_file():
        raise SystemExit(f"Missing required DWSS asset: {name}")

# These assets must remain byte-identical. History is deliberately local-only.
protected = [
    "cover.webp", "DWSS-Android-Installer.apk", "dictionary.js.gz",
    "dictionary-overrides.js", "shared-lexicon.js", "pwa.js", "boot.js",
    "manifest.webmanifest", "pronunciation-search.js", "dwss-pronunciation-controls.js",
]
protected_hashes = {}
for name in protected:
    path = root / name
    if not path.is_file():
        raise SystemExit(f"Missing protected DWSS asset: {name}")
    protected_hashes[name] = hashlib.sha256(path.read_bytes()).hexdigest()

def read(name: str) -> str:
    return (root / name).read_text(encoding="utf-8")

def write(name: str, value: str) -> None:
    (root / name).write_text(value, encoding="utf-8", newline="\n")

def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)

html = read("index.html")
app = read("app.js")
sw = read("sw.js")
version_file = read("VERSION.txt")

# Add a local-only filter directly above the existing history list.
old_history_card = (
    '<div class="card"><div class="sectionTitle"><h2>最近查询</h2>'
    '<button class="plain mini" id="clearHistory">清空历史</button></div>'
    '<div id="history"></div></div>'
)
new_history_card = (
    '<div class="card"><div class="sectionTitle"><h2>最近查询</h2>'
    '<button class="plain mini" id="clearHistory">清空历史</button></div>'
    '<input class="search" id="historySearch" type="search" maxlength="200" '
    'autocomplete="off" placeholder="搜索本机翻译历史" aria-label="搜索本机翻译历史" '
    'style="margin:8px 0 4px">'
    '<p class="hint" style="margin:4px 0 8px">历史记录只保存在当前设备，不会上传云端。</p>'
    '<div id="history"></div></div>'
)
html = replace_once(html, old_history_card, new_history_card, "local history search UI")

# Expand the local history cap and deduplicate normalized equivalents while preserving
# the user's original wording. Nothing in this function calls the cloud client.
old_save = "function saveRecent(raw){const h=readStoredArray('sw_history',30);const next=[String(raw),...h.filter(x=>x!==raw)].slice(0,30);const saved=safeStore('sw_history',next);renderSaved();return saved;}"
new_save = """function saveRecent(raw){
 const value=String(raw||'').trim();if(!value)return false;
 const h=readStoredArray('sw_history',200);
 const key=norm(value);
 const next=[value,...h.filter(x=>norm(x)!==key)].slice(0,200);
 // Translation history is deliberately stored only in this device's localStorage.
 const saved=safeStore('sw_history',next);renderSaved();return saved;
}"""
app = replace_once(app, old_save, new_save, "local history save function")

old_history_render = " const h=readStoredArray('sw_history',30);$('history').innerHTML=h.map(phrase=>`<div class=\"dictrow\"><div class=\"dictmain\"><div class=\"dictzh\">${esc(phrase)}</div></div><button class=\"soft mini\" data-use=\"${esc(phrase)}\">重新查询</button></div>`).join('')||'<div class=\"nores\">还没有查询历史。</div>';"
new_history_render = """ const historyQuery=norm($('historySearch')?.value||'');
 const allHistory=readStoredArray('sw_history',200);
 const h=historyQuery?allHistory.filter(phrase=>norm(phrase).includes(historyQuery)):allHistory;
 $('history').innerHTML=h.map(phrase=>`<div class="dictrow"><div class="dictmain"><div class="dictzh">${esc(phrase)}</div></div><button class="soft mini" data-use="${esc(phrase)}">重新查询</button></div>`).join('')|| (historyQuery?'<div class="nores">没有找到匹配的本机历史记录。</div>':'<div class="nores">还没有查询历史。</div>');"""
app = replace_once(app, old_history_render, new_history_render, "searchable local history rendering")

# Typing continues to update the visible translation without saving every partial
# keystroke. When the user leaves the input (e.g. opens History), commit that completed
# translation locally. Clearing the input explicitly is not treated as a translation.
old_listeners = "const scheduleDwssLiveTranslation=delay=>{clearTimeout(dwssInputTimer);dwssInputTimer=setTimeout(()=>renderTranslation({recordHistory:false}),delay);};\n$('inputText').addEventListener('compositionstart',()=>{clearTimeout(dwssInputTimer);});"
new_listeners = """const scheduleDwssLiveTranslation=delay=>{clearTimeout(dwssInputTimer);dwssInputTimer=setTimeout(()=>renderTranslation({recordHistory:false}),delay);};
function commitCurrentTranslationToLocalHistory(){
 clearTimeout(dwssInputTimer);
 if(!$('inputText').value.trim())return false;
 renderTranslation({recordHistory:true});
 return true;
}
$('inputText').addEventListener('blur',event=>{
 if(event&&event.relatedTarget&&event.relatedTarget.id==='clearBtn')return;
 commitCurrentTranslationToLocalHistory();
});
window.addEventListener('pagehide',()=>{
 if(document.activeElement===$('inputText'))commitCurrentTranslationToLocalHistory();
});
$('inputText').addEventListener('compositionstart',()=>{clearTimeout(dwssInputTimer);});"""
app = replace_once(app, old_listeners, new_listeners, "completed translation local-history commit")

# Make the local history filter reactive, without changing the shared vocabulary code.
old_history_binding = "$('clearHistory').addEventListener('click',()=>{if(!safeRemove('sw_history'))return;renderSaved();});"
new_history_binding = "$('historySearch').addEventListener('input',()=>renderSaved());$('clearHistory').addEventListener('click',()=>{if(!safeRemove('sw_history'))return;renderSaved();});"
app = replace_once(app, old_history_binding, new_history_binding, "local history search event binding")

# Do not pollute a user's history with the example phrase auto-filled at app startup.
old_startup = "$('inputText').value='请稍等，我去叫他';renderTranslation();"
new_startup = "$('inputText').value='请稍等，我去叫他';renderTranslation({recordHistory:false});"
app = replace_once(app, old_startup, new_startup, "startup example must not be stored as user history")

# Version/cache identifiers change so browsers and Android WebView receive the fix.
if html.count(OLD) < 4:
    raise SystemExit(f"index.html version markers incomplete: found {html.count(OLD)} occurrences of {OLD}")
html = html.replace(OLD, NEW)
html = replace_once(html, "DWSS_AUTO_UPDATE_0_9_113", "DWSS_AUTO_UPDATE_0_9_114", "automatic update marker")
app = replace_once(app, "version:'0.9.113'", "version:'0.9.114'", "application version metadata")
sw = replace_once(sw, "const APP_VERSION = '0.9.113';", "const APP_VERSION = '0.9.114';", "service worker cache version")
version_file = replace_once(version_file, "Version: 0.9.113", "Version: 0.9.114", "VERSION.txt current version")
version_file = version_file.rstrip() + (
    "\n\n0.9.114: Completed main-page translations are saved automatically to the current device's localStorage when the input is left or the app is closed. "
    "Typing previews still avoid recording partial input. History can be searched locally, stores up to 200 recent unique inputs, and remains excluded from all cloud submissions. "
    "No Supabase tables, policies, shared vocabulary, cover artwork, or Android installer are changed.\n"
)

write("index.html", html)
write("app.js", app)
write("sw.js", sw)
write("VERSION.txt", version_file)

for name, expected in protected_hashes.items():
    actual = hashlib.sha256((root / name).read_bytes()).hexdigest()
    if actual != expected:
        raise SystemExit(f"Protected asset changed unexpectedly: {name}")
print("PASS: completed translations save to local-only history; search UI and 200-item local history added; cloud/shared assets, cover and APK unchanged.")
