from pathlib import Path

ROOT = Path("public")

def replace_once(path, old, new, label):
    file = ROOT / path
    source = file.read_text(encoding="utf-8")
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one source match, got {count}")
    file.write_text(source.replace(old, new, 1), encoding="utf-8")

old_css = """#resultCard .dwss-secondary-details{margin-top:7px;border-top:1px solid #e8edf4;padding-top:5px}
#resultCard .dwss-secondary-details>summary{display:block!important;width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important;list-style:none;cursor:pointer;color:#ff4b12!important;font-size:clamp(10px,3.4vw,13px)!important;font-weight:800!important;line-height:1.35;padding:5px 0!important;letter-spacing:-.03em!important;text-decoration-line:underline!important;text-decoration-color:#ff4b12!important;text-decoration-thickness:2px!important;text-underline-offset:3px!important;white-space:nowrap!important;word-break:keep-all!important;overflow-wrap:normal!important;overflow:visible!important;text-overflow:clip!important}
#resultCard .dwss-secondary-details>summary::-webkit-details-marker{display:none}
#resultCard .dwss-secondary-details>summary:before{content:"＋";display:inline-block;margin-right:7px;color:#ff4b12;font-weight:800}
#resultCard .dwss-secondary-details[open]>summary:before{content:"－"}
#resultCard .dwss-secondary-details .hint,#resultCard .dwss-secondary-details .segmentlist,#resultCard .dwss-secondary-details .quality-note,#resultCard .dwss-secondary-details .candidate-extra,#resultCard .dwss-secondary-details .segment-meta{display:block!important;margin:7px 0!important}
#resultCard .dwss-secondary-details details{margin:5px 0}"""
new_css = """#resultCard .dwss-secondary-details{display:block!important;margin-top:8px;border-top:1px solid #e8edf4;padding-top:6px}
#resultCard .dwss-secondary-title{display:block!important;margin:0 0 5px!important;padding:3px 0!important;color:#ff4b12!important;font-size:13px!important;font-weight:800!important;line-height:1.35!important;letter-spacing:0!important;text-decoration:none!important}
#resultCard .dwss-secondary-details .hint,#resultCard .dwss-secondary-details .quality-note{display:block!important;margin:5px 0!important}
#resultCard .dwss-secondary-details .segmentlist{display:flex!important;flex-direction:column!important;gap:1px!important;margin:4px 0 0!important;padding:0!important}
#resultCard .dwss-secondary-details .seg{display:grid!important;grid-template-columns:minmax(42px,30%) minmax(0,1fr)!important;align-items:baseline!important;gap:6px!important;width:100%!important;min-width:0!important;margin:0!important;padding:5px 2px!important;border:0!important;border-bottom:1px solid #edf0f5!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}
#resultCard .dwss-secondary-details .seg:last-child{border-bottom:0!important}
#resultCard .dwss-secondary-details .seg .zh{min-width:0!important;max-width:100%!important;font-size:12px!important;font-weight:750!important;line-height:1.35!important;overflow-wrap:anywhere!important}
#resultCard .dwss-secondary-details .seg .rd{min-width:0!important;font-size:12px!important;font-weight:500!important;line-height:1.4!important;overflow-wrap:anywhere!important}
#resultCard .dwss-secondary-details .seg .src{display:none!important}
#resultCard .dwss-secondary-details .seg.unknown{background:#fff7f5!important;border-bottom-color:#f2ded9!important}
#resultCard .dwss-secondary-details .candidate-extra{display:none!important}
#resultCard .dwss-secondary-details .segment-meta{display:none!important}
@media(min-width:520px){#resultCard .dwss-secondary-details .seg{grid-template-columns:minmax(70px,24%) minmax(0,1fr)!important}#resultCard .dwss-secondary-details .seg .zh{font-size:13px!important}#resultCard .dwss-secondary-details .seg .rd{font-size:13px!important}}"""
replace_once("index.html", old_css, new_css, "fixed heading and compact word-list CSS")
replace_once(
    "index.html",
    '<div class="resultlabel" style="margin-top:14px">匹配明细</div>',
    '<div class="resultlabel" style="margin-top:14px">单个斯语读法释义：</div>',
    "static individual-word explanation heading",
)
old_script = """    const secondary=[];
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
      const summary=document.createElement('summary');summary.textContent='单个斯语读法释义（点击加号展开）：';disclosure.appendChild(summary);
      secondary.forEach(node=>disclosure.appendChild(node));outputSection.appendChild(disclosure);
    }"""
new_script = """    const secondary=[];
    Array.from(outputSection.children).forEach(node=>{
      if(node.classList.contains('stats') ||
         node.matches('details.quality-note,details.hint') ||
         node.classList.contains('segmentlist') ||
         (node.classList.contains('resultlabel')&&node.textContent.includes('单个斯语读法释义'))){
        secondary.push(node);
      }
    });
    if(secondary.length&&!outputSection.querySelector('.dwss-secondary-details')){
      const section=document.createElement('section');section.className='dwss-secondary-details';
      secondary.forEach(node=>{
        if(node.classList.contains('resultlabel')){
          node.textContent='单个斯语读法释义：';
          node.className='dwss-secondary-title';
        }
        section.appendChild(node);
      });
      outputSection.appendChild(section);
    }"""
replace_once("index.html", old_script, new_script, "remove expandable wrapper and keep all details visible")

replace_once("app.js", "version:'0.9.60'", "version:'0.9.61'", "application version")
replace_once("sw.js", "const APP_VERSION = '0.9.60';", "const APP_VERSION = '0.9.61';", "service-worker cache version")
version = ROOT / "VERSION.txt"
info = version.read_text(encoding="utf-8").replace("Version: 0.9.60", "Version: 0.9.61", 1)
note = "0.9.61: Replace expandable individual-word definitions with a fixed heading and an always-visible, compact one-line-per-word list. Remove oversized word cards and per-word more-info disclosures.\n"
if note not in info:
    info = info.rstrip() + "\n" + note
version.write_text(info, encoding="utf-8")
print("PASS: DWSS 0.9.61 compact always-visible word explanation layout applied.")
