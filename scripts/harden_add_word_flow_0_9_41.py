from pathlib import Path
P=Path("public")
def r(n):
 p=P/n
 if not p.is_file(): raise SystemExit(f"Missing {n}")
 return p.read_text(encoding="utf-8")
def w(n,s): (P/n).write_text(s,encoding="utf-8")
def once(s,a,b,label):
 c=s.count(a)
 if c!=1: raise SystemExit(f"{label}: expected one anchor, found {c}")
 return s.replace(a,b,1)
app=r("app.js")
app=once(app,"version:'0.9.40'","version:'0.9.41'","app version")
old="""$('entryForm').addEventListener('submit',e=>{
 e.preventDefault();
 const wasEditing=!!editingId,id=editingId,d=formData(),r=wasEditing?updateCustomEntry(id,d):addCustomEntry(d);
 if(!r.ok){setMessage(r.error,'err');return;}
 clearEntryForm();renderAll();
 if(String(d.reading||'').trim()||String(d.french||'').trim()){
  setMessage('词条已保存在本机，并已启动共享同步。请查看每条词条的共享状态；只有显示“已确认同步到共享词库”才表示云端已经收到。','ok');
 }else if(String(d.latin||'').trim()){
  setMessage('词条已保存在本机，也可按当地拼写检索；但尚未填写“当地斯语中文谐音”，因此暂未共享，也不会产生中文口语读音。请经当地人核实后补齐，再点击“重试共享同步”。','offline');
 }else{
  setMessage('词条已保存在本机；还没有可共享的当地读音。请补充当地中文谐音或法语备用表达。','offline');
 }
});"""
new="""$('entryForm').addEventListener('submit',e=>{
 e.preventDefault();
 const wasEditing=!!editingId,id=editingId,d=formData();
 const reading=String(d.reading||'').trim(),latin=String(d.latin||'').trim(),french=String(d.french||'').trim();
 // A local Swahili entry needs the verified Chinese homophone used by this app.
 if(!reading&&(latin||!french)){
  setMessage(latin
   ?'你填写的是当地拉丁拼写，但没有填写“当地斯语中文谐音”。只填拼写不能生成中文读音，也不会进入共享词库。请把中文谐音填写在上方对应输入框后再保存。'
   :'添加科卢韦齐斯瓦西里语词条必须填写“当地斯语中文谐音”。若暂时没有可核实的当地读音，请不要猜写；只有法语备用词条可以不填此项。','err');
  $('newReading').focus();return;
 }
 const r=wasEditing?updateCustomEntry(id,d):addCustomEntry(d);
 if(!r.ok){setMessage(r.error,'err');return;}
 clearEntryForm();renderAll();
 if(reading){
  setMessage('词条已保存在本机，并已启动共享同步。请查看词条状态；只有显示“已确认同步到共享词库”才表示云端已经收到。','ok');
 }else{
  setMessage('法语备用词条已保存在本机，并已启动共享同步；它会明确标记为法语，不会冒充当地斯语。','ok');
 }
});"""
app=once(app,old,new,"personal add form")
app=once(app,
" if(d.message)setMessage(d.message,d.type||'ok');\n if(typeof renderCustomList==='function')renderCustomList();",
" if(d.message){setMessage(d.message,d.type||'ok');const summary=$('shareSyncSummary');if(summary)summary.textContent=d.message;}\n if(typeof renderCustomList==='function')renderCustomList();",
"sync status summary")
w("app.js",app)
html=r("index.html")
html=once(html,
"<b>当地读音：</b>请科卢韦齐同事确认后再录入；未确认的拼写留空。",
"<b>当地读音：</b>斯语词条必须将中文谐音填在“当地斯语中文谐音”栏；拉丁字母拼写单独填写。请先经科卢韦齐同事确认，不要猜写。",
"add instructions")
html=once(html,
'<label for="newReading">当地斯语中文谐音（共享必填）</label>',
'<label for="newReading">当地斯语中文谐音 <span class="required">*</span></label>',
"required pronunciation label")
html=once(html,
'<div id="maintenanceMessage" class="form-message">添加当地斯瓦西里语词条时，建议填写中文意思和中文谐音；法语备用词条可只填写中文意思与法语释义。当地拼写可暂时留空，切勿猜写。</div>',
'<div id="maintenanceMessage" class="form-message">添加当地斯语新词必须填写中文意思和当地中文谐音；当地拉丁拼写可选。只有法语备用词条可以不填当地中文谐音。保存后请查看共享状态。</div>',
"form guidance")
html=once(html,"版本 0.9.32 · DWSS 智能翻译 PWA","版本 0.9.41 · DWSS 智能翻译 PWA","footer version")
html=html.replace("DWSS 0.9.40","DWSS 0.9.41")
w("index.html",html)
const sw=once(r("sw.js"),"const APP_VERSION = '0.9.40';","const APP_VERSION = '0.9.41';","service worker version")
w("sw.js",sw)
let version=once(r("VERSION.txt"),"Version: 0.9.40","Version: 0.9.41","VERSION")
version+="\nEntry form validation: reject local Swahili terms with only Latin spelling and no Chinese homophone; French-only fallback remains available. Adds a clear required field cue and live per-entry sync status summary.\n"
w("VERSION.txt",version)
assert "if(!reading&&(latin||!french))" in app
assert "只填拼写不能生成中文读音，也不会进入共享词库" in app
assert "shareSyncSummary" in app
assert '当地斯语中文谐音 <span class="required">*</span>' in html
assert "Version: 0.9.41" in version and "const APP_VERSION = '0.9.41';" in sw
print("PASS: DWSS 0.9.41 strict Swahili pronunciation form validation.")
