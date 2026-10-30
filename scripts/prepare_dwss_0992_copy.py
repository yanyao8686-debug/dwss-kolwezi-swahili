from pathlib import Path
import re

root=Path("public")
def read(name): return (root/name).read_text(encoding="utf-8")
def write(name,value): (root/name).write_text(value,encoding="utf-8")
def once(source,old,new,label):
    count=source.count(old)
    if count!=1: raise SystemExit(f"{label}: expected one match, found {count}")
    return source.replace(old,new,1)

html=read("index.html")
html=once(html,
''' <div class="translation-correction-help">认为上面的斯语中文谐音不正确？可以直接在黄色输入框内修改，然后提交给云端。</div>
''','',
"remove long repeated correction explanation")
html=once(html,'>提交修正并同步所有用户</button>','>提交修正</button>',"shorten correction button")
html=once(html,'content="0.9.91"','content="0.9.92"',"HTML release metadata")
html=once(html,'DWSS_AUTO_UPDATE_0_9_91','DWSS_AUTO_UPDATE_0_9_92',"HTML update marker")
html=html.replace("dwss-release=0.9.91","dwss-release=0.9.92")
html=once(html,'版本 0.9.91 · 刚果金斯语翻译','版本 0.9.92 · 刚果金斯语翻译',"visible release version")
html=html.replace('margin-top:7px}\n#submitTranslationCorrection','margin-top:0}\n#submitTranslationCorrection')
write("index.html",html)

app=read("app.js")
app=once(app,"version:'0.9.91'","version:'0.9.92'","application metadata")
old="const correctionState=$('translationCorrectionStatus');if(correctionState){correctionState.textContent=exactOverride?'当前中文已有云端修正（版本 '+Number(exactOverride.revision||0)+'），所有用户共用。':'可以直接编辑上方谐音并提交云端。';correctionState.className='translation-correction-status';correctionState.hidden=false;}"
new="const correctionState=$('translationCorrectionStatus');if(correctionState){correctionState.textContent='';correctionState.hidden=true;}"
app=once(app,old,new,"remove duplicate initial helper status")
app=once(app,"button.textContent='提交修正并同步所有用户'","button.textContent='提交修正'","shorten submitting label")
app=once(app,"setTranslationCorrectionStatus('修正已保存到云端。其他在线用户将自动同步；后来打开应用的用户也会使用这条读音。','');","setTranslationCorrectionStatus('已同步云端，其他用户可见。','');","shorten success status")
app=once(app,"setTranslationCorrectionStatus('已恢复自动翻译结果，其他用户也会同步恢复。');","setTranslationCorrectionStatus('已恢复自动读音。');","shorten restore status")
write("app.js",app)

sw=read("sw.js")
sw=once(sw,"const APP_VERSION = '0.9.91';","const APP_VERSION = '0.9.92';","service worker cache version")
write("sw.js",sw)
version=read("VERSION.txt")
version=once(version,"Version: 0.9.91","Version: 0.9.92","VERSION file")
version=re.sub(r"^Release date: .*$","Release date: 2026-10-30",version,count=1,flags=re.M)
version += "\n0.9.92: Simplify the translation correction area to one concise action button and remove duplicated helper text; show only meaningful success/error states after user actions.\n"
write("VERSION.txt",version)

assert '<div class="translation-correction-help">' not in html
assert 'id="submitTranslationCorrection"' in html and '>提交修正</button>' in html
assert "可以直接编辑上方谐音并提交云端" not in app
assert "已同步云端，其他用户可见。" in app
assert "const APP_VERSION = '0.9.92';" in sw
print("PASS: DWSS 0.9.92 concise correction UI — no repeated explanation or button-label redundancy.")
