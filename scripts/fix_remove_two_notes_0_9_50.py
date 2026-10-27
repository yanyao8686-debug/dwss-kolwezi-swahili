from pathlib import Path

P = Path("public")
def read(name):
    return (P / name).read_text(encoding="utf-8")
def write(name, content):
    (P / name).write_text(content, encoding="utf-8")
def replace_once(content, old, new, label):
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return content.replace(old, new, 1)

html = read("index.html")

# Remove the static save/sync sentence but retain the status element because
# app.js writes actual save/sync errors and success messages into it.
old_status = '<div id="maintenanceMessage" class="form-message" role="status">保存后立即用于本机翻译，并自动同步给所有用户。</div>'
new_status = '<div id="maintenanceMessage" class="form-message" role="status" aria-live="polite"></div>'
html = replace_once(html, old_status, new_status, "remove static add-word save/sync note")

# Hide the now-empty live-status element without leaving margin/padding;
# it becomes visible automatically only when app.js writes a real status.
css_anchor = '#maintenance #maintenanceMessage{margin-top:10px;padding:7px 9px;font-size:11px;line-height:1.45}'
html = replace_once(
    html,
    css_anchor,
    css_anchor + '\n#maintenance #maintenanceMessage:empty{display:none;margin:0;padding:0;border:0;min-height:0}',
    "collapse empty add-word message spacing"
)

# Remove the homepage explanation; the actual translation/fallback behaviour is unchanged.
home_hint = '<div class="hint" style="margin-top:10px">优先使用当地斯语中文谐音；当地斯语没有对应词条时，才使用“添加新词”中录入的法语中文谐音替代</div>'
html = replace_once(html, home_hint, "", "remove homepage Swahili/French priority explanation")

html = replace_once(html, 'content="0.9.49"', 'content="0.9.50"', "auto-update meta version")
html = replace_once(html, 'DWSS_AUTO_UPDATE_0_9_49', 'DWSS_AUTO_UPDATE_0_9_50', "auto-update marker")
html = replace_once(html, '版本 0.9.49 · DWSS 智能翻译 PWA', '版本 0.9.50 · DWSS 智能翻译 PWA', "visible version")
html = replace_once(html, '<!-- DWSS 0.9.49 removed redundant Add New Word helper note -->', '<!-- DWSS 0.9.50 removed two redundant explanatory notes -->', "release marker")

# The three entry fields, save action, cloud-sync status, single result area,
# and existing language-priority logic all remain.
for required in ['id="newZh"', 'id="newReading"', 'id="newFrenchReadingZh"', 'id="entrySubmit"', 'id="shareSyncSummary"', 'id="resultReading"']:
    if required not in html:
        raise SystemExit(f"Required UI element missing: {required}")
if '保存后立即用于本机翻译，并自动同步给所有用户。' in html:
    raise SystemExit("Static save/sync note remains")
if '优先使用当地斯语中文谐音；当地斯语没有对应词条时' in html:
    raise SystemExit("Homepage language-priority helper remains")
write("index.html", html)

app = read("app.js")
app = replace_once(app, "version:'0.9.49'", "version:'0.9.50'", "application metadata version")
write("app.js", app)

sw = read("sw.js")
sw = replace_once(sw, "const APP_VERSION = '0.9.49';", "const APP_VERSION = '0.9.50';", "service worker cache version")
write("sw.js", sw)

version = replace_once(read("VERSION.txt"), "Version: 0.9.49", "Version: 0.9.50", "VERSION file")
version += "\n0.9.50: remove the static add-word save/sync note and the homepage Swahili-priority/French-fallback explanatory note. Keep actual save/sync status reporting, all three add-word fields, the save button, cloud-sync indicator, and the existing translation/fallback behaviour. Empty status area collapses with no reserved spacing.\n"
write("VERSION.txt", version)

print("PASS: DWSS 0.9.50 removes only the two marked explanatory notes and collapses the empty status area.")
