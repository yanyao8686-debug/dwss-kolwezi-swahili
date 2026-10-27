#!/usr/bin/env python3
"""DWSS 0.9.32 matched input and result surfaces for the translation workspace."""
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
nav_new = """<nav class="tabs"><button class="tab" data-tab="maintenance"><span>添加新词</span></button><button class="tab" data-tab="saved"><span>历史记录</span></button><button class="nav-clear-slot" type="button" aria-label="清空信息">清空信息</button></nav>"""
html, nav_count = re.subn(r'<nav class="tabs">.*?</nav>', lambda _: nav_new, html, count=1, flags=re.S)
if nav_count != 1:
    raise SystemExit("Primary navigation replacement failed")
html = replace_once(
    html,
    "DWSS 0.9.13 — one-step shared vocabulary sync and legacy edit bridge",
    "DWSS 0.9.32 — three-action navigation, default translation and collapsed details",
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
# Clear any pre-existing signature card from older HTML before placing the two
# side mottos on the cover image itself.
html, _ = re.subn(r'<section class="owner-signature"[^>]*>.*?</section>\s*', '', html, flags=re.S)
owner_markup = (
    '<section class="owner-signature" aria-label="封面题字">'
    '<span class="owner-cover-author-backdrop" aria-hidden="true"></span>'
    '<span class="owner-cover-author">陈谍</span>'
    '<div class="owner-sides"><span>德行四海</span><span>威震八方</span></div>'
    '</section>'
)
html, owner_count = re.subn(r'(<section class="cover-frame"[^>]*>)(.*?)(</section>)', lambda m: m.group(1) + m.group(2) + owner_markup + m.group(3), html, count=1, flags=re.S)
if owner_count != 1:
    raise SystemExit("Could not place owner signature inside cover artwork")
owner_css = """
/* Cover typography: one metallic-gold type system for 陈谍 and both side mottos. */
.cover-frame{position:relative!important;width:min(100%,690px)!important;aspect-ratio:1/1;height:auto!important;min-height:0!important;max-height:none!important;margin:0 auto 14px!important;border-radius:0 0 20px 20px;overflow:hidden;container-type:inline-size}
.cover-image{display:block;width:100%!important;max-width:none!important;height:100%!important;max-height:none!important;object-fit:contain}
.owner-signature{--owner-gold:#e9c978;position:absolute;inset:0;z-index:5;margin:0;padding:0;pointer-events:none}
.owner-cover-author-backdrop{position:absolute;left:50%;top:81.2%;width:34%;height:10.5%;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(ellipse at center,rgba(3,20,64,.98) 0%,rgba(3,20,64,.94) 52%,rgba(3,20,64,.60) 72%,rgba(3,20,64,0) 100%);filter:blur(2px)}
.owner-cover-author,.owner-sides span{position:relative;display:inline-block;margin:0;font-family:"Noto Serif SC","Songti SC","STSong","SimSun",serif;font-size:clamp(14px,5.0vw,34px);font-weight:700;line-height:1.02;letter-spacing:.08em;color:var(--owner-gold);background:linear-gradient(180deg,#fff7d9 0%,#f2d891 30%,#d7ad58 72%,#f6dda0 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;-webkit-text-stroke:.25px rgba(255,245,211,.58);text-shadow:0 1px 0 rgba(96,62,17,.72),0 2px 2px rgba(0,0,0,.42),0 0 7px rgba(255,220,145,.38);filter:brightness(1.15);white-space:nowrap}
@supports (font-size:1cqw){.owner-cover-author,.owner-sides span{font-size:5.0cqw}}
.owner-cover-author{position:absolute;left:50%;top:81.2%;transform:translate(-50%,-50%);letter-spacing:.12em}
.owner-sides{position:absolute;left:6.5%;right:6.5%;bottom:7.2%;display:flex;justify-content:space-between;align-items:center;gap:10px;width:auto;margin:0;padding:0}
.owner-sides span{letter-spacing:.055em}
@media(max-width:360px){.owner-cover-author,.owner-sides span{font-size:5.0cqw}}
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
html = re.sub(r"版本 0\.9\.13[^<]*", "版本 0.9.32 · DWSS 智能翻译 PWA", html, count=1)

# 1b. Use one Google-Translate-style card with the Chinese input above and
#     the local-reading result directly below. Keep a hidden samples node
#     because the legacy app initializer still populates it at startup.
def find_div_bounds(source, start):
    opening = re.match(r'<div\b[^>]*>', source[start:])
    if not opening:
        raise SystemExit("Translation workspace: opening div not found")
    open_end = start + opening.end()
    depth = 1
    for token in re.finditer(r'<div\b[^>]*>|</div\s*>', source[open_end:], re.I):
        if token.group(0).lower().startswith('<div'):
            depth += 1
        else:
            depth -= 1
            if depth == 0:
                return start, open_end, open_end + token.start(), open_end + token.end()
    raise SystemExit("Translation workspace: unbalanced div structure")

def ensure_hidden_samples_node(source):
    samples = re.search(r'<(?:div|span)\b[^>]*\bid=["\']samples["\'][^>]*>', source, re.I)
    if samples:
        tag = samples.group(0)
        if re.search(r'\bhidden(?:\s|=|>)', tag, re.I):
            return source
        updated = re.sub(r'>$', ' hidden aria-hidden="true">', tag)
        return source[:samples.start()] + updated + source[samples.end():]
    if "</body>" not in source:
        raise SystemExit("Cannot add hidden samples compatibility node: body end tag missing")
    return source.replace("</body>", '<div id="samples" hidden aria-hidden="true"></div>\n</body>', 1)

# The post-upgrade release can already contain this layout. Accept that form
# and make the transformation idempotent instead of searching for legacy cards.
if 'id="translationWorkspace"' in html:
    if 'id="inputText"' not in html or 'id="resultReading"' not in html or 'id="resultCard"' not in html:
        raise SystemExit("Existing translation workspace is incomplete")
    visible_samples = re.search(
        r'<div\b(?=[^>]*\bclass="[^"]*\bcard\b[^"]*")[^>]*>\s*<h2\b[^>]*>[^<]*常用表达[^<]*</h2>',
        html, flags=re.S
    )
    if visible_samples:
        samples_bounds = find_div_bounds(html, visible_samples.start())
        html = html[:samples_bounds[0]] + html[samples_bounds[3]:]
    html = ensure_hidden_samples_node(html)
else:
    input_match = re.search(
        r'<div\b(?=[^>]*\bclass="[^"]*\bcard\b[^"]*")[^>]*>\s*<h2\b[^>]*>\s*输入[^<]*</h2>',
        html, flags=re.S
    )
    result_match = re.search(
        r'<div\b(?=[^>]*\bid="resultCard")[^>]*>',
        html, flags=re.S
    )
    samples_match = re.search(
        r'<div\b(?=[^>]*\bclass="[^"]*\bcard\b[^"]*")[^>]*>\s*<h2\b[^>]*>[^<]*常用表达[^<]*</h2>',
        html, flags=re.S
    )
    if not input_match or not result_match or not samples_match:
        headings = [re.sub(r'<[^>]+>', '', value).strip() for value in re.findall(r'<h2\b[^>]*>(.*?)</h2>', html, flags=re.S)]
        raise SystemExit(
            "Translation workspace anchors missing: "
            f"input={bool(input_match)}, result={bool(result_match)}, samples={bool(samples_match)}; "
            f"visible headings={headings[:20]}"
        )
    if not (input_match.start() < result_match.start() < samples_match.start()):
        raise SystemExit("Translation cards are not in the expected input/result/samples order")
    input_bounds = find_div_bounds(html, input_match.start())
    result_bounds = find_div_bounds(html, result_match.start())
    samples_bounds = find_div_bounds(html, samples_match.start())
    input_inner = html[input_bounds[1]:input_bounds[2]]
    input_inner = re.sub(r'(<h2\b[^>]*>\s*)输入你想表达的中文\s*(</h2>)', r'\1输入你想表达的中文：\2', input_inner, count=1)
    result_inner = html[result_bounds[1]:result_bounds[2]]

    # Preserve the legacy source node for renderTranslation(), but do not
    # depend on the exact label text, attribute order, or separator markup.
    result_inner, source_count = re.subn(
        r'<div\b(?=[^>]*\bid="resultOriginal")[^>]*>.*?</div>',
        lambda match: '<div class="source-echo" hidden><div class="resultlabel">输入原文</div>' + match.group(0) + '</div>',
        result_inner, count=1, flags=re.S
    )
    if source_count != 1:
        raise SystemExit("Could not preserve #resultOriginal in its hidden compatibility node")
    result_inner = re.sub(
        r'<div class="resultlabel">[^<]*</div>\s*(?=<div class="source-echo" hidden>)',
        '',
        result_inner, count=1, flags=re.S
    )
    result_inner = re.sub(r'</div>\s*<hr[^>]*>', '</div>', result_inner, count=1, flags=re.S)
    result_inner = result_inner.replace('<h2>翻译结果</h2>', '<h2>翻译的斯语中文谐音：</h2>', 1)
    result_inner = result_inner.replace('翻译的斯语中文谐音：</h2>', '翻译的斯语中文谐音：</h2>', 1)
    result_inner = result_inner.replace(
        '当地斯瓦西里语中文谐音（法语补位显示中文谐音并标注“法语”）',
        '当地读音 · 中文谐音（法语备用会单独标注）', 1
    )
    result_inner = result_inner.replace('翻译后显示', '输入中文后，结果会自动显示在这里', 1)

    workspace = (
        '<div class="card translation-workspace" id="translationWorkspace" role="region" aria-label="中文输入与斯语翻译结果">'
        '<section class="translation-input-section" aria-label="中文输入">' + input_inner + '</section>'
        '<div class="workspace-divider" role="separator" aria-hidden="true"></div>'
        '<section class="translation-output-section" id="resultCard" aria-live="polite">' + result_inner + '</section>'
        '</div><div id="samples" hidden aria-hidden="true"></div>'
    )
    html = html[:samples_bounds[0]] + html[samples_bounds[3]:]
    html = html[:result_bounds[0]] + html[result_bounds[3]:]
    html = html[:input_bounds[0]] + workspace + html[input_bounds[3]:]

html = ensure_hidden_samples_node(html)
html = html.replace('输入你想表达的中文：</h2>', '输入你想表达的中文：</h2>', 1)
html = html.replace('当地斯语中文谐音</h2>', '翻译的斯语中文谐音：</h2>', 1)
if html.count('id="translationWorkspace"') != 1 or html.count('id="samples"') != 1:
    raise SystemExit("Translation workspace or hidden compatibility node was not created exactly once")
if '<h2>常用表达</h2>' in html or 'id="resultReading"' not in html:
    raise SystemExit("The visible samples card remains or the result node is missing")

workspace_css = r"""
/* DWSS 0.9.32 — three equal actions, default translation home and collapsed secondary details */
#translate.panel.active{display:block!important}
nav.tabs{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:7px!important;align-items:stretch}
nav.tabs .tab,nav.tabs .nav-clear-action{min-width:0!important;width:100%!important;min-height:52px!important;padding:8px 3px!important;display:flex!important;align-items:center!important;justify-content:center!important;white-space:nowrap!important;font-size:clamp(13px,3.1vw,16px)!important;line-height:1.15!important;flex:initial!important}
nav.tabs .tab span{display:inline!important}
nav.tabs .nav-clear-action{border:1px solid #e1e7ed!important;border-radius:15px!important;background:linear-gradient(145deg,#f4f6f8,#e9eef3)!important;color:#425a73!important;font-weight:700;box-shadow:0 2px 5px rgba(29,55,81,.045)}
nav.tabs .tab.active{border-color:#123f70!important;background:linear-gradient(135deg,#103966,#1c5688)!important;color:#fff!important;box-shadow:0 7px 16px rgba(16,57,102,.22)}
nav.tabs .nav-clear-action:active{transform:translateY(1px)}
nav.tabs .nav-clear-action:focus-visible,.dwss-return-translation:focus-visible{outline:3px solid rgba(207,169,77,.35)!important;outline-offset:2px}
.dwss-return-translation{display:flex;align-items:center;justify-content:flex-start;width:100%;margin:0 0 10px;padding:3px 2px 8px;background:transparent;color:#c49b43;font-size:13px;font-weight:750;text-align:left}
#translationWorkspace.card{display:flex;flex-direction:column;gap:0;overflow:hidden;padding:0;border:1px solid #dfe7f1;border-radius:18px;background:#fff;box-shadow:0 10px 26px rgba(17,44,82,.06);margin:0 0 10px}
.translation-input-section,.translation-output-section{min-width:0}
.translation-input-section{padding:10px 12px 5px}
.translation-output-section{padding:5px 12px 12px;background:#fff;min-height:0;scroll-margin-top:70px}
.translation-input-section>h2{font-size:16px;margin:0 0 6px;color:#d3a94d!important;font-weight:800;letter-spacing:-.02em}
#inputText{display:block;width:100%;box-sizing:border-box;min-height:88px;height:auto;max-height:none;overflow-x:hidden;overflow-y:hidden;resize:none;border:1px solid #dfc477;border-radius:14px;padding:10px 12px;background:#F7E3A0!important;color:#28344a!important;font-size:16px;line-height:1.55;box-shadow:inset 0 1px 2px rgba(111,82,24,.05)}
#inputText::placeholder{color:#8a7440;opacity:.8}
#inputText:focus{outline:none;border-color:#b88d2e;box-shadow:0 0 0 3px rgba(217,184,91,.16)}
.workspace-divider{height:1px;margin:0 12px;background:#e7edf4}
#resultCard .sectionTitle{align-items:center;margin-bottom:3px}
#resultCard>.copyline{display:none!important}
#resultCard .sectionTitle h2{font-size:16px;font-weight:800;letter-spacing:-.02em;color:#d3a94d!important}
#resultCard .resultlabel{font-size:10px;color:#78869c;letter-spacing:.02em}
#resultCard #resultReading{width:100%;box-sizing:border-box;min-height:88px;padding:10px 12px;border:1px solid #dfc477!important;border-radius:14px!important;background:#F7E3A0!important;box-shadow:inset 0 1px 2px rgba(111,82,24,.05)!important;color:#28344a;font-size:clamp(22px,4.4vw,30px);font-weight:800;line-height:1.45;letter-spacing:.02em;overflow-wrap:anywhere;display:flex;align-items:center}
#resultCard #resultReading.empty{font-size:15px;font-weight:500;color:#93a0b2}
#resultCard #translateBtn{display:none!important}
#resultCard .stats{margin-top:6px;margin-bottom:4px}
#resultCard .quality-note,#resultCard .candidate-extra,#resultCard .segment-meta{display:none!important}
#resultCard .dwss-secondary-details{margin-top:7px;border-top:1px solid #e8edf4;padding-top:5px}
#resultCard .dwss-secondary-details>summary{list-style:none;cursor:pointer;color:#718096;font-size:12px;padding:5px 2px}
#resultCard .dwss-secondary-details>summary::-webkit-details-marker{display:none}
#resultCard .dwss-secondary-details>summary:before{content:"＋";display:inline-block;margin-right:7px;color:#c49b43;font-weight:800}
#resultCard .dwss-secondary-details[open]>summary:before{content:"－"}
#resultCard .dwss-secondary-details .hint,#resultCard .dwss-secondary-details .segmentlist,#resultCard .dwss-secondary-details .quality-note,#resultCard .dwss-secondary-details .candidate-extra,#resultCard .dwss-secondary-details .segment-meta{display:block!important;margin:7px 0!important}
#resultCard .dwss-secondary-details details{margin:5px 0}
#samples[hidden]{display:none!important}
@media(min-width:760px){.panel#translate.active{display:block!important}.panel#translate>.translation-workspace{width:100%;max-width:880px;margin:0 auto 10px}}
@media(max-width:520px){nav.tabs{gap:5px!important}nav.tabs .tab,nav.tabs .nav-clear-action{min-height:48px!important;padding:7px 2px!important;font-size:13px!important}#translationWorkspace.card{border-radius:16px}.translation-input-section{padding:8px 10px 4px}.translation-output-section{padding:4px 10px 10px}#resultCard #resultReading{font-size:23px}}
"""
html = html.replace("</style>", workspace_css + "\n</style>", 1)
if html.count('id="translationWorkspace"') != 1 or html.count('id="samples" hidden') != 1:
    raise SystemExit("Translation workspace or hidden compatibility node was not created exactly once")
if '<h2>常用表达</h2>' in html or 'id="resultReading"' not in html:
    raise SystemExit("The visible samples card remains or the result node is missing")

autogrow_script = r"""<script id="dwss-autogrow-input">
(function(){
  function fit(input){
    if(!input)return;
    input.style.height='auto';
    const border=parseFloat(getComputedStyle(input).borderTopWidth||0)+parseFloat(getComputedStyle(input).borderBottomWidth||0);
    input.style.height=Math.max(88,input.scrollHeight+border)+'px';
    input.style.overflowY='hidden';
  }
  function init(){
    const input=document.getElementById('inputText');
    const inputSection=document.querySelector('.translation-input-section');
    const outputSection=document.querySelector('.translation-output-section');
    if(!input||!inputSection||!outputSection)return;
    const actions=inputSection.querySelector('.actions');
    const helper=inputSection.querySelector('.hint');
    const stats=outputSection.querySelector('.stats');
    const nav=document.querySelector('nav.tabs');
    const clearSlot=nav&&nav.querySelector('.nav-clear-slot');
    const clearButton=document.getElementById('clearBtn');
    const translateButton=document.getElementById('translateBtn');
    if(clearSlot&&clearButton){
      clearButton.className='nav-clear-action';
      clearButton.textContent='清空信息';
      clearButton.setAttribute('aria-label','清空当前中文输入和翻译结果');
      clearSlot.replaceWith(clearButton);
    }
    if(translateButton){translateButton.hidden=true;translateButton.textContent='自动翻译';}
    if(actions&&actions.parentElement!==outputSection)outputSection.insertBefore(actions,stats||null);
    if(helper&&helper.parentElement!==outputSection)outputSection.insertBefore(helper,stats||null);
    const secondary=[];
    Array.from(outputSection.children).forEach(node=>{
      if(node.classList.contains('stats') ||
         node.matches('details.quality-note,details.hint') ||
         node.classList.contains('segmentlist') ||
         (node.classList.contains('resultlabel')&&node.textContent.includes('匹配明细'))){
        secondary.push(node);
      }
    });
    if(secondary.length&&!outputSection.querySelector('.dwss-secondary-details')){
      const disclosure=document.createElement('details');disclosure.className='dwss-secondary-details';
      const summary=document.createElement('summary');summary.textContent='查看翻译依据与匹配详情（需要时展开）';disclosure.appendChild(summary);
      secondary.forEach(node=>disclosure.appendChild(node));outputSection.appendChild(disclosure);
    }
    const goTranslate=()=>{
      document.querySelectorAll('.panel').forEach(panel=>panel.classList.toggle('active',panel.id==='translate'));
      document.querySelectorAll('nav.tabs .tab').forEach(tab=>tab.classList.remove('active'));
      window.scrollTo({top:0,behavior:'smooth'});
    };
    ['maintenance','saved'].forEach(panelId=>{
      const panel=document.getElementById(panelId);
      if(panel&&!panel.querySelector('.dwss-return-translation')){
        const back=document.createElement('button');
        back.type='button';back.className='dwss-return-translation';
        back.textContent='← 返回翻译主界面';
        back.addEventListener('click',goTranslate);
        const card=panel.querySelector('.card')||panel;
        card.insertBefore(back,card.firstChild);
      }
    });
    if(input.dataset.dwssAutoGrowBound!=='1'){
      input.addEventListener('input',function(){fit(input);});
      input.addEventListener('change',function(){fit(input);});
      window.addEventListener('resize',function(){fit(input);},{passive:true});
      input.dataset.dwssAutoGrowBound='1';
    }
    fit(input);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
</script>"""
existing_autogrow, autogrow_count = re.subn(
    r'<script id="dwss-autogrow-input">.*?</script>',
    lambda _: autogrow_script,
    html, count=1, flags=re.S
)
if autogrow_count == 1:
    html = existing_autogrow
elif "</body>" in html:
    html = html.replace("</body>", autogrow_script + "\n</body>", 1)
else:
    raise SystemExit("Cannot add auto-growing input control: body end tag missing")
# Remove the old manual-translation action text; the compatibility button stays hidden,
# while the existing input listener continues to translate automatically.
html = html.replace("查词并拼配", "自动翻译")
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

# Live translation while typing: do not add every keystroke to query history.
app = replace_once(
    app,
    "$('translateBtn').addEventListener('click',renderTranslation);$('clearBtn')",
    "let dwssInputTimer=null;const scheduleDwssLiveTranslation=delay=>{clearTimeout(dwssInputTimer);dwssInputTimer=setTimeout(()=>renderTranslation({recordHistory:false}),delay);};$('inputText').addEventListener('compositionstart',()=>clearTimeout(dwssInputTimer));$('inputText').addEventListener('compositionend',()=>scheduleDwssLiveTranslation(180));$('inputText').addEventListener('input',event=>{if(event&&event.isComposing)return;scheduleDwssLiveTranslation(420);});$('translateBtn').addEventListener('click',renderTranslation);$('clearBtn')",
    "Google-style live translation input binding",
)
app = replace_once(
    app,
    "$('resultReading').textContent='翻译后显示';",
    "$('resultReading').textContent='输入中文后，结果会自动显示在这里';",
    "Google-style empty reading prompt",
)

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
if shared.count(private_note_line) == 2:
    shared = replace_once(shared, private_note_line, "notes: null", "do not publish personal source/note", expected=2)
elif shared.count("notes: null") >= 2:
    print("PASS: personal source and note fields are already excluded from automatic sharing.")
else:
    raise SystemExit("Personal source/note privacy invariant not satisfied.")

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
sw = replace_once(sw, "const APP_VERSION = '0.9.13';", "const APP_VERSION = '0.9.32';", "service worker cache version")
write("sw.js", sw)
version = read("VERSION.txt")
version = replace_once(version, "Version: 0.9.13", "Version: 0.9.32", "release version metadata")
write("VERSION.txt", version)

# 5. Ensure the release contains no regression in the preserved brand artwork.
if '--owner-gold:#e9c978' not in html or '.owner-cover-author' not in html or '.owner-sides span' not in html or 'font-size:5.0cqw' not in html or '.owner-name' in html or '.owner-motto' in html:
    raise SystemExit("Owner signature placement/color regression detected")
if 'src="cover.jpg"' not in html or 'id="translationWorkspace"' not in html or 'id="samples" hidden' not in html:
    raise SystemExit("Original DWSS cover artwork reference was removed")
print("DWSS 0.9.32 four-item navigation, collapsed secondary details and gold headings applied.")
