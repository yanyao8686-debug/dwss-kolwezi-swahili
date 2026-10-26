(() => {
"use strict";
if (window.__DWSS_SHARED_LEXICON_LOADED__) return;
window.__DWSS_SHARED_LEXICON_LOADED__ = true;
const SUPABASE_URL = "https://pautxzcfmtwkaunjxghj.supabase.co";
const SUPABASE_KEY = "sb_publishable_9BB_pwnlj6-gVHPFzpjivA_L7SGU_Bp";
const CACHE_KEY = "dwss_shared_terms_cache_v1";
const QUEUE_KEY = "dwss_shared_terms_queue_v1";
let supabase = null, channel = null, panelOpen = false, language = "sw";
let terms = readArray(CACHE_KEY), queue = readArray(QUEUE_KEY);
function readArray(key) {
  try { const x = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(x) ? x : []; }
  catch (_) { return []; }
}
function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }
function getPublicTerms() {
  return terms.concat(queue.map(t => Object.assign({}, t, { __pending: true }))).map(t => Object.assign({}, t));
}
function notifyApp() {
  try { window.dispatchEvent(new CustomEvent("dwss:shared-terms-updated", { detail: { terms: getPublicTerms() } })); }
  catch (_) {}
}
function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16);
  });
}
function esc(v) {
  return String(v == null ? "" : v).replace(/[&<>"']/g, c =>
    ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
}
function setStatus(message, type) {
  const el = document.getElementById("dwss-shared-status");
  if (el) { el.textContent = message; el.className = "dwss-shared-status " + (type || "ok"); }
}
function count() {
  const el = document.getElementById("dwss-shared-count");
  if (el) el.textContent = String(terms.length + queue.length);
}
function mergeTerm(t) {
  if (!t) return;
  const found = terms.findIndex(x => (x.id && x.id === t.id) ||
    (x.client_submit_id && x.client_submit_id === t.client_submit_id));
  if (found >= 0) terms[found] = t; else terms.unshift(t);
  terms.sort((a,b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  save(CACHE_KEY, terms); render(); count(); notifyApp();
}
function render() {
  const list = document.getElementById("dwss-shared-list");
  if (!list) return;
  const q = ((document.getElementById("dwss-shared-search") || {}).value || "").trim().toLowerCase();
  const pending = queue.map(t => Object.assign({}, t, { __pending: true }));
  const filtered = terms.filter(t => !q ||
    [t.chinese_text,t.local_text,t.local_pronunciation_cn,t.french_text,t.category,t.notes]
      .join(" ").toLowerCase().includes(q));
  const rows = pending.concat(filtered).slice(0,300);
  if (!rows.length) {
    list.innerHTML = '<div class="dwss-shared-empty">暂无匹配词条。你可以添加第一个共享词条。</div>';
    return;
  }
  list.innerHTML = rows.map(t => {
    const fr = t.source_language === "fr";
    return '<article class="dwss-shared-item"><div class="dwss-shared-item-top"><b>' +
      esc(t.chinese_text) + '</b><span>' + (t.__pending ? "待联网同步" : (fr ? "法语补位" : "科卢韦齐斯瓦西里语")) +
      '</span></div><div class="dwss-shared-local">' + esc(fr ? t.french_text : t.local_text) +
      '</div><div class="dwss-shared-pron">中文近似读音：' + esc(t.local_pronunciation_cn) +
      '</div><div class="dwss-shared-meta">' + esc(t.category || "未分类") +
      (t.notes ? " · " + esc(t.notes) : "") + '</div></article>';
  }).join("");
}
function toggleForm(show) {
  const f = document.getElementById("dwss-shared-form-wrap");
  if (f) f.hidden = !show;
  const b = document.getElementById("dwss-shared-add-toggle");
  if (b) b.textContent = show ? "收起添加" : "＋ 添加新词";
}
function setLanguage(v) {
  language = v === "fr" ? "fr" : "sw";
  const sw = document.getElementById("dwss-shared-local-field");
  const fr = document.getElementById("dwss-shared-french-field");
  const swi = document.getElementById("dwss-shared-local");
  const fri = document.getElementById("dwss-shared-french");
  if (sw) sw.hidden = language !== "sw";
  if (fr) fr.hidden = language !== "fr";
  if (swi) swi.required = language === "sw";
  if (fri) fri.required = language === "fr";
}
function buildUi() {
  if (document.getElementById("dwss-shared-launch")) return;
  const style = document.createElement("style");
  style.textContent = [
    "#dwss-shared-launch{position:fixed;z-index:99990;right:18px;bottom:18px;border:0;border-radius:999px;padding:12px 17px;background:#173e52;color:#fff;font:600 14px/1.2 system-ui,sans-serif;box-shadow:0 5px 24px #0003;cursor:pointer}",
    "#dwss-shared-count{display:inline-flex;min-width:20px;height:20px;border-radius:20px;align-items:center;justify-content:center;background:#fff;color:#173e52;margin-left:5px;font-size:11px}",
    "#dwss-shared-panel{position:fixed;z-index:99991;right:14px;bottom:70px;width:min(450px,calc(100vw - 28px));height:min(76vh,720px);background:#fff;color:#182631;border:1px solid #dce4e9;border-radius:18px;box-shadow:0 12px 44px #0003;display:flex;flex-direction:column;overflow:hidden;font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}",
    "#dwss-shared-panel[hidden]{display:none}",
    ".dwss-shared-head{padding:15px 17px 11px;background:#f4f8fa;border-bottom:1px solid #e3e9ed}",
    ".dwss-shared-title{display:flex;align-items:center;justify-content:space-between;font-size:16px;font-weight:750}",
    ".dwss-shared-close{border:0;background:transparent;font-size:23px;color:#526573;cursor:pointer}",
    ".dwss-shared-status{font-size:12px;margin-top:4px;color:#23724d}",
    ".dwss-shared-status.offline,.dwss-shared-status.error{color:#9c5a21}",
    ".dwss-shared-status.connecting{color:#667784}",
    ".dwss-shared-tools{padding:11px 14px;display:flex;gap:8px;border-bottom:1px solid #edf0f2}",
    ".dwss-shared-tools input{flex:1;min-width:0;border:1px solid #ccd7dd;border-radius:10px;padding:10px 11px;font:inherit}",
    ".dwss-shared-btn{border:0;border-radius:10px;padding:9px 12px;background:#173e52;color:#fff;font:600 13px system-ui,sans-serif;cursor:pointer}",
    ".dwss-shared-scroll{overflow:auto;flex:1;padding:10px 13px}",
    ".dwss-shared-item{border:1px solid #e4e9ed;border-radius:12px;padding:11px 12px;margin-bottom:9px;background:#fff}",
    ".dwss-shared-item-top{display:flex;justify-content:space-between;gap:8px;align-items:center}",
    ".dwss-shared-item-top b{font-size:15px}",
    ".dwss-shared-item-top span{font-size:10px;color:#55717e;white-space:nowrap}",
    ".dwss-shared-local{font-size:14px;font-weight:650;margin-top:5px;color:#173e52;overflow-wrap:anywhere}",
    ".dwss-shared-pron{font-size:12px;color:#465965;margin-top:3px}",
    ".dwss-shared-meta{font-size:11px;color:#7a8992;margin-top:5px;overflow-wrap:anywhere}",
    ".dwss-shared-empty{padding:24px 10px;text-align:center;color:#71808a}",
    "#dwss-shared-form-wrap{padding:12px 14px;border-top:1px solid #e5eaed;background:#f8fafb;overflow:auto;max-height:52%}",
    "#dwss-shared-form-wrap[hidden]{display:none}",
    ".dwss-shared-form{display:grid;gap:8px}",
    ".dwss-shared-form label{display:grid;gap:4px;font-size:12px;font-weight:650;color:#465965}",
    ".dwss-shared-form input,.dwss-shared-form select,.dwss-shared-form textarea{width:100%;box-sizing:border-box;border:1px solid #cbd6dc;border-radius:9px;padding:9px 10px;font:14px system-ui,sans-serif;background:#fff;color:#182631}",
    ".dwss-shared-form textarea{min-height:54px;resize:vertical}",
    ".dwss-shared-form-actions{display:flex;justify-content:flex-end;gap:8px}",
    ".dwss-shared-hint{font-size:11px;color:#788790}",
    "@media(max-width:520px){#dwss-shared-launch{right:10px;bottom:12px;padding:11px 13px}#dwss-shared-panel{right:8px;bottom:62px;width:calc(100vw - 16px);height:78vh}}"
  ].join("\n");
  document.head.appendChild(style);
  const launch = document.createElement("button");
  launch.id = "dwss-shared-launch"; launch.type = "button";
  launch.innerHTML = '☁ 共享词库 <span id="dwss-shared-count">0</span>';
  document.body.appendChild(launch);
  const panel = document.createElement("section");
  panel.id = "dwss-shared-panel"; panel.hidden = true;
  panel.innerHTML =
    '<div class="dwss-shared-head"><div class="dwss-shared-title"><span>DWSS 云端共享词库</span><button type="button" class="dwss-shared-close" id="dwss-shared-close" aria-label="关闭">×</button></div><div id="dwss-shared-status" class="dwss-shared-status connecting">正在连接云端…</div><div class="dwss-shared-hint">所有人提交后自动共享；原始内置词典不会被改动。</div></div>' +
    '<div class="dwss-shared-tools"><input id="dwss-shared-search" type="search" placeholder="搜索中文、斯语、中文读音或法语"><button class="dwss-shared-btn" id="dwss-shared-add-toggle" type="button">＋ 添加新词</button></div>' +
    '<div class="dwss-shared-scroll" id="dwss-shared-list"></div>' +
    '<div id="dwss-shared-form-wrap" hidden><form id="dwss-shared-form" class="dwss-shared-form">' +
    '<label>中文意思<input name="chinese_text" required maxlength="500" placeholder="例如：检查车辆"></label>' +
    '<label>词条来源<select name="source_language" id="dwss-shared-language"><option value="sw">科卢韦齐斯瓦西里语</option><option value="fr">法语补位</option></select></label>' +
    '<label id="dwss-shared-local-field">当地斯瓦西里语拼写<input name="local_text" id="dwss-shared-local" maxlength="500" placeholder="当地实际说法"></label>' +
    '<label id="dwss-shared-french-field" hidden>法语原文<input name="french_text" id="dwss-shared-french" maxlength="500" placeholder="法语表达"></label>' +
    '<label>中文近似读音<input name="local_pronunciation_cn" required maxlength="500" placeholder="按当地实际发音填写"></label>' +
    '<label>分类<input name="category" maxlength="80" placeholder="日常 / 安保 / 车辆 / 工作"></label>' +
    '<label>备注<textarea name="notes" maxlength="1000" placeholder="使用场景或补充说明（可选）"></textarea></label>' +
    '<div class="dwss-shared-hint">提交后立即进入共享词库，其他在线手机会自动收到。中文近似读音仅作交流提示，建议以当地人实际发音为准。</div>' +
    '<div class="dwss-shared-form-actions"><button class="dwss-shared-btn" id="dwss-shared-cancel" type="button" style="background:#657780">取消</button><button class="dwss-shared-btn" type="submit">提交共享</button></div>' +
    '</form></div>';
  document.body.appendChild(panel);
  launch.addEventListener("click", () => { panelOpen = !panelOpen; panel.hidden = !panelOpen; if (panelOpen) render(); });
  document.getElementById("dwss-shared-close").addEventListener("click", () => { panelOpen = false; panel.hidden = true; });
  document.getElementById("dwss-shared-search").addEventListener("input", render);
  document.getElementById("dwss-shared-add-toggle").addEventListener("click", () =>
    toggleForm(document.getElementById("dwss-shared-form-wrap").hidden));
  document.getElementById("dwss-shared-cancel").addEventListener("click", () => toggleForm(false));
  document.getElementById("dwss-shared-language").addEventListener("change", e => setLanguage(e.target.value));
  document.getElementById("dwss-shared-form").addEventListener("submit", submitTerm);
  render(); count();
}
async function getClient() {
  if (supabase) return supabase;
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    throw new Error("共享词库组件未加载，请联网刷新页面后重试");
  }
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 5 } }
  });
  return supabase;
}
async function flushQueue(client) {
  if (!queue.length || !navigator.onLine) return;
  for (const item of queue.slice()) {
    const payload = Object.assign({}, item); delete payload.__pending; delete payload.id;
    let result = await client.from("shared_terms").insert(payload).select("*").single();
    if (result.error && result.error.code === "23505") {
      result = await client.from("shared_terms").select("*").eq("client_submit_id", item.client_submit_id).single();
    }
    if (result.error) { setStatus("有 " + queue.length + " 条待同步，联网后自动重试", "offline"); return; }
    queue = queue.filter(q => q.client_submit_id !== item.client_submit_id);
    save(QUEUE_KEY, queue); mergeTerm(result.data);
  }
  count(); setStatus("待同步词条已全部上传 · 共 " + terms.length + " 条", "ok");
}
async function connectCloud() {
  if (!navigator.onLine) { setStatus("离线：显示缓存，新词会排队等待联网", "offline"); return; }
  try {
    const client = await getClient();
    const result = await client.from("shared_terms").select("*").order("created_at", { ascending: false }).limit(1000);
    if (result.error) throw result.error;
    terms = result.data || []; save(CACHE_KEY, terms); render(); count(); notifyApp();
    if (!channel) {
      channel = client.channel("dwss-shared-terms-live")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "shared_terms" }, payload => {
          mergeTerm(payload.new);
          setStatus("实时同步已连接 · 最新 " + terms.length + " 条", "ok");
        })
        .subscribe(state => {
          if (state === "SUBSCRIBED") setStatus("实时同步已连接 · 最新 " + terms.length + " 条", "ok");
          else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") setStatus("实时连接暂不可用，仍可刷新读取云端词条", "error");
        });
    }
    setStatus("云端已连接 · " + terms.length + " 条共享词", "ok");
    await flushQueue(client);
  } catch (e) {
    setStatus("云端连接失败，保留本机缓存：" + (e && e.message ? e.message : "网络错误"), "error");
  }
}
async function submitTerm(event) {
  event.preventDefault();
  const form = event.currentTarget, data = new FormData(form);
  const src = String(data.get("source_language") || "sw");
  const chinese = String(data.get("chinese_text") || "").trim();
  const pron = String(data.get("local_pronunciation_cn") || "").trim();
  const local = String(data.get("local_text") || "").trim();
  const french = String(data.get("french_text") || "").trim();
  if (!chinese || !pron || (src === "sw" && !local) || (src === "fr" && !french)) {
    alert("请填写中文意思、中文近似读音，以及对应的斯语或法语表达。"); return;
  }
  const payload = {
    client_submit_id: uid(), chinese_text: chinese,
    local_text: src === "sw" ? local : null, local_pronunciation_cn: pron,
    source_language: src, french_text: src === "fr" ? french : null,
    category: String(data.get("category") || "").trim() || "未分类",
    notes: String(data.get("notes") || "").trim() || null
  };
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = "提交中…";
  if (!navigator.onLine) {
    queue.unshift(payload); save(QUEUE_KEY, queue); render(); count(); notifyApp();
    setStatus("已保存到本机，联网后自动提交", "offline");
    form.reset(); setLanguage("sw"); toggleForm(false);
    btn.disabled = false; btn.textContent = "提交共享"; return;
  }
  try {
    const client = await getClient();
    const result = await client.from("shared_terms").insert(payload).select("*").single();
    if (result.error) throw result.error;
    mergeTerm(result.data); setStatus("提交成功，已加入共享词库", "ok");
    form.reset(); setLanguage("sw"); toggleForm(false);
  } catch (e) {
    setStatus("提交失败：" + (e && e.message ? e.message : "请检查网络后重试"), "error");
    alert("共享词条提交失败，请稍后重试。\n" + (e && e.message ? e.message : ""));
  } finally { btn.disabled = false; btn.textContent = "提交共享"; }
}
window.DWSSSharedLexicon = Object.freeze({
  getTerms: getPublicTerms,
  refresh: connectCloud,
  get count() { return terms.length + queue.length; }
});
function start() {
  buildUi(); notifyApp(); connectCloud();
  window.addEventListener("online", connectCloud);
  window.addEventListener("offline", () => setStatus("离线：显示缓存，新词会排队等待联网", "offline"));
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
})();