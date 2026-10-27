#!/usr/bin/env python3
"""DWSS 0.9.13 focused product-quality fixes applied after the compact UI build."""
from pathlib import Path
import csv
import gzip
import json
import re
import sys
import unicodedata

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

# 1. Keep the dictionary engine/data, but permanently remove its primary-navigation entry.
html = read("index.html")
nav_new = """<nav class="tabs"><button class="tab" data-tab="maintenance"><span>添加</span><span>新词</span></button><button class="tab active" data-tab="translate"><span>翻译</span></button><button class="tab" data-tab="saved"><span>历史</span><span>记录</span></button></nav>"""
html, nav_count = re.subn(r'<nav class="tabs">.*?</nav>', lambda _: nav_new, html, count=1, flags=re.S)
if nav_count != 1:
    raise SystemExit("Primary navigation replacement failed")
html = replace_once(
    html,
    "DWSS 0.9.13 — one-step shared vocabulary sync and legacy edit bridge",
    "DWSS 0.9.18 — centered navigation, full source additions and owner signature",
    "release CSS marker",
)
html = re.sub(r"版本 0\.9\.11[^<]*", "版本 0.9.13 · DWSS 智能翻译 PWA", html, count=1)
if 'id="dictionary"' not in html or 'id="dictSearch"' not in html or 'data-tab="dictionary"' in html:
    raise SystemExit("Dictionary data panel should remain but no dictionary tab may appear")

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
    "grid-template-columns:minmax(0,1fr) minmax(0,1.22fr) minmax(0,1fr)",
    "centered three-column navigation",
)
nav_css = """
.tabs .tab{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-height:58px;line-height:1.15;padding:8px 4px}
.tabs .tab span{display:block}
.tabs .tab[data-tab="translate"]{font-size:15px;font-weight:800;letter-spacing:.08em}
.tabs .tab[data-tab="maintenance"],.tabs .tab[data-tab="saved"]{font-size:12px}
@media(max-width:420px){.tabs .tab{min-height:54px;font-size:11px}.tabs .tab[data-tab="translate"]{font-size:14px}}
"""
html = html.replace("</style>", nav_css + "\n</style>", 1)
owner_markup = (
    '<section class="owner-signature" aria-label="品牌寄语">'
    '<div class="owner-name">陈谍</div>'
    '<div class="owner-motto">以德立身 · 以信行远</div>'
    '<div class="owner-sides"><span>德行四海</span><span>威震八方</span></div>'
    '</section>'
)
html, owner_count = re.subn(r'(<section class="cover-frame"[^>]*>)(.*?)(</section>)', lambda m: m.group(1) + m.group(2) + owner_markup + m.group(3), html, count=1, flags=re.S)
if owner_count != 1:
    raise SystemExit("Could not place owner signature inside cover artwork")
owner_css = """
.cover-frame{position:relative}
.owner-signature{--owner-text-color:#f7f8fc;position:absolute;left:0;right:0;bottom:3.5%;z-index:5;margin:0;padding:0 8%;text-align:center;border:0;border-radius:0;background:transparent;color:#f2f5fb;box-shadow:none;pointer-events:none}
.owner-name{font-size:clamp(21px,3.2vw,27px);font-weight:800;letter-spacing:.2em;padding-left:.2em;color:var(--owner-text-color);text-shadow:0 1px 2px rgba(0,0,0,.45),0 0 10px rgba(222,232,250,.35)}
.owner-motto{margin-top:2px;font-size:11px;letter-spacing:.12em;color:#e7edf8;text-shadow:0 1px 4px rgba(0,0,0,.65)}
.owner-sides{display:flex;justify-content:space-between;align-items:center;margin:4px auto 0;max-width:none;font-size:clamp(11px,2.5vw,14px);font-weight:800;letter-spacing:.12em;color:var(--owner-text-color);text-shadow:0 1px 4px rgba(0,0,0,.75)}
@media(min-width:700px){.owner-signature{bottom:4%;padding:0 9%}.owner-name{font-size:28px}.owner-sides{font-size:15px}}
"""
html = html.replace("</style>", owner_css + "\n</style>", 1)
# Simplify the translation result: keep the local reading prominent and remove auxiliary panels.
result_css = """
#resultCard .quality-note,#resultCard .candidate-extra,#resultCard .segment-meta{display:none!important}
#resultCard .dwss-result-surface{background:#fff!important;color:inherit!important;border-color:transparent!important;box-shadow:none!important;border-radius:14px!important}
#resultCard #resultReading{background:#fff!important;border:0!important;box-shadow:none!important;cursor:pointer}
#resultCard #resultReading:focus-visible{outline:2px solid rgba(28,86,136,.35);outline-offset:3px}
"""
html = html.replace("</style>", result_css + "\n</style>", 1)
result_ui_script = r"""<script id="dwss-simple-result-ui">
(function(){
  function apply(){
    const card=document.getElementById('resultCard');
    if(!card)return;
    card.querySelectorAll('button').forEach(function(btn){
      const label=(btn.innerText||btn.textContent||'').replace(/[\s\u00a0]+/g,'');
      if(label.includes('复制读音'))btn.remove();
    });
    const reading=document.getElementById('resultReading');
    if(!reading)return;
    reading.classList.add('dwss-result-surface');
    if(reading.parentElement&&reading.parentElement!==card)reading.parentElement.classList.add('dwss-result-surface');
    reading.setAttribute('role','button');
    reading.setAttribute('tabindex','0');
    reading.setAttribute('aria-label','点击当地读音复制');
    reading.title='点击读音可复制';
    if(reading.dataset.dwssCopyBound==='1')return;
    async function copyReading(){
      const value=(reading.innerText||reading.textContent||'').trim();
      if(!value)return;
      let copied=false;
      try{await navigator.clipboard.writeText(value);copied=true;}
      catch(_){
        const field=document.createElement('textarea');
        field.value=value;field.setAttribute('readonly','');
        field.style.position='fixed';field.style.opacity='0';
        document.body.appendChild(field);field.select();
        try{copied=document.execCommand('copy');}catch(__){}
        field.remove();
      }
      reading.title=copied?'已复制当地读音':'复制失败，请长按读音选择文字';
    }
    reading.addEventListener('click',copyReading);
    reading.addEventListener('keydown',function(event){
      if(event.key==='Enter'||event.key===' '){event.preventDefault();copyReading();}
    });
    reading.dataset.dwssCopyBound='1';
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
  new MutationObserver(apply).observe(document.documentElement,{childList:true,subtree:true});
})();
</script>"""
if 'id="dwss-simple-result-ui"' not in html:
    if '</body>' not in html:
        raise SystemExit("Cannot insert compact result UI: body end tag missing")
    html = html.replace("</body>", result_ui_script + "\n</body>", 1)
if '#resultCard .quality-note' not in html or '点击当地读音复制' not in html:
    raise SystemExit("Compact result UI did not apply")
html = re.sub(r"版本 0\.9\.13[^<]*", "版本 0.9.18 · DWSS 智能翻译 PWA", html, count=1)
write("index.html", html)

# 2. Preserve source-book variants. File 1 marks 笔—撕提lou as French;
#    File 2 separately records 笔—比各. File 1 records 给我…—木尼白…;
#    File 2's PDF preserves the original string “刀呢莫挖” (莫).
#    The user's requested correction candidate “刀呢摸挖” (摸) is kept separately and never overwrites the source.
app = read("app.js")
db_anchor = "const DB = Array.isArray(window.SW_DB) ? window.SW_DB : [];"
db_patch = """const DB = Array.isArray(window.SW_DB) ? window.SW_DB : [];
DB.push(
 {zh:"给我",variants:[{reading:"刀呢摸挖",source:"用户提出的字形校正候选；原始PDF记录为“刀呢莫挖”，待科卢韦齐母语者核验",kind:"用户校正候选（待核验，不覆盖原文）"}]}
);"""
app = replace_once(app, db_anchor, db_patch, "preserve the user-reported reading candidate without overwriting the source spelling")

# French/local separation is enforced in finalize_shared_release.py before this build step.

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

# French-labelled entries in the old source are not local Swahili readings.
# Exclude them from local matching so they cannot outrank a real local variant.
app = replace_once(
    app,
    "const variants=(item.variants||[]).filter(v=>v.reading||v.latin);",
    "const variants=(item.variants||[]).filter(v=>(v.reading||v.latin)&&!/[（(]\\s*法\\s*[)）]/.test(v.reading||''));",
    "exclude French-marked entries from local matching",
)
app = replace_once(
    app,
    "if((item.variants||[]).some(v=>v.origin===origin&&(v.reading||v.latin)))return origin;",
    "if((item.variants||[]).some(v=>v.origin===origin&&(v.reading||v.latin)&&!/[（(]\\s*法\\s*[)）]/.test(v.reading||'')))return origin;",
    "do not classify French-only entries as local Swahili",
)
app = replace_once(
    app,
    "if(!v.reading&&!v.latin)return false;",
    "if((!v.reading&&!v.latin)||/[（(]\\s*法\\s*[)）]/.test(v.reading||''))return false;",
    "exclude French-marked entries from displayed local variants",
)
# Keep the app's dictionary results and French fallback attached to a shared row.
# Promote all unique source readings for a Chinese headword into the main result.
app = replace_once(
    app,
    "reading:localV.reading,latin,source:localV.source||'原始资料',item:found",
    "reading:uniqueLocalVariants(found).filter(v=>v.reading).map(v=>v.reading).join(' / '),latin,source:uniqueLocalVariants(found).filter(v=>v.reading).map(v=>v.source||'原始资料').join('；'),variants:uniqueLocalVariants(found).filter(v=>v.reading),item:found",
    "promote all source readings to primary translation",
)
app = replace_once(
    app,
    "const alts=uniqueLocalVariants(s.item).filter(v=>norm(v.reading)!==norm(s.reading));",
    "const alts=[];",
    "remove duplicate tiny alternative list",
)
if "lookupLocalSynonymAt(input,i)" in app[app.find("function tokenize(raw)"):app.find("function tokenize(raw)")+4000]:
    raise SystemExit("Automatic synonym lookup remains in the tokenizer")
# 2b. The dictionary has more entries than should be rendered in one DOM update.
#     Show the first 250, then let the user progressively reveal the rest.
app = replace_once(
    app,
    "function renderDictionary(){",
    "let dictVisibleLimit=250;\nfunction renderDictionary(){",
    "dictionary pagination state",
)
app = replace_once(
    app,
    "filtered.slice(0,250).map(x=>",
    "filtered.slice(0,dictVisibleLimit).map(x=>",
    "dictionary progressive render limit",
)
old_dictionary_end = """ $('dictResults').querySelectorAll('[data-fav]').forEach(b=>b.addEventListener('click',()=>toggleFav(b.dataset.fav)));
}"""
new_dictionary_end = """ $('dictResults').querySelectorAll('[data-fav]').forEach(b=>b.addEventListener('click',()=>toggleFav(b.dataset.fav)));
 if(filtered.length>dictVisibleLimit){
  const more=document.createElement('button');
  more.type='button';more.className='soft mini';
  more.textContent='加载更多（已显示 '+Math.min(dictVisibleLimit,filtered.length)+' / '+filtered.length+' 条）';
  more.style.cssText='width:100%;margin:10px 0 4px';
  more.addEventListener('click',()=>{dictVisibleLimit=Math.min(filtered.length,dictVisibleLimit+250);renderDictionary();});
  $('dictResults').appendChild(more);
 }
}"""
app = replace_once(app, old_dictionary_end, new_dictionary_end, "dictionary load-more control")
old_filter_events = "$('dictSearch').addEventListener('input',renderDictionary);$('category').addEventListener('change',renderDictionary);"
new_filter_events = "$('dictSearch').addEventListener('input',()=>{dictVisibleLimit=250;renderDictionary();});$('category').addEventListener('change',()=>{dictVisibleLimit=250;renderDictionary();});"
app = replace_once(app, old_filter_events, new_filter_events, "dictionary filters reset paging")
write("app.js", app)

# 3. Public shared vocabulary must never receive private source/contact notes
#    copied from a personal entry. Only the actual vocabulary fields are shared.
shared = read("shared-lexicon.js")
shared = replace_once(
    shared,
    '<label>备注<textarea name="notes"',
    '<label>公开备注（可选）<textarea name="notes"',
    "mark shared note as public",
)
shared = replace_once(
    shared,
    "使用场景或补充说明（可选）",
    "只填写适合所有人查看的通用说明，不要填写人名或内部信息",
    "public notes placeholder",
)
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

# 3b. Build a reproducible audit of every Chinese headword with multiple recorded readings.
dictionary_gz = public / "dictionary.js.gz"
if not dictionary_gz.is_file():
    raise SystemExit("Missing compressed dictionary for source-variant audit")
dictionary_text = gzip.decompress(dictionary_gz.read_bytes()).decode("utf-8")
dictionary_payload = dictionary_text.split("=", 1)[1].strip()
if dictionary_payload.endswith(";"):
    dictionary_payload = dictionary_payload[:-1]
source_entries = json.loads(dictionary_payload)

def audit_norm(value):
    value = unicodedata.normalize("NFKC", str(value or "")).lower()
    value = re.sub(r"[\s\u3000]+", "", value)
    return re.sub(r"[，。！？；：、,.!?;:（）()“”\"']", "", value)

# Import local candidate records absent from the 0.6.4 base dictionary.
# French-context and mixed-review rows are deliberately not inserted as local Swahili.
source_csv = Path(__file__).resolve().parents[1] / "data" / "dwss_new_local_source_terms.csv"
if not source_csv.is_file():
    raise SystemExit("Missing audited source additions: data/dwss_new_local_source_terms.csv")
pair_index = {}
for entry in source_entries:
    zh_key = audit_norm(entry.get("zh"))
    for variant in entry.get("variants") or []:
        pair_key = (zh_key, audit_norm(variant.get("reading")), audit_norm(variant.get("latin")))
        pair_index.setdefault(pair_key, variant)

source_rows_seen = 0
source_new_variants = 0
source_existing_provenance = 0
source_skipped_nonlocal = 0
with source_csv.open("r", encoding="utf-8-sig", newline="") as handle:
    for row in csv.DictReader(handle):
        if row.get("language_class") != "local_candidate":
            source_skipped_nonlocal += 1
            continue
        zh = str(row.get("chinese_meaning_original") or "").strip()
        reading = str(row.get("chinese_phonetic_original") or "").strip()
        latin = str(row.get("latin_original") or "").strip()
        if not zh or (not reading and not latin):
            raise SystemExit("Invalid local source row: " + str(row.get("source_record_id")))
        source_rows_seen += 1
        pair_key = (audit_norm(zh), audit_norm(reading), audit_norm(latin))
        source_ref = str(row.get("source_title") or "原始资料")
        if row.get("source_page"):
            source_ref += " 第" + str(row["source_page"]) + "页"
        source_ref += " [" + str(row.get("source_record_id") or "no-id") + "]"
        existing_variant = pair_index.get(pair_key)
        if existing_variant is not None:
            refs = existing_variant.setdefault("sourceRefs", [])
            if source_ref not in refs:
                refs.append(source_ref)
                source_existing_provenance += 1
            existing_source = str(existing_variant.get("source") or "").strip()
            if source_ref not in existing_source:
                existing_variant["source"] = (existing_source + ("；" if existing_source else "") + source_ref)
            continue
        new_variant = {
            "reading": reading,
            "latin": latin,
            "source": source_ref,
            "sourceRefs": [source_ref],
            "sourceRecordId": str(row.get("source_record_id") or ""),
            "sourceRawText": str(row.get("raw_source_text") or ""),
            "verificationStatus": str(row.get("verification_status") or "未由科卢韦齐母语者核验"),
            "kind": str(row.get("source_record_type") or "原始资料词条")
        }
        source_entries.append({"zh": zh, "variants": [new_variant]})
        pair_index[pair_key] = new_variant
        source_new_variants += 1

# Persist the augmented source dictionary before auditing or building the release app.
dictionary_output = "window.SW_DB = " + json.dumps(source_entries, ensure_ascii=False, separators=(",", ":")) + ";"
dictionary_gz.write_bytes(gzip.compress(dictionary_output.encode("utf-8"), compresslevel=9, mtime=0))
source_import_summary = [
    "DWSS 原始来源词库导入摘要",
    f"来源新增文件中的当地候选记录：{source_rows_seen}",
    f"新增独立表达：{source_new_variants}",
    f"合并到既有表达的来源引用：{source_existing_provenance}",
    f"排除的非当地候选记录：{source_skipped_nonlocal}",
    "法语及混合待核验记录不作为当地斯瓦西里语主读音导入。",
    "全部原始字形、来源记录ID及未核音状态保存在数据文件和词条来源元数据中。"
]
(public / "source_variant_import_summary.txt").write_text("\n".join(source_import_summary) + "\n", encoding="utf-8")

def is_french_marked(variant):
    return bool(re.search(r"[（(]\s*法\s*[)）]", str(variant.get("reading") or "")))

grouped_sources = {}
raw_variant_count = 0
for entry in source_entries:
    zh = str(entry.get("zh") or "").strip()
    key = audit_norm(zh)
    if not key:
        continue
    group = grouped_sources.setdefault(key, {"labels": [], "variants": {}})
    if zh not in group["labels"]:
        group["labels"].append(zh)
    for variant in entry.get("variants") or []:
        raw_variant_count += 1
        reading = str(variant.get("reading") or "").strip()
        latin = str(variant.get("latin") or "").strip()
        variant_key = audit_norm(reading) + "|" + audit_norm(latin)
        if not reading and not latin:
            continue
        if variant_key not in group["variants"]:
            group["variants"][variant_key] = {
                "reading": reading, "latin": latin,
                "kind": str(variant.get("kind") or ""),
                "sources": []
            }
        src = str(variant.get("source") or "原始资料未注明")
        if src not in group["variants"][variant_key]["sources"]:
            group["variants"][variant_key]["sources"].append(src)

all_unique_variants = sum(len(g["variants"]) for g in grouped_sources.values())
local_unique_variants = 0
french_unique_variants = 0
multi_any_groups = 0
multi_local_groups = 0
local_and_french_groups = 0
french_only_groups = 0
audit_rows = []
for key, group in grouped_sources.items():
    variants = list(group["variants"].values())
    local = [v for v in variants if not is_french_marked(v)]
    french = [v for v in variants if is_french_marked(v)]
    local_unique_variants += len(local)
    french_unique_variants += len(french)
    if len(variants) > 1:
        multi_any_groups += 1
    if len(local) > 1:
        multi_local_groups += 1
    if local and french:
        local_and_french_groups += 1
    if french and not local:
        french_only_groups += 1
    # Keep comma/slash-separated source text intact; no speculative splitting of uncertain OCR cells.
    if len(local) > 1 or (local and french):
        audit_rows.append({
            "中文词头": " / ".join(sorted(group["labels"])),
            "当地读音（原始记录，去重后并列）": " / ".join(v["reading"] or v["latin"] for v in local),
            "当地读音来源": "；".join(
                (v["reading"] or v["latin"]) + " ← " + "、".join(v["sources"]) for v in local
            ),
            "法语标注读音（单独列出，不作当地斯语）": " / ".join(v["reading"] for v in french),
            "法语来源": "；".join("、".join(v["sources"]) for v in french),
            "不同当地读音数量": str(len(local)),
            "是否同时含法语标注": "是" if french else "否",
            "用户待核对补充": "刀呢摸挖（用户提出的修订候选；PDF原文为刀呢莫挖，待核验）" if key == audit_norm("给我") else "",
            "核验状态": "保留所有来源读法；尚未完成科卢韦齐母语者逐条核音"
        })

if len(source_entries) < 1850 or raw_variant_count < 2200:
    raise SystemExit(f"Source dictionary unexpectedly small: entries={len(source_entries)}, variants={raw_variant_count}")
if len(grouped_sources) < 1800 or all_unique_variants < 2000:
    raise SystemExit(f"Normalized source dictionary unexpectedly small: groups={len(grouped_sources)}, unique_variants={all_unique_variants}")
if multi_local_groups < 200 or local_unique_variants < 2000:
    raise SystemExit("Multi-reading audit unexpectedly lost source variants; review before release")
by_label = {audit_norm(" / ".join(g["labels"])): g for g in grouped_sources.values()}
pen = grouped_sources.get(audit_norm("笔"))
give = grouped_sources.get(audit_norm("给我"))
if not pen or not {"比克", "比各"}.issubset({v["reading"] for v in pen["variants"].values() if not is_french_marked(v)}):
    raise SystemExit("Regression: the two local readings for 笔 are not both present")
if not pen or not any(is_french_marked(v) and "撕提" in v["reading"] for v in pen["variants"].values()):
    raise SystemExit("Regression: the French-marked pen entry was not retained separately")
if not give or not {"木尼白...", "刀呢莫挖"}.issubset({v["reading"] for v in give["variants"].values()}):
    raise SystemExit("Regression: the two source readings for 给我 are not grouped together")
if not any(row["中文词头"].find("给我") >= 0 and row["用户待核对补充"] for row in audit_rows):
    raise SystemExit("Regression: the user-reported 给我 spelling difference is not documented")

audit_path = public / "source_variant_audit.csv"
with audit_path.open("w", encoding="utf-8-sig", newline="") as handle:
    writer = csv.DictWriter(handle, fieldnames=list(audit_rows[0].keys()))
    writer.writeheader()
    writer.writerows(sorted(audit_rows, key=lambda row: row["中文词头"]))
summary = [
    "DWSS 两份来源词库多表达审计",
    f"压缩词库原始中文词头记录：{len(source_entries)}",
    f"压缩词库原始表达记录：{raw_variant_count}",
    f"按应用匹配规则归并后的中文词组：{len(grouped_sources)}",
    f"去重后的全部不同表达：{all_unique_variants}",
    f"去重后的非纯法语当地表达：{local_unique_variants}",
    f"法语标注表达（单独归类）：{french_unique_variants}",
    f"含两个或以上不同表达的词组（含法语标注）：{multi_any_groups}",
    f"含两个或以上不同当地读音的词组：{multi_local_groups}",
    f"同时含当地读音和法语标注的词组：{local_and_french_groups}",
    f"仅有法语标注读音的词组：{french_only_groups}",
    "",
    "处理规则：同一中文词组的不同当地读音在翻译主结果并列显示；完全相同的读音去重但来源留在审计CSV；（法）标注读音不作为当地斯语读音；不擅自拆分原资料中逗号/斜线连接的疑似复合读法。",
    "重要边界：该审计只证明原始词库记录与软件呈现逻辑，不能替代科卢韦齐母语者对发音、拼写、词义和语境的逐条确认。",
    "给我：文件1原文“木尼白...”；文件2 PDF原文“刀呢莫挖”；用户提出“刀呢摸挖”作为待核验校正候选，单独显示，不覆盖原文。"
]
(public / "source_variant_audit_summary.txt").write_text("\n".join(summary) + "\n", encoding="utf-8")

# 4. Cache version bump and release metadata.
sw = read("sw.js")
sw = replace_once(sw, "const APP_VERSION = '0.9.13';", "const APP_VERSION = '0.9.18';", "service worker cache version")
write("sw.js", sw)
version = read("VERSION.txt")
version = replace_once(version, "Version: 0.9.13", "Version: 0.9.18", "release version metadata")
write("VERSION.txt", version)

# 5. Ensure the release contains no regression in the preserved brand artwork.
if 'color:#f7f8fc' not in html or '.owner-name' not in html or '.owner-sides' not in html:
    raise SystemExit("Owner signature color rules are missing")
if 'src="cover.jpg"' not in html:
    raise SystemExit("Original DWSS cover artwork reference was removed")
print("DWSS 0.9.18 compact result UI, source additions, navigation and matching signature colors applied.")
