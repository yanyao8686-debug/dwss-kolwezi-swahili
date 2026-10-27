from pathlib import Path
root=Path("public")
def read(name):
 p=root/name
 if not p.is_file(): raise SystemExit(f"Missing release file: {name}")
 return p.read_text(encoding="utf-8")
def write(name,value): (root/name).write_text(value,encoding="utf-8")
def once(text,old,new,label):
 n=text.count(old)
 if n!=1: raise SystemExit(f"{label}: expected one anchor, found {n}")
 return text.replace(old,new,1)
app=read("app.js")
app=once(app,"version:'0.9.40'","version:'0.9.41'","app version")
old=" if(!reading&&!latin&&!french)return '请填写当地斯语中文谐音、当地拼写或法语备用表达中的至少一项。';"
new=""" if(!reading&&latin)return '斯瓦西里语新词必须填写“当地斯语中文谐音”。拉丁字母拼写不能代替中文谐音，也不能生成你需要的中文读音；请先向科卢韦齐当地使用者核实读音后再保存。';
 if(!reading&&!french)return '请填写当地斯语中文谐音；若添加的是法语备用表达，请填写法语栏。';"""
app=once(app,old,new,"local Swahili reading validation")
write("app.js",app)
html=read("index.html")
old_html='<div class="field"><label for="newReading">当地斯语中文谐音（共享必填）</label><input id="newReading" maxlength="200" placeholder="请按科卢韦齐当地人的真实发音填写；这是共享和中文读音翻译所需内容"></div>'
new_html='<div class="field"><label for="newReading">当地斯语中文谐音（斯语词条必填） <span class="required">*</span></label><input id="newReading" aria-required="true" maxlength="200" placeholder="填写科卢韦齐当地人的中文谐音；只有拼写不能生成中文读音"><small class="hint">当地斯语拼写可以留空；但只填拉丁拼写不能保存为可翻译的斯语词条。法语备用词请填入单独的法语栏。</small></div>'
html=once(html,old_html,new_html,"required local reading label")
if "DWSS 0.9.40" not in html: raise SystemExit("Expected HTML 0.9.40 base")
html=html.replace("DWSS 0.9.40","DWSS 0.9.41")
write("index.html",html)
sw=once(read("sw.js"),"const APP_VERSION = '0.9.40';","const APP_VERSION = '0.9.41';","Service Worker version")
write("sw.js",sw)
version=once(read("VERSION.txt"),"Version: 0.9.40","Version: 0.9.41","VERSION")
version += "\nEntry validation: a local Katanga Swahili term must include its Chinese phonetic pronunciation before it can be saved; Latin spelling remains optional. French-only fallback remains supported as French.\n"
write("VERSION.txt",version)
assert "if(!reading&&latin)return '斯瓦西里语新词必须填写" in app
assert "当地斯语中文谐音（斯语词条必填）" in html
assert 'aria-required="true"' in html
assert "const APP_VERSION = '0.9.41';" in sw
assert "Version: 0.9.41" in version
print("PASS: DWSS 0.9.41 Swahili reading must be supplied before save.")
