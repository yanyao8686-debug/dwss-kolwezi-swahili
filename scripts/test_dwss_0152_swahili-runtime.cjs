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
const sw = text('sw.js');
const version = text('VERSION.txt');
const boot = text('boot.js');
const pronunciationSource = text('pronunciation-search.js');
const hanziPinyinSource = text('hanzi-pinyin.js');
const dictionarySource = zlib.gunzipSync(read('dictionary.js.gz')).toString('utf8');

assert(version.includes('Version: 0.9.154'), 'website version must be 0.9.154');
assert(app.includes("version:'0.9.154'"), 'app version must match');
assert(sw.includes("const APP_VERSION = '0.9.154';"), 'Service Worker version must match');
assert(html.includes('DWSS_AUTO_UPDATE_0_9_153'), 'automatic-update marker must match');
assert(html.split('pronunciation-query-editor.js?dwss-release=0.9.154').length - 1 === 1,
  'query editor must load exactly once with the current release URL');
for (const name of ['french-extension.js','french-translation-runtime.js']) {
  assert(html.split(name + '?dwss-release=0.9.154').length - 1 === 1,
    name + ' must be pinned to the current release');
}
assert(boot.indexOf('./hanzi-pinyin.js') < boot.indexOf('./pronunciation-search.js') &&
       boot.indexOf('./pronunciation-search.js') < boot.indexOf('./app.js'),
  'normal boot order must load pinyin and search before the app');
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
if (win.document.readyState === 'loading') {
  win.document.dispatchEvent(new win.Event('DOMContentLoaded', {bubbles:true}));
}
assert.equal(typeof win.DWSSRenderTranslation, 'undefined',
  'renderer must not exist before the asynchronous core starts');

win.eval(app); // app.js dispatches dwss:app-ready after exporting the real renderers
const api = win.KolweziSwahili;
assert(api && typeof api.translate === 'function', 'local Swahili translation API must initialize');
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
console.log('PASS DWSS 0.9.154: production script order (extension before async app.js) restores the Swahili result box and pronunciation lookup on app-ready.');
console.log('PASS DWSS 0.9.154: late pinyin map loading cannot permanently disable reverse lookup.');
