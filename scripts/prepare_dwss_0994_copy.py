from pathlib import Path
import re

root=Path("public")
def read(name): return (root/name).read_text(encoding="utf-8")
def write(name,value): (root/name).write_text(value,encoding="utf-8")
def once(source,old,new,label):
    count=source.count(old)
    if count!=1:
        raise SystemExit(f"{label}: expected exactly one occurrence, found {count}")
    return source.replace(old,new,1)

html=read("index.html")
html=once(
    html,
    '<button class="primary mini" id="submitTranslationCorrection" type="button">提交读音候选</button>',
    '<button class="primary mini" id="submitTranslationCorrection" type="button">提交修正并同步所有用户</button>',
    "main submit button label"
)
html=once(
    html,
    ''' </div>
 <div class="translation-correction-status" id="translationCorrectionStatus" role="status" aria-live="polite" hidden></div>''',
    ''' </div>
 <p class="translation-correction-hint">认为翻译结果错误可自行修改输入框内翻译结果</p>
 <div class="translation-correction-status" id="translationCorrectionStatus" role="status" aria-live="polite" hidden></div>''',
    "single-line correction hint placement"
)
html=once(
    html,
    '#submitTranslationCorrection{min-width:104px}',
    '''.translation-correction-actions{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;margin-top:0}
#submitTranslationCorrection{min-width:104px;max-width:100%;margin-inline:auto;white-space:normal;text-align:center}
.translation-correction-hint{margin:0 0 2px;text-align:center;color:#887a5d;font-size:9px;line-height:1.4;font-weight:400}''',
    "center button and style helper"
)
html=once(html,'content="0.9.93"','content="0.9.94"',"HTML auto-update version")
html=once(html,'DWSS_AUTO_UPDATE_0_9_93','DWSS_AUTO_UPDATE_0_9_94',"HTML auto-update marker")
html=html.replace('dwss-release=0.9.93','dwss-release=0.9.94')
html=once(html,'版本 0.9.93 · 刚果金斯语翻译','版本 0.9.94 · 刚果金斯语翻译',"visible version label")
write("index.html",html)

app=read("app.js")
app=once(app,"version:'0.9.93'","version:'0.9.94'","application version")
app=once(app,"button.textContent='提交读音候选'","button.textContent='提交修正并同步所有用户'","restore submit button label after submission")
write("app.js",app)

sw=read("sw.js")
sw=once(sw,"const APP_VERSION = '0.9.93';","const APP_VERSION = '0.9.94';","service worker cache version")
write("sw.js",sw)

version=read("VERSION.txt")
version=once(version,"Version: 0.9.93","Version: 0.9.94","VERSION file")
version=re.sub(r"^Release date: .*$","Release date: 2026-10-30",version,count=1,flags=re.M)
version += "\n0.9.94: Rename the main translation candidate submit button to '提交修正并同步所有用户', center it in the correction panel, and add one concise helper line directly below. Candidate submission, same-sound deduplication, shared candidate display and cloud sync behavior remain unchanged.\n"
write("VERSION.txt",version)

assert 'id="submitTranslationCorrection" type="button">提交修正并同步所有用户</button>' in html
assert '<p class="translation-correction-hint">认为翻译结果错误可自行修改输入框内翻译结果</p>' in html
assert html.index('id="submitTranslationCorrection"') < html.index('class="translation-correction-hint"')
assert 'DWSS_AUTO_UPDATE_0_9_94' in html
assert "button.textContent='提交修正并同步所有用户'" in app
assert "version:'0.9.94'" in app
assert "const APP_VERSION = '0.9.94';" in sw
assert 'id="translationPronunciationCandidates"' in html
assert 'id="dwss-apk-download"' in html
assert 'id="installAppBtn"' not in html
print("PASS DWSS 0.9.94: centered shared-correction button, concise helper directly below, and unchanged candidate controls.")
