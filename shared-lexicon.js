(() => {
"use strict";
if (window.__DWSS_SHARED_LEXICON_LOADED__) return;
window.__DWSS_SHARED_LEXICON_LOADED__ = true;
const SUPABASE_URL = "https://pautxzcfmtwkaunjxghj.supabase.co";
const SUPABASE_KEY = "sb_publishable_9BB_pwnlj6-gVHPFzpjivA_L7SGU_Bp";
const CACHE_KEY = "dwss_shared_terms_cache_v1";
const QUEUE_KEY = "dwss_shared_terms_queue_v1";
const CANONICAL_CACHE_KEY = "dwss_canonical_dictionary_cache_v1";
const PRONUNCIATION_VARIANTS_CACHE_KEY = "dwss_shared_pronunciation_variants_v1";
const CANONICAL_UPSERT_URL = SUPABASE_URL + "/functions/v1/dwss-upsert-dictionary-entry";
const VARIANT_SUBMIT_URL = SUPABASE_URL + "/functions/v1/dwss-submit-pronunciation-variant";
const VARIANT_MANAGE_URL = SUPABASE_URL + "/functions/v1/dwss-manage-pronunciation-variant";
let supabase = null, channel = null, panelOpen = false, language = "sw";
let terms = readArray(CACHE_KEY), queue = readArray(QUEUE_KEY);
let canonicalTerms = readArray(CANONICAL_CACHE_KEY), pronunciationVariants = readArray(PRONUNCIATION_VARIANTS_CACHE_KEY);
let flushing = false;
const personalSyncing = new Set();
function readArray(key) {
  try { const x = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(x) ? x : []; }
  catch (_) { return []; }
}
function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }
function normalizeCanonicalChinese(value) {
  return String(value || "").normalize("NFKC").replace(/[\s，。！？；：、,.!?;:（）()“”"　]+/gu, "").toLowerCase();
}
function canonicalTermKey(item) {
  const source = item && item.source_language === "fr" ? "fr" : "sw";
  const key = normalizeCanonicalChinese(item && (item.chinese_text || item.zh));
  return key ? source + "|" + key : "";
}
function canonicalAsSharedTerm(item, pending) {
  return Object.assign({}, item, { id: item.id || item.client_submit_id || "", __canonical: true, __pending: !!pending });
}
function getPublicTerms() {
  const activeCanonical = new Map();
  canonicalTerms.forEach(item => {
    const key = canonicalTermKey(item);
    if (key) activeCanonical.set(key, canonicalAsSharedTerm(item, false));
  });
  queue.filter(item => item && item.__canonical).forEach(item => {
    const key = canonicalTermKey(item);
    if (key) activeCanonical.set(key, canonicalAsSharedTerm(item, true));
  });
  const legacy = terms.concat(queue.filter(item => !item.__canonical).map(t => Object.assign({}, t, { __pending: true })));
  return legacy.filter(item => !activeCanonical.has(canonicalTermKey(item)))
    .concat(Array.from(activeCanonical.values())).map(item => Object.assign({}, item));
}
function getPronunciationVariants() {
  const rows = pronunciationVariants.map(item => Object.assign({}, item));
  for (const item of queue.filter(item => item && item.__variant)) {
    rows.unshift(Object.assign({}, item.variant || item, { __pending: true }));
  }
  return rows;
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
  if (el) el.textContent = String(terms.length + canonicalTerms.length + queue.length);
}
function mergeTerm(t) {
  if (!t) return;
  const found = terms.findIndex(x => (x.id && x.id === t.id) ||
    (x.client_submit_id && x.client_submit_id === t.client_submit_id));
  if (found >= 0) terms[found] = t; else terms.unshift(t);
  terms.sort((a,b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  save(CACHE_KEY, terms); render(); count(); notifyApp();
}
function mergeCanonicalTerm(t) {
  if (!t) return;
  const key = canonicalTermKey(t);
  if (!key) return;
  const found = canonicalTerms.findIndex(x => canonicalTermKey(x) === key || (x.id && x.id === t.id));
  const clean = Object.assign({}, t, { __canonical: true });
  if (found >= 0) canonicalTerms[found] = clean; else canonicalTerms.unshift(clean);
  canonicalTerms.sort((a, b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")));
  save(CANONICAL_CACHE_KEY, canonicalTerms); render(); count(); notifyApp();
}
function removeCanonicalTerm(t) {
  const key = canonicalTermKey(t);
  canonicalTerms = canonicalTerms.filter(x => key ? canonicalTermKey(x) !== key : x.id !== t.id);
  save(CANONICAL_CACHE_KEY, canonicalTerms); render(); count(); notifyApp();
}
function mergePronunciationVariant(row) {
  if (!row) return;
  const index = pronunciationVariants.findIndex(x => (row.id && x.id === row.id) ||
    (row.client_submit_id && x.client_submit_id === row.client_submit_id));
  if (index >= 0) pronunciationVariants[index] = row; else pronunciationVariants.unshift(row);
  pronunciationVariants.sort((a, b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")));
  save(PRONUNCIATION_VARIANTS_CACHE_KEY, pronunciationVariants);
  window.dispatchEvent(new CustomEvent("dwss:pronunciation-variants-updated", { detail: { variants: getPronunciationVariants() } }));
}
function removePronunciationVariant(row) {
  pronunciationVariants = pronunciationVariants.filter(x => x.id !== row.id);
  save(PRONUNCIATION_VARIANTS_CACHE_KEY, pronunciationVariants);
  window.dispatchEvent(new CustomEvent("dwss:pronunciation-variants-updated", { detail: { variants: getPronunciationVariants() } }));
}
async function postJson(url, payload) {
  const response = await fetch(url, { method: "POST", headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  let result = {}; try { result = await response.json(); } catch (_) {}
  if (!response.ok || !result.ok) throw new Error(result.error || ("共享词库服务器返回错误（" + response.status + "）"));
  return result;
}
async function submitCanonicalNow(payload) {
  const result = await postJson(CANONICAL_UPSERT_URL, payload);
  if (result.entry) mergeCanonicalTerm(result.entry);
  return result;
}
async function queueCanonicalEntry(entry, personalEntryId) {
  const source = entry && entry.source_language === "fr" ? "fr" : "sw";
  const chinese = String(entry && entry.chinese_text || "").trim();
  const normalized = normalizeCanonicalChinese(chinese);
  if (!chinese || !normalized) throw new Error("中文词条不能为空。");
  const payload = Object.assign({}, entry, { source_language: source, chinese_text: chinese, client_submit_id: uid(), __canonical: true });
  if (personalEntryId) payload.__personal_entry_id = personalEntryId;
  const key = canonicalTermKey(payload);
  const wasKnown = canonicalTerms.some(item => canonicalTermKey(item) === key) || terms.some(item => canonicalTermKey(item) === key);
  queue = queue.filter(item => !(item && item.__canonical && canonicalTermKey(item) === key));
  queue.unshift(payload);
  save(QUEUE_KEY, queue); render(); count(); notifyApp();
  if (!navigator.onLine) {
    setStatus("已保存到本机词库，联网后自动同步所有用户。", "offline");
    return { ok: true, queued: true, entry: payload, replaced: wasKnown, created: !wasKnown };
  }
  try {
    const result = await submitCanonicalNow(payload);
    queue = queue.filter(item => !(item && item.__canonical && item.client_submit_id === payload.client_submit_id));
    save(QUEUE_KEY, queue); render(); count(); notifyApp();
    return { ok: true, queued: false, entry: result.entry, replaced: wasKnown, created: !wasKnown };
  } catch (error) {
    setStatus("本机词条已保存；云端暂不可用，联网后自动同步。", "offline");
    return { ok: true, queued: true, entry: payload, replaced: wasKnown, created: !wasKnown, error: error.message || String(error) };
  }
}
function render() {
  const list = document.getElementById("dwss-shared-list");
  if (!list) return;
  const q = ((document.getElementById("dwss-shared-search") || {}).value || "").trim().toLowerCase();
  const pending = queue.map(t => Object.assign({}, t, { __pending: true }));
  const pendingCanonicalKeys = new Set(queue.filter(t => t && t.__canonical).map(canonicalTermKey));
  const canonical = canonicalTerms.filter(t => !pendingCanonicalKeys.has(canonicalTermKey(t)));
  const preferredKeys = new Set(canonicalTerms.concat(queue.filter(t => t && t.__canonical)).map(canonicalTermKey));
  const legacy = terms.filter(t => !preferredKeys.has(canonicalTermKey(t)));
  const matches = t => !q ||
    [t.chinese_text,t.local_text,t.local_pronunciation_cn,t.french_pronunciation_cn,t.french_text,t.category,t.notes]
      .join(" ").toLowerCase().includes(q);
  const rows = pending.concat(canonical, legacy).filter(matches).slice(0,300);
  if (!rows.length) {
    list.innerHTML = '<div class="dwss-shared-empty">暂无匹配词条。你可以添加第一个共享词条。</div>';
    return;
  }
  list.innerHTML = rows.map(t => {
    const fr = t.source_language === "fr";
    return '<article class="dwss-shared-item"><div class="dwss-shared-item-top"><b>' +
      esc(t.chinese_text) + '</b><span>' + (t.__pending ? "待联网同步" : (fr ? "法语补位" : "科卢韦齐斯瓦西里语")) +
      '</span></div><div class="dwss-shared-local">' + esc(fr ? t.french_text : (t.local_text || "当地拼写待补（中文谐音已收录）")) +
      '</div><div class="dwss-shared-pron">中文近似读音：' + esc(fr ? (t.french_pronunciation_cn || t.local_pronunciation_cn) : t.local_pronunciation_cn) +
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
  if (swi) swi.required = false;
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
    '<label id="dwss-shared-local-field">当地斯瓦西里语拼写（可选）<input name="local_text" id="dwss-shared-local" maxlength="500" placeholder="当地实际说法"></label>' +
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
function setPersonalStatus(entryId, status, submitId, message, type) {
  const app = window.KolweziSwahili;
  if (app && typeof app.setCustomShareStatus === "function") {
    app.setCustomShareStatus(entryId, status, submitId || "");
  }
  try {
    window.dispatchEvent(new CustomEvent("dwss:personal-share-status", {
      detail: { entryId, status, message: message || "", type: type || (status === "synced" ? "ok" : "offline") }
    }));
  } catch (_) {}
}
async function flushQueue(client) {
  if (!queue.length || !navigator.onLine || flushing) return;
  flushing = true;
  try {
    while (queue.length && navigator.onLine) {
      const item = queue[0];
      const payload = Object.assign({}, item);
      const personalEntryId = payload.__personal_entry_id || "";
      const isCanonical = !!payload.__canonical;
      const isVariant = !!payload.__variant;
      delete payload.__pending;
      delete payload.__personal_entry_id;
      delete payload.__canonical;
      delete payload.__variant;
      delete payload.id;
      let result;
      if (isCanonical) {
        const response = await submitCanonicalNow(payload);
        result = { data: response.entry, error: null };
      } else if (isVariant) {
        const response = await postJson(VARIANT_SUBMIT_URL, payload);
        result = { data: response.variant, error: null };
      } else {
        result = await client.from("shared_terms").insert(payload).select("*").single();
        if (result.error && result.error.code === "23505") {
          result = await client.from("shared_terms").select("*").eq("client_submit_id", item.client_submit_id).single();
        }
      }
      if (result.error) {
        if (personalEntryId) setPersonalStatus(personalEntryId, "queued", item.client_submit_id,
          "新词已保存在本机；云端暂时未响应，联网后会自动补传。", "offline");
        setStatus("有 " + queue.length + " 条待同步，联网后自动重试", "offline");
        return;
      }
      queue = queue.filter(q => q.client_submit_id !== item.client_submit_id);
      save(QUEUE_KEY, queue);
      if (isCanonical) mergeCanonicalTerm(result.data);
      else if (isVariant) mergePronunciationVariant(result.data);
      else mergeTerm(result.data);
      if (personalEntryId) setPersonalStatus(personalEntryId, "synced", item.client_submit_id,
        "新词已保存，并已自动同步到共享词库。", "ok");
    }
    count();
    setStatus("云端共享词库已同步 · 共 " + terms.length + " 条", "ok");
  } finally {
    flushing = false;
  }
}
function normalizeSharedText(value) {
  return String(value == null ? "" : value).trim().toLocaleLowerCase();
}
function buildPersonalPayload(entry, submitId) {
  const chinese = String(entry.zh || "").trim();
  const reading = String(entry.reading || "").trim();
  const latin = String(entry.latin || "").trim();
  const french = String(entry.french || "").trim();
  const frenchReading = String(entry.frenchReadingZh || "").trim();
  if (!chinese) return { error: "缺少中文意思，暂不能同步。" };

  // Local Katanga Swahili pronunciation must come from the user's verified entry.
  // A French fallback is shared as French and is never relabelled as local Swahili.
  if (reading) {
    return { payload: {
      client_submit_id: submitId,
      chinese_text: chinese,
      local_text: latin || null,
      local_pronunciation_cn: reading,
      source_language: "sw",
      french_text: french || null,
      category: String(entry.category || "").trim() || "未分类",
      notes: null
    }};
  }
  if (latin) {
    return { error: "本地词条已保存；共享还缺少“当地斯语中文谐音”。补齐当地真实读音后会自动同步，系统不会猜读音。" };
  }
  if (french) {
    const app = window.KolweziSwahili;
    const generated = app && typeof app.frenchReading === "function" ? app.frenchReading(french) : "";
    const pron = frenchReading || String(generated || "").trim();
    if (!pron) return { error: "法语备用词条缺少中文近似读音，暂不能同步。" };
    return { payload: {
      client_submit_id: submitId,
      chinese_text: chinese,
      local_text: null,
      local_pronunciation_cn: null,
      french_pronunciation_cn: pron,
      source_language: "fr",
      french_text: french,
      category: String(entry.category || "").trim() || "未分类",
      notes: null
    }};
  }
  return { error: "本地词条已保存；共享需要当地斯语中文谐音，或一条带中文近似读音的法语备用表达。" };
}
async function submitPersonalTerm(entry) {
  if (!entry || !entry.id || personalSyncing.has(entry.id)) return;
  personalSyncing.add(entry.id);
  try {
    const chinese = String(entry.zh || "").trim();
    const swReading = String(entry.reading || "").trim();
    const swText = String(entry.latin || "").trim();
    const french = String(entry.french || "").trim();
    const app = window.KolweziSwahili;
    const frenchReading = String(entry.frenchReadingZh || "").trim() ||
      (french && app && typeof app.frenchReading === "function" ? String(app.frenchReading(french) || "").trim() : "");
    if (!chinese) { setPersonalStatus(entry.id, "needs-info", "", "缺少中文意思，暂不能同步。", "offline"); return; }
    const payloads = [];
    if (swReading) payloads.push({
      source_language: "sw", chinese_text: chinese, local_text: swText || null,
      local_pronunciation_cn: swReading, category: String(entry.category || "未分类"), notes: entry.note || null
    });
    if (french && frenchReading) payloads.push({
      source_language: "fr", chinese_text: chinese, french_text: french,
      french_pronunciation_cn: frenchReading, category: String(entry.category || "未分类"), notes: entry.note || null
    });
    if (!payloads.length) {
      const message = swText ? "斯语拼写已保存；还需补充当地斯语中文谐音后才能共享。" :
        french ? "法语词条缺少中文近似音，请补充后再同步。" : "请至少填写一项语言表达及其中文谐音。";
      setPersonalStatus(entry.id, "needs-info", "", message, "offline"); return;
    }
    let queued = false, latestId = "";
    for (const payload of payloads) {
      const outcome = await queueCanonicalEntry(payload, entry.id);
      queued = queued || !!outcome.queued;
      latestId = outcome.entry && outcome.entry.client_submit_id || latestId;
    }
    setPersonalStatus(entry.id, queued ? "queued" : "synced", latestId,
      queued ? "词条已保存在本机；联网后自动同步并覆盖该中文词头的旧首选词条。" :
        "词条已保存为该语言的当前首选词条；其他用户的翻译和发音查询会使用新结果。",
      queued ? "offline" : "ok");
  } finally {
    personalSyncing.delete(entry.id);
  }
}
async function submitFrenchPronunciationCorrection(entry) {
  const chinese = String(entry && entry.chinese_text || "").trim();
  const french = String(entry && entry.french_text || "").trim();
  const reading = String(entry && entry.french_pronunciation_cn || "").trim();
  if (!chinese || chinese.length > 500) throw new Error("中文原文不能为空，且最多 500 个字符。");
  if (!french || french.length > 500) throw new Error("法语原文不能为空，且最多 500 个字符。");
  if (!reading || reading.length > 500) throw new Error("法语中文谐音不能为空，且最多 500 个字符。");

  const outcomes = [await queueCanonicalEntry({
    source_language: "fr", chinese_text: chinese, french_text: french,
    french_pronunciation_cn: reading, category: "法语词库修正",
    notes: "用户修改后的法语词条及对应中文近似音"
  })];
  const headwords = Array.isArray(entry.word_corrections) ? entry.word_corrections : [];
  const seen = new Set([normalizeCanonicalChinese(chinese)]);
  for (const word of headwords) {
    const wordChinese = String(word && word.chinese_text || "").trim();
    const wordFrench = String(word && word.french_text || "").trim();
    const wordReading = String(word && word.french_pronunciation_cn || "").trim();
    const key = normalizeCanonicalChinese(wordChinese);
    if (!wordChinese || !wordFrench || !wordReading || !key || seen.has(key)) continue;
    if (wordChinese.length > 500 || wordFrench.length > 500 || wordReading.length > 500) continue;
    seen.add(key);
    outcomes.push(await queueCanonicalEntry({
      source_language: "fr", chinese_text: wordChinese, french_text: wordFrench,
      french_pronunciation_cn: wordReading, category: "法语单词修正",
      notes: "从整句翻译逐词修改后写入的首选词条"
    }));
  }
  const queued = outcomes.some(item => item.queued);
  return {
    ok: true, synced: !queued, queued,
    replaced: outcomes.some(item => item.replaced),
    created: outcomes.some(item => item.created),
    entry: outcomes[0] && outcomes[0].entry,
    wordEntries: outcomes.slice(1).map(item => item.entry).filter(Boolean)
  };
}
async function submitQuickTranslationTerm(entry) {
  const chinese = String(entry && entry.chinese_text || "").trim();
  const reading = String(entry && entry.local_pronunciation_cn || "").trim();
  if (!chinese || !reading) throw new Error("中文词条和当地斯语中文谐音不能为空。");
  return await queueCanonicalEntry({ source_language: "sw", chinese_text: chinese,
    local_text: String(entry.local_text || "").trim() || null,
    local_pronunciation_cn: reading, category: "翻译新增词条", notes: "主翻译界面新增词条" });
}
async function submitPronunciationVariant(entry) {
  const payload = Object.assign({}, entry, { client_submit_id: entry && entry.client_submit_id || uid() });
  if (!navigator.onLine) {
    const local = Object.assign({}, payload, { id: payload.client_submit_id, status: "pending", __pending: true });
    queue = queue.filter(item => !(item && item.__variant && item.chinese_text === payload.chinese_text && item.pinyin_key === payload.pinyin_key && item.source_kind === payload.source_kind));
    queue.unshift(Object.assign({}, payload, { __variant: true, variant: local }));
    save(QUEUE_KEY, queue);
    window.dispatchEvent(new CustomEvent("dwss:pronunciation-variants-updated", { detail: { variants: getPronunciationVariants() } }));
    render(); count(); return { ok: true, queued: true, variant: local };
  }
  const result = await postJson(VARIANT_SUBMIT_URL, payload);
  if (result.variant) mergePronunciationVariant(result.variant);
  return result;
}
async function managePronunciationVariant(payload) {
  const result = await postJson(VARIANT_MANAGE_URL, payload);
  try {
    const client = await getClient();
    const refreshed = await client.from("shared_pronunciation_variants").select("*").order("updated_at", { ascending: false }).limit(5000);
    if (!refreshed.error) {
      pronunciationVariants = refreshed.data || [];
      save(PRONUNCIATION_VARIANTS_CACHE_KEY, pronunciationVariants);
      window.dispatchEvent(new CustomEvent("dwss:pronunciation-variants-updated", { detail: { variants: getPronunciationVariants() } }));
    }
  } catch (_) {}
  return result;
}
async function retryPending() {
  if (!navigator.onLine) return { ok: false, message: "当前离线；待同步记录仍保存在本机。" };
  await connectCloud();
  const pending = queue.length;
  return { ok: pending === 0, message: pending ? "仍有 " + pending + " 条待同步记录，将在网络恢复后继续重试。" : "全部新词和读音修正均已同步。" };
}
function needsAutomaticShare(entry) {
  const status = String(entry && entry.shareSyncStatus || "");
  if (status === "synced") return false;
  const hasLocalSwahiliReading = !!String(entry && entry.reading || "").trim();
  // A local Katanga Swahili reading is the sharing criterion, including legacy entries
  // created before automatic sharing was introduced. French-only entries require an
  // explicit pending/queued marker and remain labelled as French.
  return hasLocalSwahiliReading || ["pending", "queued"].includes(status);
}
async function syncPendingPersonalTerms() {
  const app = window.KolweziSwahili;
  if (!app || typeof app.getCustom !== "function") return;
  const entries = app.getCustom();
  for (const entry of entries) {
    const alreadyQueued = queue.some(q => q.__personal_entry_id === entry.id);
    if (alreadyQueued) continue;
    if (!needsAutomaticShare(entry)) continue;
    await submitPersonalTerm(entry);
  }
}
async function connectCloud() {
  if (!navigator.onLine) { setStatus("离线：显示本机词库和缓存，新词会排队等待联网", "offline"); return; }
  try {
    const client = await getClient();
    const [legacy, canonical, variants] = await Promise.all([
      client.from("shared_terms").select("*").order("created_at", { ascending: false }).limit(1500),
      client.from("shared_dictionary_entries").select("*").order("updated_at", { ascending: false }).limit(5000),
      client.from("shared_pronunciation_variants").select("*").order("updated_at", { ascending: false }).limit(5000)
    ]);
    if (legacy.error) throw legacy.error;
    if (canonical.error) throw canonical.error;
    if (variants.error) throw variants.error;
    terms = legacy.data || []; save(CACHE_KEY, terms);
    canonicalTerms = canonical.data || []; save(CANONICAL_CACHE_KEY, canonicalTerms);
    pronunciationVariants = variants.data || []; save(PRONUNCIATION_VARIANTS_CACHE_KEY, pronunciationVariants);
    render(); count(); notifyApp();
    window.dispatchEvent(new CustomEvent("dwss:pronunciation-variants-updated", { detail: { variants: getPronunciationVariants() } }));
    if (!channel) {
      channel = client.channel("dwss-shared-lexicon-live")
        .on("postgres_changes", { event: "*", schema: "public", table: "shared_terms" }, payload => {
          if (payload.eventType === "DELETE") {
            terms = terms.filter(item => item.id !== payload.old.id); save(CACHE_KEY, terms); render(); count(); notifyApp();
          } else mergeTerm(payload.new);
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "shared_dictionary_entries" }, payload => {
          if (payload.eventType === "DELETE") removeCanonicalTerm(payload.old);
          else mergeCanonicalTerm(payload.new);
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "shared_pronunciation_variants" }, payload => {
          if (payload.eventType === "DELETE") removePronunciationVariant(payload.old);
          else mergePronunciationVariant(payload.new);
        })
        .subscribe(state => {
          if (state === "SUBSCRIBED") setStatus("实时同步已连接 · 词条与读音修正自动更新", "ok");
          else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") setStatus("实时连接暂不可用，仍会定期读取云端词库", "error");
        });
    }
    setStatus("云端已连接 · 当前首选词条与本机缓存已更新", "ok");
    await flushQueue(client);
    await syncPendingPersonalTerms();
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
  if (!chinese || !pron || (src === "fr" && !french)) {
    alert("请填写中文意思、中文近似读音，以及对应的斯语或法语表达。"); return;
  }
  const payload = src === "fr"
    ? { source_language: "fr", chinese_text: chinese, french_text: french, french_pronunciation_cn: pron,
        category: String(data.get("category") || "未分类"), notes: String(data.get("notes") || "") }
    : { source_language: "sw", chinese_text: chinese, local_text: local || null, local_pronunciation_cn: pron,
        category: String(data.get("category") || "未分类"), notes: String(data.get("notes") || "") };
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = "正在保存…";
  try {
    const outcome = await queueCanonicalEntry(payload);
    setStatus(outcome.queued ? "已保存到本机首选词库；联网后自动同步所有用户。" : "已更新该语言的首选词条，其他用户会自动同步。", outcome.queued ? "offline" : "ok");
    form.reset(); setLanguage("sw"); toggleForm(false);
  } catch (e) {
    setStatus("提交失败：" + (e && e.message ? e.message : "请检查网络后重试"), "error");
    alert("共享词条提交失败，请稍后重试。\n" + (e && e.message ? e.message : ""));
  } finally { btn.disabled = false; btn.textContent = "提交共享"; }
}
window.DWSSSharedLexicon = Object.freeze({
  getTerms: getPublicTerms,
  getPronunciationVariants,
  refresh: connectCloud,
  submitPersonalTerm,
  submitFrenchPronunciationCorrection,
  submitQuickTranslationTerm,
  submitPronunciationVariant,
  managePronunciationVariant,
  retryPending,
  get count() { return terms.length + canonicalTerms.length + queue.length; }
});
function start() {
  // Shared vocabulary is automatic; do not create a separate floating UI.
  notifyApp();
  window.addEventListener("dwss:personal-term-added", event => {
    const detail = event && event.detail || {};
    const entry = detail.entry || detail;
    window.setTimeout(() => submitPersonalTerm(entry), 0);
  });
  window.addEventListener("dwss:app-ready", syncPendingPersonalTerms);
  window.addEventListener("online", connectCloud);
  window.addEventListener("offline", () => setStatus("离线：显示缓存，新词会排队等待联网", "offline"));
  connectCloud().catch(() => {});
  if (window.KolweziSwahili) syncPendingPersonalTerms().catch(() => {});
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
})();