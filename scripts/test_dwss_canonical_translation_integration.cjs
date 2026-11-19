'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { JSDOM } = require('jsdom');

const root = path.resolve(process.env.DWSS_PUBLIC_DIR || 'public');
const read = name => fs.readFileSync(path.join(root, name));
const text = name => read(name).toString('utf8');
const html = text('index.html');
const dictionary = zlib.gunzipSync(read('dictionary.js.gz')).toString('utf8');
const pinyin = text('hanzi-pinyin.js');
const pronunciation = text('pronunciation-search.js');
const shared = text('shared-lexicon.js');
const app = text('app.js');

function makeDom(seed = {}, injectStalePersonal = false) {
  const dom = new JSDOM(html, { url:'https://dwss.test/', runScripts:'outside-only', pretendToBeVisual:true });
  const win = dom.window;
  Object.defineProperty(win.navigator, 'onLine', { value:false, configurable:true });
  win.confirm = () => true;
  win.alert = () => {};
  win.scrollTo = () => {};
  for (const [key, value] of Object.entries(seed)) win.localStorage.setItem(key, JSON.stringify(value));
  win.eval(dictionary);
  if (injectStalePersonal) {
    let row = win.SW_DB.find(item => item && item.zh === '没有');
    if (!row) {
      row = { zh:'没有', category:'斯语', variants:[] };
      win.SW_DB.push(row);
    }
    if (!Array.isArray(row.variants)) row.variants = [];
    row.variants.unshift({
      reading:'啊一古', latin:'hakuna', source:'旧本机个人词条',
      kind:'个人词库', origin:'personal'
    });
  }
  win.eval(pinyin);
  win.eval(pronunciation);
  win.eval(shared);
  if (win.document.readyState === 'loading') {
    win.document.dispatchEvent(new win.Event('DOMContentLoaded', { bubbles:true }));
  }
  win.eval(app);
  assert(win.KolweziSwahili && typeof win.KolweziSwahili.translate === 'function',
    'production Swahili translation engine must initialize');
  return { dom, win };
}
function readFor(win, chinese) {
  const result = win.KolweziSwahili.translate(chinese);
  assert(result && Array.isArray(result.segments), 'translation must return segments for ' + chinese);
  const match = result.segments.find(item => item && item.type === 'local' && String(item.reading || '').trim());
  assert(match, 'translation must find a local Swahili reading for ' + chinese);
  return match.reading;
}
function stripQueueFlags(item, chinese) {
  const row = Object.assign({}, item, {
    id:'server-canonical-entry',
    normalized_chinese:chinese,
    updated_at:'2026-11-19T14:10:00.000Z'
  });
  delete row.__canonical;
  delete row.__pending;
  delete row.__personal_entry_id;
  return row;
}

(async () => {
  const first = makeDom({}, true);
  const oldPersonalReading = readFor(first.win, '没有');
  assert.equal(oldPersonalReading, '啊一古',
    'regression fixture must reproduce the stale local personal pronunciation');

  const correctedReading = '阿姨姑';
  const saved = await first.win.DWSSSharedLexicon.submitQuickTranslationTerm({
    chinese_text:'没有', local_text:'hakuna', local_pronunciation_cn:correctedReading
  });
  assert(saved.ok && saved.queued, 'main-result Swahili correction must enter the offline durable queue');
  assert.equal(readFor(first.win, '没有'), correctedReading,
    'the actual Swahili translation engine must prefer canonical correction over stale personal reading');

  first.win.document.getElementById('inputText').value = '没有';
  first.win.DWSSRenderTranslation();
  assert(first.win.document.getElementById('resultReading').value.includes(correctedReading),
    'the visible main result textarea must display the corrected canonical pronunciation');

  const queue = JSON.parse(first.win.localStorage.getItem('dwss_shared_terms_queue_v1') || '[]');
  const canonicalQueued = queue.find(item => item && item.__canonical &&
    item.source_language === 'sw' && item.chinese_text === '没有');
  assert(canonicalQueued, 'the corrected headword must be persisted as a canonical queue record');
  const canonicalRow = stripQueueFlags(canonicalQueued, '没有');
  const frenchCanonicalRow = {
    id:'server-canonical-fr-no', client_submit_id:'fr-no-cloud',
    source_language:'fr', normalized_chinese:'没有', chinese_text:'没有',
    local_text:null, local_pronunciation_cn:null,
    french_text:'pas de', french_pronunciation_cn:'帕德',
    category:'法语首选词条', updated_at:'2026-11-19T14:11:00.000Z'
  };
  first.dom.window.close();

  // A genuinely new page context with old local and legacy data still present.
  // The remote canonical rows must win, and startup migration must not repost
  // stale local Swahili or French entries on top of them.
  const legacySwahili = {
    id:'legacy-old-reading', source_language:'sw', chinese_text:'没有',
    local_text:'hakuna', local_pronunciation_cn:'啊一古',
    created_at:'2026-10-28T16:28:32.000Z'
  };
  const second = makeDom({
    dwss_shared_terms_cache_v1: [legacySwahili],
    dwss_shared_terms_queue_v1: queue,
    dwss_canonical_dictionary_cache_v1: [],
    dwss_shared_pronunciation_variants_v1: []
  }, true);
  const win = second.win;
  const staleLegacyRows = [legacySwahili];
  const client = {
    from(table) {
      const rows = table === 'shared_terms' ? staleLegacyRows :
        table === 'shared_pronunciation_variants' ? [] : [];
      return {
        select() { return this; },
        order() { return this; },
        limit() { return Promise.resolve({ data: rows, error:null }); }
      };
    },
    channel() {
      return { on() { return this; }, subscribe() { return this; } };
    }
  };
  win.supabase = { createClient: () => client };
  let listCalled = false;
  let unexpectedWrites = 0;
  win.fetch = async (url, options) => {
    assert(String(url).includes('/functions/v1/dwss-upsert-dictionary-entry'),
      'refresh must use the canonical server edge function');
    const payload = JSON.parse(options.body || '{}');
    if (payload.action === 'list') {
      listCalled = true;
      return { ok:true, status:200, json:async () => ({
        ok:true, entries:[canonicalRow, frenchCanonicalRow]
      }) };
    }
    unexpectedWrites += 1;
    return { ok:true, status:200, json:async () => ({
      ok:true, entry:Object.assign({}, payload, {id:'unexpected-write'})
    }) };
  };

  // Simulate an old device dictionary whose two language entries were never
  // marked synced. Background migration must not overwrite either canonical row.
  const oldLocalTerm = {
    id:'stale-personal-no', zh:'没有', reading:'啊一古', latin:'hakuna',
    french:'ancien', frenchReadingZh:'旧法语读音', shareSyncStatus:''
  };
  win.KolweziSwahili.getCustom = () => [oldLocalTerm];
  win.KolweziSwahili.setCustomShareStatus = () => {};
  Object.defineProperty(win.navigator, 'onLine', { value:true, configurable:true });
  await win.DWSSSharedLexicon.refresh();

  assert(listCalled, 'a new page must refresh from the server-side canonical source');
  assert.equal(unexpectedWrites, 0,
    'startup migration must not upload stale local Swahili or French terms over cloud canonical rows');

  const active = win.DWSSSharedLexicon.getTerms();
  const swTerms = active.filter(item =>
    item.source_language === 'sw' && item.chinese_text === '没有');
  const frTerms = active.filter(item =>
    item.source_language === 'fr' && item.chinese_text === '没有');
  assert.equal(swTerms.length, 1, 'canonical Swahili headword must suppress the stale legacy duplicate');
  assert.equal(swTerms[0].local_pronunciation_cn, correctedReading,
    'latest Swahili canonical pronunciation must remain the active shared row');
  assert.equal(frTerms.length, 1, 'French canonical headword must suppress the stale local French duplicate');
  assert.equal(frTerms[0].french_text, 'pas de');
  assert.equal(frTerms[0].french_pronunciation_cn, '帕德');

  const remainingQueue = JSON.parse(win.localStorage.getItem('dwss_shared_terms_queue_v1') || '[]');
  assert(!remainingQueue.some(item => item && item.__canonical && item.chinese_text === '没有'),
    'a confirmed canonical server row must acknowledge and clear its matching pending queue item');

  assert.equal(readFor(win, '没有'), correctedReading,
    'after app restart and cloud refresh, real translator must ignore stale personal pronunciation');
  win.document.getElementById('inputText').value = '没有';
  win.DWSSRenderTranslation();
  assert(win.document.getElementById('resultReading').value.includes(correctedReading),
    'after restart and refresh, the visible main result textarea must still show the canonical reading');

  second.dom.window.close();
  console.log('PASS DWSS canonical regression: user edit wins over stale personal, legacy and built-in pronunciations; restart and online refresh preserve it; startup migration cannot overwrite canonical Swahili or French entries.');
})()})().catch(error => { console.error(error); process.exitCode = 1; });
