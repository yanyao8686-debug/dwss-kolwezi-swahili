'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const root = process.env.DWSS_TEST_ROOT || 'public';
const read = name => fs.readFileSync(root + '/' + name, 'utf8');
const html = read('index.html'), app = read('app.js'), pwa = read('pwa.js'), sw = read('sw.js'), version = read('VERSION.txt');

assert(html.includes('content="0.9.62"><!-- DWSS_AUTO_UPDATE_0_9_62 -->'));
assert(html.includes('版本 0.9.62 · DWSS 智能翻译 PWA'));
assert(sw.includes("const APP_VERSION = '0.9.62';"));
assert(app.includes("version:'0.9.62'"));
assert(version.includes('Version: 0.9.62'));

// Red-box elements remain available as invisible render targets but are no longer moved
// into the visible details area. Their parent selector force-hides them even if later CSS
// tries to display details.
const cssStart = html.indexOf('/* Keep the individual-word section directly beneath the main reading. */');
const cssEnd = html.indexOf('@media(min-width:520px)', cssStart);
assert(cssStart >= 0 && cssEnd > cssStart);
const css = html.slice(cssStart, cssEnd);
assert(css.includes('#resultCard .dwss-secondary-details .stats,'));
assert(css.includes('#resultCard .dwss-secondary-details .quality-note,'));
assert(css.includes('details.hint'));
assert.match(css, /#resultCard \.dwss-secondary-details \.hint\{display:none!important/);
assert.match(css, /margin:0!important;border:0!important;padding:0!important/);

// Same 16px orange-red underline treatment as the main translation heading.
const headingStyle = css.match(/#resultCard \.dwss-secondary-title\{([^}]*)\}/);
assert(headingStyle);
for (const required of [
  'color:#ff4b12!important',
  'font-size:16px!important',
  'font-weight:800!important',
  'text-decoration-line:underline!important',
  'text-decoration-color:#ff4b12!important',
  'text-decoration-thickness:2px!important',
  'text-underline-offset:4px!important'
]) assert(headingStyle[1].includes(required), 'missing heading style: ' + required);

// The status strip stays fixed at the top of the viewport; tab navigation is offset below it.
assert.match(css, /\.status-strip\{position:sticky!important;top:0!important;z-index:30!important/);
assert.match(css, /nav\.tabs\{position:sticky!important;top:52px!important;z-index:29!important/);
assert(css.includes('.status-strip #pwaState{display:inline-flex!important;visibility:visible!important;opacity:1!important}'));

// The wrapper only moves the fixed heading and the segment list. Stats/notes remain in the DOM
// so app.js can update coverageChip/matchedChip safely; CSS hides them in the visible output.
const scriptStart = html.indexOf('    const secondary=[];');
const scriptEnd = html.indexOf('    const goTranslate=()=>', scriptStart);
assert(scriptStart >= 0 && scriptEnd > scriptStart);
const script = html.slice(scriptStart, scriptEnd);
assert(script.includes("node.classList.contains('segmentlist')"));
assert(script.includes("node.textContent.includes('单个斯语读法释义')"));
assert(!script.includes("node.classList.contains('stats')"));
assert(!script.includes("node.matches('details.quality-note,details.hint')"));
assert(script.includes("section.appendChild(node)"));
assert(app.includes("$('coverageChip').textContent="));
assert(app.includes("$('matchedChip').textContent="));
assert(html.includes('id="coverageChip"'));
assert(html.includes('id="matchedChip"'));
assert(pwa.includes("state.hidden = false;"));
assert(pwa.includes("state.textContent = unavailable ? '自动更新暂不可用' : '自动更新已开启';"));
assert(pwa.includes('await registration.update();'));
assert(pwa.includes('preserveDraftBeforeReload();'));
assert(!html.includes('checkUpdateBtn'));
console.log('PASS: coverage/match chips and accuracy/spelling disclosures no longer occupy visible space.');
console.log('PASS: fixed individual-word heading is 16px orange-red, bold and underlined like the main heading.');
console.log('PASS: the word list moves directly beneath the heading with no extra section gap.');
console.log('PASS: network and automatic-update badges remain sticky during page scrolling.');
console.log('PASS: hidden statistic targets remain in DOM, so translation rendering cannot fail.');
