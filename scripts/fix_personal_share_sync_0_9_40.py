from pathlib import Path
ROOT=Path("public")
def read(n):
 p=ROOT/n
 if not p.is_file(): raise SystemExit(f"Missing {n}")
 return p.read_text(encoding="utf-8")
def write(n,s): (ROOT/n).write_text(s,encoding="utf-8")
def once(s,o,v,label):
 c=s.count(o)
 if c!=1: raise SystemExit(f"{label}: expected 1 anchor, got {c}")
 return s.replace(o,v,1)

app=read("app.js")
app=once(app,"version:'0.9.39'","version:'0.9.40'","app metadata")
app=once(app,"function renderCustomList(){","""function customShareStatusLabel(entry){
 const status=String(entry&&entry.shareSyncStatus||'');
 if(status==='synced')return '已确认同步到共享词库';
 if(status==='queued'||status==='pending')return '等待同步到共享词库';
 if(status==='needs-info'){
  if(entry&&entry.latin&&!entry.reading&&!entry.french)return '仅本机保存：缺少当地中文谐音，暂未共享';
  return '尚未共享：请补充当地中文谐音或法语读音';
 }
 if(status==='failed')return '共享提交失败：点击重试同步';
 if(entry&&entry.latin&&!entry.reading&&!entry.french)return '仅本机保存：补齐当地中文谐音后可共享';
 if(entry&&(entry.reading||entry.french))return '等待共享状态核验';
 return '仅本机保存';
}
function renderCustomList(){""","share status helper")
# Add a visible state line to every local custom entry.
old = '<div class="dictmeta">' + "\x24{esc(c.category||'其他')} · \x24{esc(c.source||'用户手动添加')}"
new = '<div class="dictmeta">共享状态：' + "\x24{esc(customShareStatusLabel(c))}</div><div class=dictmeta>" + "\x24{esc(c.category||'其他')} · \x24{esc(c.source||'用户手动添加')}"
app=once(app,old,new,"custom item share state")
app=once(app,
"""window.addEventListener('dwss:personal-share-status',e=>{
 const d=e&&e.detail||{};
 if(d.message)setMessage(d.message,d.type||'ok');
});""",
"""window.addEventListener('dwss:personal-share-status',e=>{
 const d=e&&e.detail||{};
 if(d.message)setMessage(d.message,d.type||'ok');
 if(typeof renderCustomList==='function')renderCustomList();
});""","refresh local item state")

old_submit="""$('entryForm').addEventListener('submit',e=>{e.preventDefault();const wasEditing=!!editingId,id=editingId,d=formData(),r=wasEditing?updateCustomEntry(id,d):addCustomEntry(d);if(!r.ok){setMessage(r.error,'err');return;}clearEntryForm();renderAll();setMessage(wasEditing?'已修改，短句匹配时立即生效。':'已添加新词条，短句匹配时立即生效。','ok');});"""
new_submit="""$('entryForm').addEventListener('submit',e=>{
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
app=once(app,old_submit,new_submit,"honest save vs cloud status")
retry_handler="""$('retrySharedSync').addEventListener('click',async()=>{
 const button=$('retrySharedSync');
 if(!window.DWSSSharedLexicon||typeof window.DWSSSharedLexicon.retryPending!=='function'){
  setMessage('共享同步组件尚未就绪。请保持联网，点击“检查更新”后重新打开页面，再重试。','err');return;
 }
 button.disabled=true;button.textContent='正在检查并同步…';
 try{
  const result=await window.DWSSSharedLexicon.retryPending();
  setMessage(result&&result.message?result.message:'同步检查结束，请查看每条词条的共享状态。',result&&result.ok?'ok':'offline');
 }catch(error){setMessage('共享同步重试失败：'+String(error&&error.message||error),'err');}
 finally{button.disabled=false;button.textContent='重试共享同步';renderCustomList();}
});"""
app=once(app,
 "$('cancelEdit').addEventListener('click',()=>{clearEntryForm();setMessage('已取消编辑。','');});",
 "$('cancelEdit').addEventListener('click',()=>{clearEntryForm();setMessage('已取消编辑。','');});\n"+retry_handler,
 "manual retry handler")
write("app.js",app)

html=read("index.html")
html=once(html,
 '<div class="maintenance-note" id="personalShareNotice" role="note"><b>自动共享说明：</b>保存符合条件的新词后，会自动进入公共共享词库。当地中文谐音、当地拼写/法语表达和分类会公开；“来源”和“个人备注”只保存在本机，不会上传。请勿在词条或公开备注中填写同事姓名、电话、证件号、门禁信息或公司内部敏感内容。</div>',
 '<div class="maintenance-note" id="personalShareNotice" role="note"><b>自动共享说明：</b>当地斯语词条必须填写“当地斯语中文谐音”才能进入共享词库；当地拉丁拼写可以留空。只填写拉丁拼写时，词条仍保存在本机并可按拼写检索，但不会上传，也不会产生中文谐音读音。保存后请查看每条词条的共享状态；“已确认同步到共享词库”才代表云端已经收到。“来源”和“个人备注”只保存在本机，不会上传。</div>',
 "clarify automatic share")
html=once(html,
 '<div class="field"><label for="newReading">当地斯语中文谐音</label><input id="newReading" maxlength="200" placeholder="添加当地斯语词条时填写当地人真实读音"></div>',
 '<div class="field"><label for="newReading">当地斯语中文谐音（共享必填）</label><input id="newReading" maxlength="200" placeholder="请按科卢韦齐当地人的真实发音填写；这是共享和中文读音翻译所需内容"></div>',
 "pronunciation required label")
html=once(html,
 '</form>\n </div>\n <div class="card"><div class="sectionTitle"><h2>我自己添加的词条</h2>',
 '</form>\n  <div class="actions"><button id="retrySharedSync" class="soft" type="button">重试共享同步</button><span id="shareSyncSummary" class="hint" role="status">检查本机待同步词条，并尝试重新连接云端。</span></div>\n </div>\n <div class="card"><div class="sectionTitle"><h2>我自己添加的词条</h2>',
 "retry control")
html=html.replace("DWSS 0.9.39","DWSS 0.9.40")
write("index.html",html)

shared=read("shared-lexicon.js")
shared=once(shared,
 'function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }',
 'function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (error) { console.error("[DWSS] Shared-sync local storage write failed:", error); return false; } }',
 "detect queue save failure")
shared=once(shared,
"""      if (result.error) {
        if (personalEntryId) {
          setPersonalStatus(personalEntryId, "queued", item.client_submit_id,
            "新词已保存在本机；云端暂时未响应，联网后会自动补传。", "offline");
        }
        setStatus("有 " + queue.length + " 条待同步；网络恢复后自动重试", "offline");
        scheduleRetry();
        return;
      }""",
"""      if (result.error) {
        const code = String(result.error.code || "UNKNOWN");
        const detail = String(result.error.message || result.error.details || "云端没有接受这条词条").slice(0,180);
        const permanent = code.startsWith("23") || code === "42501" || code === "PGRST204";
        const message = permanent
          ? "共享词条被数据库拒绝（" + code + "）：" + detail + "。词条仍保留在本机待处理队列；请修正内容后重试。"
          : "云端暂时没有确认这条词条（" + code + "）：" + detail + "。词条已保留，联网后会重试。";
        if (personalEntryId) setPersonalStatus(personalEntryId, permanent ? "failed" : "queued", item.client_submit_id, message, "error");
        setStatus(message, "error");
        if (!permanent) scheduleRetry();
        return;
      }""","show PostgREST errors")
shared=once(shared,
"""    if (existingQueue) Object.assign(existingQueue, payload);
    else queue.push(payload);
    save(QUEUE_KEY, queue);
    render(); count(); notifyApp();""",
"""    const previousQueue = queue.map(item => Object.assign({}, item));
    if (existingQueue) Object.assign(existingQueue, payload);
    else queue.push(payload);
    if (!save(QUEUE_KEY, queue)) {
      queue = previousQueue;
      setPersonalStatus(entry.id, "failed", submitId, "词条已保存在本机，但浏览器未能保存共享待同步队列。请保持页面打开并点击“重试共享同步”。", "error");
      return;
    }
    render(); count(); notifyApp();""","atomic queue save")

shared=once(shared,
 'if (!navigator.onLine) { setStatus("离线：显示缓存，新词会排队等待联网", "offline"); return; }',
 'if (!navigator.onLine) { setStatus("离线：显示缓存，新词会排队等待联网", "offline"); return false; }',
 "offline connect return")
shared=once(shared,
 '    await syncPendingPersonalTerms();\n  } catch (e) {',
 '    await syncPendingPersonalTerms();\n    return true;\n  } catch (e) {',
 "cloud connect success return")
shared=once(shared,
 '    if (queue.length) scheduleRetry();\n  }\n}\nasync function submitTerm(event) {',
 '    if (queue.length) scheduleRetry();\n    return false;\n  }\n}\nasync function submitTerm(event) {',
 "cloud connect failure return")
retry_fn="""async function retryPendingSync() {
  if (!navigator.onLine) return { ok:false, message:"当前处于离线状态。词条仍保存在本机；恢复网络后再重试共享同步。" };
  const connected = await connectCloud();
  if (!connected) return { ok:false, message:"暂时无法连接共享词库。你的个人词条没有删除；请检查网络后再次重试。" };
  const app = window.KolweziSwahili;
  const entries = app && typeof app.getCustom === "function" ? app.getCustom() : [];
  const needsInfo = entries.filter(entry =>
    String(entry.shareSyncStatus || "") === "needs-info" ||
    String(entry.shareSyncStatus || "") === "failed"
  ).length;
  if (queue.length) return { ok:false, message:"已连接云端，但仍有 " + queue.length + " 条词条待确认上传。系统已保留记录并会继续重试；请查看每条词条的共享状态。" };
  if (needsInfo) return { ok:false, message:"云端连接正常。另有 " + needsInfo + " 条个人词条尚未满足共享条件；请查看词条状态，补齐当地中文谐音或法语读音后再试。" };
  return { ok:true, message:"共享同步检查完成。云端已连接，当前没有待上传词条；请在共享词库中搜索刚添加的中文词进行核对。" };
}
"""
shared=once(shared,
 'window.DWSSSharedLexicon = Object.freeze({\n  getTerms: getPublicTerms,\n  refresh: connectCloud,\n  submitPersonalTerm,',
 retry_fn+'window.DWSSSharedLexicon = Object.freeze({\n  getTerms: getPublicTerms,\n  refresh: connectCloud,\n  retryPending: retryPendingSync,\n  submitPersonalTerm,',
 "expose manual retry")
shared=once(shared,
"""  } catch (e) {
    queue = queue.filter(q => q.client_submit_id !== payload.client_submit_id);
    queue.unshift(payload); save(QUEUE_KEY, queue); render(); count(); notifyApp();
    setStatus("提交结果暂未确认；已保留本机队列，联网后自动核对并补传。", "offline");
    scheduleRetry();
  } finally { btn.disabled = false; btn.textContent = "提交共享"; }""",
"""  } catch (e) {
    const code = String(e && e.code || "NETWORK");
    const detail = String(e && (e.message || e.details) || "未知原因").slice(0,180);
    const permanent = code.startsWith("23") || code === "42501" || code === "PGRST204";
    if (permanent) {
      setStatus("共享提交被数据库拒绝（" + code + "）：" + detail + "。请修正内容后重新提交。", "error");
    } else {
      queue = queue.filter(q => q.client_submit_id !== payload.client_submit_id);
      queue.unshift(payload);
      if (!save(QUEUE_KEY, queue)) setStatus("提交未完成，而且本机待同步队列保存失败。请先复制保留词条内容。", "error");
      else {
        render(); count(); notifyApp();
        setStatus("提交结果暂未确认（" + code + "）：" + detail + "。已保留本机队列，联网后自动核对并补传。", "offline");
        scheduleRetry();
      }
    }
  } finally { btn.disabled = false; btn.textContent = "提交共享"; }""",
 "direct shared form precise errors")
write("shared-lexicon.js",shared)

version=once(read("VERSION.txt"),"Version: 0.9.39","Version: 0.9.40","version marker")
version += "\nShared-sync reliability: per-term status is visible; Latin-only local terms are distinguished from terms with a verified Chinese Swahili pronunciation; users can manually retry cloud sync; database rejection codes and details are shown instead of generic success wording.\n"
write("VERSION.txt",version)
assert "function customShareStatusLabel(entry)" in app
assert "共享状态：" in app and "retrySharedSync" in app
assert "当地斯语中文谐音（共享必填）" in html
assert "function retryPendingSync()" in shared and "retryPending: retryPendingSync" in shared
assert "共享词条被数据库拒绝" in shared
assert "Version: 0.9.40" in version and "version:'0.9.40'" in app
print("PASS: DWSS 0.9.40 personal/shared status, retry flow and actionable error reporting.")
