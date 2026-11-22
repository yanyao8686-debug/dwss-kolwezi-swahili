#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const { JSDOM } = require('jsdom');

const root = path.resolve(process.env.DWSS_PUBLIC_DIR || 'public');
const read = name => fs.readFileSync(path.join(root, name));
const text = name => read(name).toString('utf8');
const html = text('index.html');
const app = text('app.js');
const extension = text('french-extension.js');
const queryEditor = text('pronunciation-query-editor.js');
const sw = text('sw.js');
const version = text('VERSION.txt');
const boot = text('boot.js');
const pronunciationSource = text('pronunciation-search.js');
const hanziPinyinSource = text('hanzi-pinyin.js');
const dictionarySource = zlib.gunzipSync(read('dictionary.js.gz')).toString('utf8');

assert(version.includes('Version: 0.9.167'), 'website version must be 0.9.167');
assert(app.includes("version:'0.9.167'"), 'app version must match');
assert(sw.includes("const APP_VERSION = '0.9.167';"), 'Service Worker version must match');
assert(html.includes('DWSS_AUTO_UPDATE_0_9_166'), 'automatic-update marker must match');
assert(html.split('pronunciation-query-editor.js?dwss-release=0.9.167').length - 1 === 1,
  'query editor must load exactly once with the current release URL');
for (const name of ['french-extension.js','french-translation-runtime.js']) {
  assert(html.split(name + '?dwss-release=0.9.167').length - 1 === 1,
    name + ' must be pinned to the current release');
}
assert(boot.indexOf('./hanzi-pinyin.js') < boot.indexOf('./pronunciation-search.js') &&
       boot.indexOf('./pronunciation-search.js') < boot.indexOf('./app.js'),
  'normal boot order must load pinyin and search before the app');
assert(app.includes('DWSSRenderTranslation'),
  'main translation renderer hook source is missing');
assert(app.includes('window.DWSSRenderPronunciationLookup = () => renderPronunciationLookup();'),
  'actual pronunciation renderer hook must be present');
assert(extension.includes('function restoreSelectedModesAfterCoreReady()') &&
       extension.includes('window.addEventListener("dwss:app-ready", restoreSelectedModesAfterCoreReady, { once: true })'),
  'extension must reconcile both views after asynchronous Swahili core startup');

// Search engine first, pinyin map second: it must not capture a permanently empty map.
const late = { window: {} };
vm.runInNewContext(pronunciationSource, late, { filename: 'pronunciation-search-first.js' });
vm.runInNewContext(hanziPinyinSource, late, { filename: 'hanzi-pinyin-second.js' });
const lateHits = late.window.DWSSPronunciationSearch.search(
  '给晓', [{zh:'明天',variants:[{reading:'该小'}]}], {limit:10}
);
assert(lateHits.some(hit => hit.zh === '明天' && hit.score >= 0.90),
  'reverse lookup must work if the Hanzi pinyin map loads after the search engine');

// Real dictionary and real HTML. Reproduce production script order, not an idealized
// order: french-extension.js is deferred in HTML; boot.js injects app.js asynchronously.
const dom = new JSDOM(html, {url:'https://dwss.test/',runScripts:'outside-only',pretendToBeVisual:true});
const win = dom.window;
Object.defineProperty(win.navigator, 'onLine', {value:false, configurable:true});
win.confirm=()=>true; win.alert=()=>{}; win.scrollTo=()=>{};
win.eval(dictionarySource);
win.eval(hanziPinyinSource);
win.eval(pronunciationSource);

const input = win.document.getElementById('inputText');
const output = win.document.getElementById('resultReading');
const card = win.document.getElementById('resultCard');
const frenchButton = win.document.getElementById('dwssMainFrMode');
const swButton = win.document.getElementById('dwssMainSwMode');
const frenchQueryButton = win.document.getElementById('dwssPronFrMode');
const swQueryButton = win.document.getElementById('dwssPronSwMode');
const queryInput = win.document.getElementById('pronunciationSearch');
const queryResults = win.document.getElementById('pronunciationResults');
assert(input && output && card && frenchButton && swButton && frenchQueryButton && swQueryButton && queryInput && queryResults,
  'main result or language-mode DOM is incomplete');

const rows = win.SW_DB;
assert(Array.isArray(rows) && rows.length > 1000, 'real bundled Swahili dictionary must load');
const row = rows.find(item => item && item.zh === '明天' && Array.isArray(item.variants) &&
  item.variants.some(v => String(v.reading || '').trim()));
assert(row, 'known 明天 entry must exist in bundled dictionary');
input.value = '明天';
queryInput.value = '给晓';
card.dataset.dwssLang = 'fr';
frenchButton.classList.add('active'); // simulate stale WebView-restored French state
frenchQueryButton.classList.add('active');

// This must execute before app.js. bind() initially cannot render because the app
// API does not exist yet; it must wait for the app-ready signal and then recover.
win.eval(extension);
win.eval(queryEditor); // production deferred query cleanup must not delete required main-app controls
assert(win.document.getElementById('openPublicPronunciationEditor'),
  'read-only pronunciation cleanup must preserve the main-page dictionary maintenance button');
assert.equal((extension.match(/function restoreSelectedModesAfterCoreReady\(\)/g) || []).length, 1,
  'there must be exactly one Swahili startup reconciliation function');
if (win.document.readyState === 'loading') {
  win.document.dispatchEvent(new win.Event('DOMContentLoaded', {bubbles:true}));
}
assert(win.document.getElementById('openPublicPronunciationEditor'),
  'read-only query cleanup must preserve the main dictionary-maintenance button after DOMContentLoaded');
assert.equal(typeof win.DWSSRenderTranslation, 'undefined',
  'renderer must not exist before the asynchronous core starts');

win.eval(app); // app.js dispatches dwss:app-ready after exporting the real renderers
const api = win.KolweziSwahili;
assert(api && typeof api.translate === 'function', 'local Swahili translation API must initialize');
const engine = win.DWSSPronunciationSearch;
assert(engine && typeof engine.search === 'function', 'shared pronunciation search engine must initialize');
assert(app.includes('variants:preferredLocalVariants(item).map(v=>({') &&
       !app.includes('engine.includeTranslationOverrides(all.map'),
  'reverse lookup candidate assembly must share the forward translator reading filter');

// Audit every built-in headword (single words, phrases, punctuation and numeric forms)
// that has an active local homophone. Explicit variable-template/explanatory labels
// are excluded because they are not literal translation inputs.
const eligibleHeadwords = new Set();
for (const item of rows) {
  const zh = String(item && item.zh || '').trim();
  if (!zh || /(?:\\.{2,}|…|⋯|方位名词)/u.test(zh)) continue;
  const candidates = (Array.isArray(item.variants) ? item.variants : []).filter(v => {
    const reading = String(v && v.reading || '').trim();
    if (!reading || v.sourceWarning || /[（(]\s*法\s*[)）]/.test(reading)) return false;
    return v.origin !== 'pronunciation-variant' || ['confirmed','common'].includes(v.variantStatus);
  });
  if (candidates.length) eligibleHeadwords.add(zh);
}
const parityMismatches = [];
for (const zh of eligibleHeadwords) {
  const result = api.translate(zh);
  const found = result && Array.isArray(result.segments) &&
    result.segments.some(segment => segment && segment.type === 'local' && String(segment.reading || '').trim());
  if (!found) parityMismatches.push(zh);
}
assert.equal(parityMismatches.length, 0,
  'forward/reverse dictionary parity failures (' + parityMismatches.length + '/' + eligibleHeadwords.size + '): ' +
  parityMismatches.slice(0, 30).join('、'));
const knifeRow = rows.find(item => item && String(item.zh || '').trim() === '刀子');
if (knifeRow && (Array.isArray(knifeRow.variants) ? knifeRow.variants : []).some(v => {
  const reading = String(v && v.reading || '').trim();
  return reading && !v.sourceWarning && !/[（(]\s*法\s*[)）]/.test(reading) &&
    (v.origin !== 'pronunciation-variant' || ['confirmed','common'].includes(v.variantStatus));
})) {
  const knife = api.translate('刀子');
  assert(knife && Array.isArray(knife.segments) &&
    knife.segments.some(segment => segment && segment.type === 'local' && String(segment.reading || '').trim()),
    '刀子 has an approved local Swahili reading and must translate in the main interface');
}
console.log('PASS: forward/reverse parity audit across ' + eligibleHeadwords.size + ' approved built-in Chinese headwords.');

// Exercise every live input source through the same production resolver used by
// both the forward tokenizer and reverse pronunciation search.
const assertVisibleParity = (zh, reading, label) => {
  const translated = api.translate(zh);
  assert(translated && translated.segments.some(segment =>
    segment && segment.type === 'local' && String(segment.reading || '').trim() === reading),
    label + ': forward translation did not return its active local pronunciation');
  queryInput.value = reading;
  win.DWSSRenderPronunciationLookup();
  assert(queryResults.textContent.includes(zh),
    label + ': reverse pronunciation lookup did not return the same Chinese headword');
};
const sharedFixture = [
  {source_language:'sw',chinese_text:'云端首选全链路核验',local_text:'dwss-canonical-test',local_pronunciation_cn:'唉姆嘎',__canonical:true},
  {source_language:'sw',chinese_text:'旧共享全链路核验',local_text:'dwss-legacy-test',local_pronunciation_cn:'喂喂姆'},
  {source_language:'sw',chinese_text:'个人与云端优先级核验',local_text:'dwss-priority-new',local_pronunciation_cn:'杜尼嘎',__canonical:true},
  {source_language:'sw',chinese_text:'个人与云端优先级核验',local_text:'dwss-priority-old',local_pronunciation_cn:'旧读音候选'},
  {source_language:'fr',chinese_text:'法语隔离核验',french_text:'bonjour',french_pronunciation_cn:'邦茹'}
];
win.dispatchEvent(new win.CustomEvent('dwss:shared-terms-updated',{detail:{terms:sharedFixture}}));
assertVisibleParity('云端首选全链路核验','唉姆嘎','canonical cloud term');
assertVisibleParity('旧共享全链路核验','喂喂姆','legacy shared term');
assertVisibleParity('个人与云端优先级核验','杜尼嘎','canonical-over-legacy priority');
queryInput.value='旧读音候选';win.DWSSRenderPronunciationLookup();
assert(!queryResults.textContent.includes('个人与云端优先级核验'),
  'superseded legacy reading must not remain an active reverse candidate after a canonical correction');
assert.equal(api.translate('法语隔离核验').segments.some(segment=>segment.type==='local'&&segment.canonical==='法语隔离核验'),false,
  'French-only shared entries must never become local Swahili translation entries');
queryInput.value='邦茹';win.DWSSRenderPronunciationLookup();
assert(!queryResults.textContent.includes('法语隔离核验'),
  'French-only shared entries must never leak into local Swahili reverse pronunciation lookup');

// A personal entry added after startup must immediately join both lookup paths.
const personalOutcome=api.addCustom({zh:'个人新词全链路核验',reading:'巴啵嘟',latin:'dwss-personal-test',category:'其他'});
assert(personalOutcome&&personalOutcome.ok,'personal test term must be accepted');
assertVisibleParity('个人新词全链路核验','巴啵嘟','personal dictionary term');

// A public dictionary pronunciation correction must be active in both paths.
win.dispatchEvent(new win.CustomEvent('dwss:dictionary-overrides-updated',{detail:{overrides:[
  {source_kind:'dictionary',chinese_text:'刀子',local_pronunciation_cn:'莫咯喀',updated_at:'2026-11-22T00:00:00Z'}
]}}));
assertVisibleParity('刀子','莫咯喀','public dictionary correction');

// Confirmed crowd-sourced pronunciation variants are accepted by both paths.
// Pending variants are deliberately excluded from both until they are reviewed.
win.dispatchEvent(new win.CustomEvent('dwss:pronunciation-variants-updated',{detail:{variants:[
  {chinese_text:'已确认变体全链路核验',pronunciation_cn:'巴卡哇',status:'confirmed',dialect:'加丹加斯瓦希里语（科卢韦齐）'},
  {chinese_text:'待确认变体全链路核验',pronunciation_cn:'撒尼哇',status:'pending',dialect:'加丹加斯瓦希里语（科卢韦齐）'}
]}}));
assertVisibleParity('已确认变体全链路核验','巴卡哇','confirmed pronunciation variant');
const pendingForward=api.translate('待确认变体全链路核验');
assert(!pendingForward.segments.some(segment=>segment.type==='local'),
  'pending pronunciation variant must not be treated as a verified forward translation');
queryInput.value='撒尼哇';win.DWSSRenderPronunciationLookup();
assert(!queryResults.textContent.includes('待确认变体全链路核验'),
  'pending pronunciation variant must not be treated as a verified reverse-lookup result');

console.log('PASS: canonical cloud, legacy shared, personal, public-correction and confirmed-variant sources all have forward/reverse parity.');
console.log('PASS: stale, French-only and pending pronunciations cannot create false Swahili reverse results.');
const translated = api.translate('明天');
const match = translated && translated.segments.find(item => item.type === 'local' && item.reading);
assert(match, 'main translator must produce a local Swahili homophone');

assert.equal(card.dataset.dwssLang, undefined,
  'app-ready reconciliation must clear stale French result-card marker');
assert(swButton.classList.contains('active') && !frenchButton.classList.contains('active'),
  'app-ready reconciliation must restore the Swahili main mode');
assert(swQueryButton.classList.contains('active') && !frenchQueryButton.classList.contains('active'),
  'app-ready reconciliation must restore the Swahili pronunciation-query mode');
assert(!output.hidden && output.value.includes(match.reading),
  'app-ready event must automatically render the existing Chinese draft into the Swahili result box');
assert(queryResults.textContent.includes('明天') && queryResults.textContent.includes('该小'),
  'app-ready event must automatically restore real Swahili reverse-lookup results');

win.close();
console.log('PASS DWSS 0.9.167: production script order (extension before async app.js) restores the Swahili result box and pronunciation lookup on app-ready.');
console.log('PASS DWSS 0.9.167: late pinyin map loading cannot permanently disable reverse lookup.');
