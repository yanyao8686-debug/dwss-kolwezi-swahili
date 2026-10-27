#!/usr/bin/env python3
"""DWSS 0.9.12 focused product-quality fixes applied after the compact UI build."""
from pathlib import Path
import re
import sys

public = Path(sys.argv[1] if len(sys.argv) > 1 else "public")
if not public.is_dir():
    raise SystemExit("Pages public/ directory is missing")

def read(name):
    path = public / name
    if not path.is_file():
        raise SystemExit(f"Missing release asset: {name}")
    return path.read_text(encoding="utf-8")

def write(name, value):
    (public / name).write_text(value, encoding="utf-8")

def replace_once(source, old, new, label, expected=1):
    count = source.count(old)
    if count != expected:
        raise SystemExit(f"{label}: expected {expected} exact match(es), found {count}")
    return source.replace(old, new, expected)

# 1. Restore the dictionary tab. The dictionary panel and search code were kept,
#    but the previous compact navigation accidentally removed its only entry point.
html = read("index.html")
nav_old = """<nav class="tabs"><button class="tab active" data-tab="translate">翻译</button><button class="tab" data-tab="saved">收藏 / 历史</button><button class="tab" data-tab="maintenance">添加新词</button></nav>"""
nav_new = """<nav class="tabs"><button class="tab active" data-tab="translate">翻译</button><button class="tab" data-tab="dictionary">词典</button><button class="tab" data-tab="saved">收藏 / 历史</button><button class="tab" data-tab="maintenance">添加新词</button></nav>"""
html = replace_once(html, nav_old, nav_new, "restore dictionary navigation")
html = replace_once(
    html,
    "DWSS 0.9.12 — one-step shared vocabulary sync and legacy edit bridge",
    "DWSS 0.9.12 — restored dictionary, safer sharing and manual candidates",
    "release CSS marker",
)
html = re.sub(r"版本 0\.9\.11[^<]*", "版本 0.9.12 · DWSS 智能翻译 PWA", html, count=1)
if 'id="dictionary"' not in html or 'id="dictSearch"' not in html or 'data-tab="dictionary"' not in html:
    raise SystemExit("Dictionary navigation/panel/search was not restored")

# A visible, plain-language privacy boundary for the personal vocabulary form.
privacy_note = (
    '<div class="maintenance-note" id="personalShareNotice" role="note">'
    '<b>自动共享说明：</b>保存符合条件的新词后，会自动进入公共共享词库。'
    '当地中文谐音、当地拼写/法语表达和分类会公开；“来源”和“个人备注”只保存在本机，不会上传。'
    '请勿在词条或公开备注中填写同事姓名、电话、证件号、门禁信息或公司内部敏感内容。'
    '</div>'
)
form_anchor = '<form id="entryForm">'
html = replace_once(html, form_anchor, privacy_note + form_anchor, "personal sharing privacy notice")
# The second, manually curated shared form has a public notes field. Label it as such.
html = replace_once(
    html,
    '<label>备注<textarea name="notes"',
    '<label>公开备注（可选）<textarea name="notes"',
    "mark shared note as public",
)
html = replace_once(
    html,
    "使用场景或补充说明（可选）",
    "只填写适合所有人查看的通用说明，不要填写人名或内部信息",
    "public notes placeholder",
)

# Correct the install prompt visibility without showing a permanently hidden PWA message.
hidden_install = ".status-strip #pwaMessage,.status-strip #installAppBtn{display:none!important}"
visible_install = (
    ".status-strip #pwaMessage{display:none!important}"
    ".status-strip #installAppBtn[hidden]{display:none!important}"
    ".status-strip #installAppBtn:not([hidden]){display:inline-flex!important;align-items:center;justify-content:center}"
)
html = replace_once(html, hidden_install, visible_install, "PWA install button visibility")
# Four nav items need four equal columns. Keep small-screen styles and the supplied cover artwork intact.
html = replace_once(
    html,
    "grid-template-columns:repeat(3,minmax(0,1fr))",
    "grid-template-columns:repeat(4,minmax(0,1fr))",
    "four-column tab layout",
)
write("index.html", html)

# 2. Do not silently substitute a synonym. Unknown input now displays curated candidates;
#    the user must click "替换并重译".
app = read("app.js")
old_shared_variant = """  const isFrench=c.source_language==='fr';
  item.variants.push({
   reading:isFrench?'':(c.reading||''), latin:isFrench?'':(c.latin||''),
   french:isFrench?(c.french||''):'', frenchReadingZh:isFrench?(c.frenchReadingZh||''):'',
   source:'云端共享词库', kind:'云端共享', note:c.note||'', sharedId:c.id||c.client_submit_id||'', origin:'shared'
  });"""
new_shared_variant = """  const isFrench=c.source_language==='fr';
  item.variants.push({
   reading:isFrench?'':(c.reading||''), latin:isFrench?'':(c.latin||''),
   french:c.french||'', frenchReadingZh:isFrench?(c.frenchReadingZh||''):'',
   source:'云端共享词库', kind:'云端共享', note:c.note||'', sharedId:c.id||c.client_submit_id||'', origin:'shared'
  });"""
app = replace_once(app, old_shared_variant, new_shared_variant, "preserve French fallback on shared Swahili rows")

old_apply_map = """  french:t.source_language==='fr'?String(t.french_text||'').trim():'',
  frenchReadingZh:t.source_language==='fr'?String(t.local_pronunciation_cn||'').trim():'',"""
new_apply_map = """  french:String(t.french_text||'').trim(),
  frenchReadingZh:t.source_language==='fr'?String(t.local_pronunciation_cn||'').trim():'',"""
app = replace_once(app, old_apply_map, new_apply_map, "shared French fallback mapping")

# Remove the tokenizer's automatic alias-consumption block, retaining the curated
# synonym table for manual recommendations in recommendAlternativesForUnknown().
alias_start = app.find("  const alias=lookupLocalSynonymAt(input,i);", app.find("function tokenize(raw)"))
alias_end = app.find("  // Any original/shared local match wins before a French match", alias_start)
if alias_start < 0 or alias_end < 0 or alias_end <= alias_start:
    raise SystemExit("Automatic synonym branch anchors not found")
alias_block = app[alias_start:alias_end]
if "matchedBy:'近义替代'" not in alias_block or "i+=alias.alias.length" not in alias_block:
    raise SystemExit("Automatic synonym block did not match expected reviewed logic")
app = app[:alias_start] + app[alias_end:]

# Keep the app's dictionary results and the French fallback attached to a shared row.
if "lookupLocalSynonymAt(input,i)" in app[app.find("function tokenize(raw)"):app.find("function tokenize(raw)")+4000]:
    raise SystemExit("Automatic synonym lookup remains in the tokenizer")
write("app.js", app)

# 3. Public shared vocabulary must never receive private source/contact notes
#    copied from a personal entry. Only the actual vocabulary fields are shared.
shared = read("shared-lexicon.js")
private_note_line = 'notes: [entry.source ? "来源：" + String(entry.source).trim() : "", String(entry.note || "").trim()].filter(Boolean).join(" · ") || null'
shared = replace_once(shared, private_note_line, "notes: null", "do not publish personal source/note", expected=2)

# Keep shared list searches consistent, show optional French fallback without
# mislabelling it as the local Swahili term, and allow revealing more than 300 rows.
shared = replace_once(
    shared,
    'let terms = readArray(CACHE_KEY), queue = readArray(QUEUE_KEY);',
    'let terms = readArray(CACHE_KEY), queue = readArray(QUEUE_KEY);\nlet cloudTotalCount = terms.length, visibleLimit = 300, retryTimer = null, retryDelay = 4000;',
    "shared pagination/retry state",
)
shared = replace_once(
    shared,
    'if (el) el.textContent = String(terms.length + queue.length);',
    'if (el) el.textContent = String(Math.max(cloudTotalCount, terms.length) + queue.length);',
    "accurate shared count",
)
shared = replace_once(
    shared,
    '  const pending = queue.map(t => Object.assign({}, t, { __pending: true }));\n  const filtered = terms.filter(t => !q ||\n    [t.chinese_text,t.local_text,t.local_pronunciation_cn,t.french_text,t.category,t.notes]\n      .join(" ").toLowerCase().includes(q));\n  const rows = pending.concat(filtered).slice(0,300);',
    '  const pending = queue.map(t => Object.assign({}, t, { __pending: true }));\n  const filtered = pending.concat(terms).filter(t => !q ||\n    [t.chinese_text,t.local_text,t.local_pronunciation_cn,t.french_text,t.category,t.notes]\n      .join(" ").toLowerCase().includes(q));\n  const rows = filtered.slice(0,visibleLimit);',
    "filter queued and cloud rows; paginate rendering",
)
shared = replace_once(
    shared,
    '  list.innerHTML = rows.map(t => {\n    const fr = t.source_language === "fr";\n    return \'<article class="dwss-shared-item"><div class="dwss-shared-item-top"><b>\' +\n      esc(t.chinese_text) + \'</b><span>\' + (t.__pending ? "待联网同步" : (fr ? "法语补位" : "科卢韦齐斯瓦西里语")) +\n      \'</span></div><div class="dwss-shared-local">\' + esc(fr ? t.french_text : (t.local_text || "当地拼写待补（中文谐音已收录）")) +\n      \'</div><div class="dwss-shared-pron">中文近似读音：\' + esc(t.local_pronunciation_cn) +\n      \'</div><div class="dwss-shared-meta">\' + esc(t.category || "未分类") +\n      (t.notes ? " · " + esc(t.notes) : "") + \'</div></article>\';\n  }).join("");',
    '  list.innerHTML = rows.map(t => {\n    const fr = t.source_language === "fr";\n    const frenchExtra = !fr && t.french_text ? \'<div class="dwss-shared-meta">法语备用：\' + esc(t.french_text) + \'</div>\' : "";\n    return \'<article class="dwss-shared-item"><div class="dwss-shared-item-top"><b>\' +\n      esc(t.chinese_text) + \'</b><span>\' + (t.__pending ? "待联网同步" : (fr ? "法语补位" : "科卢韦齐斯瓦西里语")) +\n      \'</span></div><div class="dwss-shared-local">\' + esc(fr ? t.french_text : (t.local_text || "当地拼写待补（中文谐音已收录）")) +\n      \'</div><div class="dwss-shared-pron">中文近似读音：\' + esc(t.local_pronunciation_cn) +\n      \'</div>\' + frenchExtra + \'<div class="dwss-shared-meta">\' + esc(t.category || "未分类") +\n      (t.notes ? " · " + esc(t.notes) : "") + \'</div></article>\';\n  }).join("") + (filtered.length > visibleLimit ? \'<button type="button" class="dwss-shared-btn" id="dwss-shared-more" style="width:100%;margin:8px 0 14px">加载更多（还有 \' + (filtered.length-visibleLimit) + \' 条）</button>\' : "");\n  const more = document.getElementById("dwss-shared-more");\n  if (more) more.addEventListener("click", () => { visibleLimit += 300; render(); });',
    "shared row rendering and load more",
)
shared = replace_once(
    shared,
    '  document.getElementById("dwss-shared-search").addEventListener("input", render);',
    '  document.getElementById("dwss-shared-search").addEventListener("input", () => { visibleLimit = 300; render(); });',
    "reset visible page on search",
)
# Fetch all shared entries in stable pages rather than silently stopping at 1,000.
old_fetch = '    const result = await client.from("shared_terms").select("*").order("created_at", { ascending: false }).limit(1000);\n    if (result.error) throw result.error;\n    terms = result.data || []; save(CACHE_KEY, terms); render(); count(); notifyApp();'
new_fetch = '''    const allRows = [];
    let offset = 0, exactCount = 0;
    const pageSize = 500, maxRows = 20000;
    while (offset < maxRows) {
      const result = await client.from("shared_terms").select("*", { count: offset === 0 ? "exact" : undefined })
        .order("created_at", { ascending: false }).range(offset, offset + pageSize - 1);
      if (result.error) throw result.error;
      const page = result.data || [];
      if (offset === 0) exactCount = Number(result.count || page.length);
      allRows.push(...page);
      if (page.length < pageSize) break;
      offset += pageSize;
    }
    cloudTotalCount = Math.max(exactCount, allRows.length);
    terms = allRows;
    save(CACHE_KEY, terms); render(); count(); notifyApp();'''
shared = replace_once(shared, old_fetch, new_fetch, "paginate Supabase shared lexicon reads")
# Add bounded retry with exponential backoff for transient online failures.
shared = replace_once(
    shared,
    'function normalizeSharedText(value) {',
    '''function scheduleRetry() {
  if (retryTimer || !navigator.onLine || !queue.length) return;
  const wait = retryDelay;
  retryDelay = Math.min(retryDelay * 2, 60000);
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    connectCloud().catch(() => {});
  }, wait);
}
function clearRetry() {
  if (retryTimer) window.clearTimeout(retryTimer);
  retryTimer = null; retryDelay = 4000;
}
function normalizeSharedText(value) {''',
    "retry helpers",
)
shared = replace_once(
    shared,
    '        setStatus("有 " + queue.length + " 条待同步，联网后自动重试", "offline");\n        return;',
    '        setStatus("有 " + queue.length + " 条待同步；网络恢复后自动重试", "offline");\n        scheduleRetry();\n        return;',
    "schedule queue retry",
)
shared = replace_once(
    shared,
    '    count();\n    setStatus("云端共享词库已同步 · 共 " + terms.length + " 条", "ok");',
    '    count(); clearRetry();\n    setStatus("云端共享词库已同步 · 共 " + Math.max(cloudTotalCount, terms.length) + " 条", "ok");',
    "clear retry after successful sync",
)
shared = replace_once(
    shared,
    '    setStatus("云端连接失败，保留本机缓存：" + (e && e.message ? e.message : "网络错误"), "error");',
    '    setStatus("云端连接失败，保留本机缓存：" + (e && e.message ? e.message : "网络错误"), "error");\n    if (queue.length) scheduleRetry();',
    "retry after cloud connection failure",
)
# An online submit whose response is lost is ambiguous; queue the same client_submit_id.
# A subsequent duplicate-key lookup resolves whether the first insert committed.
shared = replace_once(
    shared,
    '  } catch (e) {\n    setStatus("提交失败：" + (e && e.message ? e.message : "请检查网络后重试"), "error");\n    alert("共享词条提交失败，请稍后重试。\\n" + (e && e.message ? e.message : ""));',
    '  } catch (e) {\n    queue = queue.filter(q => q.client_submit_id !== payload.client_submit_id);\n    queue.unshift(payload); save(QUEUE_KEY, queue); render(); count(); notifyApp();\n    setStatus("提交结果暂未确认；已保留本机队列，联网后自动核对并补传。", "offline");\n    scheduleRetry();',
    "queue ambiguous manual shared submit",
)
write("shared-lexicon.js", shared)

# 4. Cache version bump and release metadata.
sw = read("sw.js")
sw = replace_once(sw, "const APP_VERSION = '0.9.11';", "const APP_VERSION = '0.9.12';", "service worker cache version")
write("sw.js", sw)
version = read("VERSION.txt")
version = replace_once(version, "Version: 0.9.11", "Version: 0.9.12", "version metadata")
write("VERSION.txt", version)

# 5. Ensure the release contains no regression in the preserved brand artwork.
if 'src="cover.jpg"' not in html:
    raise SystemExit("Original DWSS cover artwork reference was removed")
print("DWSS 0.9.12 product-quality patches applied.")
