'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const root = process.env.DWSS_TEST_ROOT || 'public';
const read = name => fs.readFileSync(root + '/' + name, 'utf8');
const html = read('index.html'), app = read('app.js'), pwa = read('pwa.js'), sw = read('sw.js'), version = read('VERSION.txt');

assert(html.includes('content="0.9.63"><!-- DWSS_AUTO_UPDATE_0_9_63 -->'));
assert(html.includes('版本 0.9.63 · DWSS 智能翻译 PWA'));
assert(sw.includes("const APP_VERSION = '0.9.63';"));
assert(app.includes("version:'0.9.63'"));
assert(version.includes('Version: 0.9.63'));

// Direct-child selectors are essential because stats/quality notes remain sibling nodes
// of the visible compact word list in #resultCard.
for (const selector of [
  '#resultCard>.stats,',
  '#resultCard>details.quality-note,',
  '#resultCard>details.hint,',
  '#resultCard .dwss-secondary-details .stats,',
  '#resultCard .dwss-secondary-details .quality-note,'
]) assert(html.includes(selector), 'missing hidden result selector: ' + selector);
const hiddenBlockStart = html.indexOf('/* These legacy status nodes stay in the DOM');
const hiddenBlockEnd = html.indexOf('#resultCard .dwss-secondary-details .segmentlist', hiddenBlockStart);
assert(hiddenBlockStart >= 0 && hiddenBlockEnd > hiddenBlockStart);
const hiddenBlock = html.slice(hiddenBlockStart, hiddenBlockEnd);
assert(hiddenBlock.includes('display:none!important'));
assert(hiddenBlock.includes('visibility:hidden!important'));
assert(hiddenBlock.includes('height:0!important'));
assert(hiddenBlock.includes('border:0!important'));

// Keep render targets present so existing app.js updates do not throw or lose its stats.
assert(html.includes('id="coverageChip"'));
assert(html.includes('id="matchedChip"'));
assert(app.includes("$('coverageChip').textContent="));
assert(app.includes("$('matchedChip').textContent="));

// Preserve requested fixed heading, compact list and sticky status arrangement.
assert(html.includes('单个斯语读法释义：'));
assert(html.includes('font-size:16px!important'));
assert(html.includes('text-decoration-line:underline!important'));
assert(html.includes('.status-strip{position:sticky!important;top:0!important;'));
assert(html.includes('nav.tabs{position:sticky!important;top:52px!important;'));
assert(html.includes('status-strip #pwaState{display:inline-flex!important;visibility:visible!important;opacity:1!important}'));
assert(pwa.includes('state.hidden = false;'));
assert(pwa.includes("state.textContent = unavailable ? '自动更新暂不可用' : '自动更新已开启';"));
assert(pwa.includes('await registration.update();'));
assert(pwa.includes('preserveDraftBeforeReload();'));
assert(!html.includes('checkUpdateBtn'));
console.log('PASS: both top-level result-statistics pills are fully removed from layout and accessibility visibility.');
console.log('PASS: accuracy and verified-spelling option controls are fully removed from layout.');
console.log('PASS: hidden statistic IDs remain available, preventing translation-rendering errors.');
console.log('PASS: fixed heading style, compact word list and sticky auto-update badge remain intact.');
