from pathlib import Path

ROOT = Path("public")

def replace_once(path, old, new, label):
    file = ROOT / path
    source = file.read_text(encoding="utf-8")
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one source match, got {count}")
    file.write_text(source.replace(old, new, 1), encoding="utf-8")

old_css = """#resultCard .dwss-secondary-details{display:block!important;margin-top:8px;border-top:1px solid #e8edf4;padding-top:6px}
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
new_css = """/* Keep the individual-word section directly beneath the main reading. */
#resultCard .dwss-secondary-details{display:block!important;margin:0!important;border:0!important;padding:0!important}
#resultCard .dwss-secondary-title{display:block!important;margin:6px 0 6px!important;padding:0!important;color:#ff4b12!important;font-size:16px!important;font-weight:800!important;line-height:1.2!important;letter-spacing:0!important;text-decoration-line:underline!important;text-decoration-color:#ff4b12!important;text-decoration-thickness:2px!important;text-underline-offset:4px!important;white-space:nowrap!important;word-break:keep-all!important;overflow-wrap:normal!important}
#resultCard .dwss-secondary-details .stats,
#resultCard .dwss-secondary-details .quality-note,
#resultCard .dwss-secondary-details details.hint,
#resultCard .dwss-secondary-details .hint{display:none!important;margin:0!important;padding:0!important}
#resultCard .dwss-secondary-details .segmentlist{display:flex!important;flex-direction:column!important;gap:1px!important;margin:0!important;padding:0!important}
#resultCard .dwss-secondary-details .seg{display:grid!important;grid-template-columns:minmax(42px,30%) minmax(0,1fr)!important;align-items:baseline!important;gap:6px!important;width:100%!important;min-width:0!important;margin:0!important;padding:5px 2px!important;border:0!important;border-bottom:1px solid #edf0f5!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}
#resultCard .dwss-secondary-details .seg:last-child{border-bottom:0!important}
#resultCard .dwss-secondary-details .seg .zh{min-width:0!important;max-width:100%!important;font-size:12px!important;font-weight:750!important;line-height:1.35!important;overflow-wrap:anywhere!important}
#resultCard .dwss-secondary-details .seg .rd{min-width:0!important;font-size:12px!important;font-weight:500!important;line-height:1.4!important;overflow-wrap:anywhere!important}
#resultCard .dwss-secondary-details .seg .src{display:none!important}
#resultCard .dwss-secondary-details .seg.unknown{background:#fff7f5!important;border-bottom-color:#f2ded9!important}
#resultCard .dwss-secondary-details .candidate-extra{display:none!important}
#resultCard .dwss-secondary-details .segment-meta{display:none!important}
/* Keep network + auto-update state visible while scrolling; navigation stays below it. */
.status-strip{position:sticky!important;top:0!important;z-index:30!important;margin:0 0 8px!important;background:#fff!important}
nav.tabs{position:sticky!important;top:52px!important;z-index:29!important;background:var(--bg)!important}
.status-strip #pwaState{display:inline-flex!important;visibility:visible!important;opacity:1!important}
@media(min-width:520px){#resultCard .dwss-secondary-details .seg{grid-template-columns:minmax(70px,24%) minmax(0,1fr)!important}#resultCard .dwss-secondary-details .seg .zh{font-size:13px!important}#resultCard .dwss-secondary-details .seg .rd{font-size:13px!important}}"""
replace_once("index.html", old_css, new_css, "remove metadata area and match heading style")

# Keep the hidden statistics elements in the DOM because app.js updates their values,
# but never move/show them in the visible explanation section.
old_script = """    const secondary=[];
    Array.from(outputSection.children).forEach(node=>{
      if(node.classList.contains('stats') ||
         node.matches('details.quality-note,details.hint') ||
         node.classList.contains('segmentlist') ||
         (node.classList.contains('resultlabel')&&node.textContent.includes('单个斯语读法释义'))){
        secondary.push(node);
      }
    });"""
new_script = """    const secondary=[];
    Array.from(outputSection.children).forEach(node=>{
      if(node.classList.contains('segmentlist') ||
         (node.classList.contains('resultlabel')&&node.textContent.includes('单个斯语读法释义'))){
        secondary.push(node);
      }
    });"""
replace_once("index.html", old_script, new_script, "only move the heading and word list into visible section")

replace_once("index.html", 'content="0.9.61"><!-- DWSS_AUTO_UPDATE_0_9_61 -->', 'content="0.9.62"><!-- DWSS_AUTO_UPDATE_0_9_62 -->', "PWA release marker")
replace_once("index.html", "版本 0.9.61 · DWSS 智能翻译 PWA", "版本 0.9.62 · DWSS 智能翻译 PWA", "visible release version")
replace_once("app.js", "version:'0.9.61'", "version:'0.9.62'", "application version")
replace_once("sw.js", "const APP_VERSION = '0.9.61';", "const APP_VERSION = '0.9.62';", "service worker cache version")

version = ROOT / "VERSION.txt"
info = version.read_text(encoding="utf-8").replace("Version: 0.9.61", "Version: 0.9.62", 1)
note = "0.9.62: Remove the coverage/match-statistics pills and accuracy/verified-spelling disclosures from the visible result. Move the fixed individual-word heading and list upward; match the main translation heading's 16px orange-red underlined style. Keep network and automatic-update status sticky and visible during scrolling.\n"
if note not in info:
    info = info.rstrip() + "\n" + note
version.write_text(info, encoding="utf-8")
print("PASS: DWSS 0.9.62 display cleanup and persistent status-bar patch applied.")
