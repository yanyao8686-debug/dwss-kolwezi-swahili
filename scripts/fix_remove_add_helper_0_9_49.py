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
helper = '  <div class="form-note" id="addWordLanguageHint">中文意思必填；斯语中文谐音、法语中文谐音可单独填写，也可同时填写。两项相互独立，录入格式相同，均由录入者按实际发音用中文同音字填写；系统不会自动估算或互相替代。</div>\n'
html = replace_once(html, helper, "", "remove red-circled helper text")
html = replace_once(html, 'content="0.9.48"', 'content="0.9.49"', "auto-update meta version")
html = replace_once(html, 'DWSS_AUTO_UPDATE_0_9_48', 'DWSS_AUTO_UPDATE_0_9_49', "auto-update marker")
html = replace_once(html, '版本 0.9.48 · DWSS 智能翻译 PWA', '版本 0.9.49 · DWSS 智能翻译 PWA', "visible version")
html = replace_once(html, '<!-- DWSS 0.9.48 single home result; French only as missing-Swahili fallback -->', '<!-- DWSS 0.9.49 removed redundant Add New Word helper note -->', "release marker")
if 'id="newZh"' not in html or 'id="newReading"' not in html or 'id="newFrenchReadingZh"' not in html:
    raise SystemExit("One or more Add New Word inputs are missing")
if 'id="entrySubmit"' not in html or '保存新词' not in html:
    raise SystemExit("Save-new-word button is missing")
if 'id="addWordLanguageHint"' in html or '中文意思必填；斯语中文谐音' in html:
    raise SystemExit("Redundant helper note still exists")
write("index.html", html)

app = read("app.js")
app = replace_once(app, "version:'0.9.48'", "version:'0.9.49'", "application metadata version")
write("app.js", app)

sw = read("sw.js")
sw = replace_once(sw, "const APP_VERSION = '0.9.48';", "const APP_VERSION = '0.9.49';", "service worker cache version")
write("sw.js", sw)

version = replace_once(read("VERSION.txt"), "Version: 0.9.48", "Version: 0.9.49", "VERSION file")
version += "\n0.9.49: remove only the redundant explanatory paragraph beneath the three Add New Word input fields. Keep the Chinese meaning, local Swahili Chinese homophone, French Chinese homophone inputs, and Save New Word button unchanged.\n"
write("VERSION.txt", version)

print("PASS: DWSS 0.9.49 removes only the redundant Add New Word helper paragraph; all fields and save button remain.")
