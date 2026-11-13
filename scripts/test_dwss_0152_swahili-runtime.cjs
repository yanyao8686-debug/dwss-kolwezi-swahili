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

assert(version.includes('Version: 0.9.152'), 'website version must be 0.9.152');
assert(app.includes("version:'0.9.152'"), 'app version must match');
assert(sw.includes("const APP_VERSION = '0.9.152';"), 'Service Worker version must match');
assert(html.includes('DWSS_AUTO_UPDATE_0_9_152'), 'automatic-update marker must match');
assert((html.match(/pronunciation-query-editor\.js\?dwss-release=0\.9\.152/g) || []).length === 1,
  'query cleanup script must load exactly once');
assert(boot.indexOf('./hanzi-pinyin.js') < boot.indexOf('./pronunciation-search.js') &&
       boot.indexOf('./pronunciation-search.js') < boot.indexOf('./app.js'),
  'normal boot order must include pinyin map and search engine before app.js');
assert(app.includes('window.DWSSRenderPronunciationLookup = () => renderPronunciationLookup();'),
  'actual pronunciation renderer hook must be present');
assert(extension.includes('setMainMode("sw");') && extension.includes('setQueryMode("sw");'),
  'startup must normalize both modes to Swahili');

// Search engine first, pinyin map second: this must never capture a permanently empty map.
const late = { window: {} };
vm.runInNewContext(pronunciationSource, late, { filename: 'pronunciation-search-first.js' });
vm.runInNewContext(hanziPinyinSource, late, { filename: 'hanzi-pinyin-second.js' });
const lateHits = late.window.DWSSPronunciationSearch.search(
  '给晓', [{zh:'明天',variants:[{reading:'该小'}]}], {limit:10}
);
assert(lateHits.some(hit => hit.zh === '明天' && hit.score >= 0.90),
  'reverse lookup must work if the Hanzi pinyin map loads after the search engine');

// Real dictionary and real HTML DOM; no web or third-party calls.
const dom = new JSDOM(html, {url:'https://dwss.test/',runScripts:'outside-only',pretendToBeVisual:true});
const win = dom.window;
Object.defineProperty(win.navigator, 'onLine', {value:false, configurable:true});
win.confirm=()=>true; win.alert=()=>{}; win.scrollTo=()=>{};
win.eval(dictionarySource);
win.eval(hanziPinyinSource);
win.eval(pronunciationSource);
win.eval(app);
const api=win.KolweziSwahili;
assert(api && typeof api.translate==='function', 'local Swahili translation API must initialize');
const rows=win.SW_DB;
assert(Array.isArray(rows) && rows.length>1000, 'real bundled Swahili dictionary must load');
const row=rows.find(item=>item && item.zh==='明天' && Array.isArray(item.variants) &&
  item.variants.some(v=>String(v.reading||'').trim()));
assert(row, 'known 明天 entry must exist in bundled dictionary');
const translated=api.translate('明天');
const match=translated && translated.segments.find(x=>x.type==='local' && x.reading);
assert(match, 'main translator must produce a local Swahili homophone');

const input=win.document.getElementById('inputText');
const output=win.document.getElementById('resultReading');
const card=win.document.getElementById('resultCard');
const frenchButton=win.document.getElementById('dwssMainFrMode');
const swButton=win.document.getElementById('dwssMainSwMode');
const frenchQueryButton=win.document.getElementById('dwssPronFrMode');
const swQueryButton=win.document.getElementById('dwssPronSwMode');
assert(input && output && card && frenchButton && swButton && frenchQueryButton && swQueryButton,
  'main result or language-mode DOM is incomplete');
input.value='明天';
card.dataset.dwssLang='fr';
frenchButton.classList.add('active'); // emulate a WebView restored with stale French state
frenchQueryButton.classList.add('active');
win.eval(extension);
if(win.document.readyState==='loading'){
  win.document.dispatchEvent(new win.Event('DOMContentLoaded',{bubbles:true}));
}
assert.equal(card.dataset.dwssLang,undefined,
  'real extension startup must clear a stale French result-card marker');
assert(swButton.classList.contains('active') && !frenchButton.classList.contains('active'),
  'real extension startup must select Swahili for the main translator');
assert(swQueryButton.classList.contains('active') && !frenchQueryButton.classList.contains('active'),
  'real extension startup must select Swahili for reverse pronunciation lookup');
assert.equal(typeof win.DWSSRenderTranslation,'function','main render hook missing');
input.dispatchEvent(new win.Event('input',{bubbles:true}));
win.DWSSRenderTranslation();
assert(!output.hidden && output.value.includes(match.reading),
  'real result textarea must show the local homophone after the actual extension restores Swahili mode');

const queryInput=win.document.getElementById('pronunciationSearch');
const queryResults=win.document.getElementById('pronunciationResults');
assert(queryInput && queryResults, 'Swahili pronunciation lookup DOM is incomplete');
queryInput.value='给晓';
assert.equal(typeof win.DWSSRenderPronunciationLookup,'function','actual reverse renderer hook missing');
win.DWSSRenderPronunciationLookup();
assert(queryResults.textContent.includes('明天') && queryResults.textContent.includes('该小'),
  'actual pronunciation lookup result list must show 明天 / 该小');

win.close();
console.log('PASS DWSS 0.9.152: real dictionary -> Swahili result box -> reverse lookup result card.');
console.log('PASS DWSS 0.9.152: late pinyin data cannot permanently disable reverse lookup.');
