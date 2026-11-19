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

function makeDom(seed = {}) {
  const dom = new JSDOM(html, { url:'https://dwss.test/', runScripts:'outside-only', pretendToBeVisual:true });
  const win = dom.window;
  Object.defineProperty(win.navigator, 'onLine', { value:false, configurable:true });
  win.confirm = () => true;
  win.alert = () => {};
  win.scrollTo = () => {};
  for (const [key, value] of Object.entries(seed)) win.localStorage.setItem(key, JSON.stringify(value));
  win.eval(dictionary);
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
function stripQueueFlags(item) {
  const row = Object.assign({}, item, {
    id:'server-canonical-entry',
    normalized_chinese:'明天',
    updated_at:'2026-11-19T14:10:00.000Z'
  });
  delete row.__canonical;
  delete row.__pending;
  delete row.__personal_entry_id;
  return row;
}

(async () => {
  const first = makeDom();
  const baseReading = readFor(first.win, '明天');
  const correctedReading = '天明专用首选音';
  assert.notEqual(baseReading, correctedReading, 'test correction must differ from the built-in reading');

  const saved = await first.win.DWSSSharedLexicon.submitQuickTranslationTerm({
    chinese_text:'明天', local_text:'asubuiro', local_pronunciation_cn:correctedReading
  });
  assert(saved.ok && saved.queued, 'main-result Swahili correction must enter the offline durable queue');
  const afterEdit = readFor(first.win, '明天');
  assert.equal(afterEdit, correctedReading,
    'the actual main translation engine must immediately prefer the saved canonical correction over built-in data');

  const queue = JSON.parse(first.win.localStorage.getItem('dwss_shared_terms_queue_v1') || '[]');
  const canonicalQueued = queue.find(item => item && item.__canonical &&
    item.source_language === 'sw' && item.chinese_text === '明天');
  assert(canonicalQueued, 'the corrected headword must be persisted as a canonical queue record');
  const canonicalRow = stripQueueFlags(canonicalQueued);
  first.dom.window.close();

  // A genuinely new page context: old legacy cloud data is present, but the
  // server returns the latest canonical headword and the pending submission ID.
  const second = makeDom({
    dwss_shared_terms_cache_v1: [{
      id:'legacy-old-reading', source_language:'sw', chinese_text:'明天',
      local_text:'kesho', local_pronunciation_cn:baseReading,
      created_at:'2026-10-28T16:28:32.000Z'
    }],
    dwss_shared_terms_queue_v1: queue,
    dwss_canonical_dictionary_cache_v1: [],
    dwss_shared_pronunciation_variants_v1: []
  });
  const win = second.win;
  const staleLegacyRows = [{
    id:'legacy-old-reading', source_language:'sw', chinese_text:'明天',
    local_text:'kesho', local_pronunciation_cn:baseReading,
    created_at:'2026-10-28T16:28:32.000Z'
  }];
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
  win.fetch = async (url, options) => {
    assert(String(url).includes('/functions/v1/dwss-upsert-dictionary-entry'),
      'refresh must load the canonical headword from the production edge function');
    assert.equal(JSON.parse(options.body).action, 'list');
    listCalled = true;
    return { ok:true, status:200, json:async () => ({ ok:true, entries:[canonicalRow] }) };
  };
  Object.defineProperty(win.navigator, 'onLine', { value:true, configurable:true });
  await win.DWSSSharedLexicon.refresh();
  assert(listCalled, 'a new page must refresh from the server-side canonical source');
  const active = win.DWSSSharedLexicon.getTerms().filter(item =>
    item.source_language === 'sw' && item.chinese_text === '明天');
  assert.equal(active.length, 1, 'new canonical correction must suppress the stale legacy duplicate');
  assert.equal(active[0].local_pronunciation_cn, correctedReading,
    'the latest canonical pronunciation must be the one active after refresh');
  const remainingQueue = JSON.parse(win.localStorage.getItem('dwss_shared_terms_queue_v1') || '[]');
  assert(!remainingQueue.some(item => item && item.__canonical && item.chinese_text === '明天'),
    'a confirmed canonical server row must acknowledge and clear its matching pending queue item');
  const afterRefresh = readFor(win, '明天');
  assert.equal(afterRefresh, correctedReading,
    'after full application restart and live cloud refresh, the actual translator must still output the new preferred reading');

  second.dom.window.close();
  console.log('PASS DWSS canonical translation integration: the real Swahili engine immediately uses a new main-result correction, persists it through restart, suppresses stale legacy cloud data, and still outputs the correction after server refresh.');
})().catch(error => { console.error(error); process.exitCode = 1; });
