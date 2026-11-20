'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync('shared-lexicon.js', 'utf8');
const edge = fs.readFileSync('supabase/functions/dwss-upsert-dictionary-entry/index.ts', 'utf8');

assert(edge.includes('if (body?.action === "list")'),
  'canonical upsert edge function must expose a server-side list action');
assert(edge.includes('getDb().from("shared_dictionary_entries")') &&
       edge.includes('.order("updated_at", { ascending: false }).limit(5000)'),
  'canonical list must read the authoritative shared dictionary through the server database client');
assert(source.includes('async function loadCanonicalEntries()') &&
       source.includes('body: JSON.stringify({ action: "list" })'),
  'browser shared lexicon must retrieve canonical entries through the list action');
assert(!source.includes('client.from("shared_dictionary_entries")'),
  'browser must not depend on direct Data API exposure for the canonical dictionary table');
assert(source.includes('function reconcileCanonicalQueue()') &&
       source.includes('queuedAt <= remoteAt'),
  'stale offline corrections must not overwrite a newer correction from another device');
assert(source.includes('let cloudReady = false;') &&
       source.includes('if (!navigator.onLine || !cloudReady) return;') &&
       source.includes('if (canonicalTerms.some(item => canonicalTermKey(item) === key))') &&
       source.includes('submitPersonalTerm(entry, { explicit: true })'),
  'background migration must wait for the cloud snapshot and skip existing canonical headwords, while explicit edits remain allowed');
assert(source.includes('window.addEventListener("dwss:app-ready", () => {') &&
       source.includes('Replay the latest shared lexicon once app.js has registered its listeners.'),
  'the latest canonical lexicon must be replayed after the async application core is ready');

(async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'https://dwss.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const win = dom.window;
  Object.defineProperty(win.navigator, 'onLine', { value: false, configurable: true });

  const legacyRows = [
    { id:'legacy-sw-no', source_language:'sw', chinese_text:'没有',
      local_pronunciation_cn:'啊一古', local_text:'hakuna', created_at:'2026-10-28T16:28:32.000Z' },
    { id:'legacy-fr-no', source_language:'fr', chinese_text:'没有',
      french_text:'ancien', french_pronunciation_cn:'旧法语读音', created_at:'2026-10-28T16:28:32.000Z' }
  ];
  const oldCanonicalCache = [
    { id:'old-canonical-sw', source_language:'sw', normalized_chinese:'没有',
      chinese_text:'没有', local_pronunciation_cn:'啊一古', local_text:'hakuna',
      updated_at:'2026-11-18T10:00:00.000Z' }
  ];
  win.localStorage.setItem('dwss_shared_terms_cache_v1', JSON.stringify(legacyRows));
  win.localStorage.setItem('dwss_canonical_dictionary_cache_v1', JSON.stringify(oldCanonicalCache));
  win.localStorage.setItem('dwss_shared_terms_queue_v1', '[]');
  win.localStorage.setItem('dwss_shared_pronunciation_variants_v1', '[]');

  const events = [];
  win.addEventListener('dwss:shared-terms-updated', event => {
    events.push(event && event.detail ? event.detail.terms : null);
  });
  win.eval(source);
  win.document.dispatchEvent(new win.Event('DOMContentLoaded', { bubbles: true }));

  const api = win.DWSSSharedLexicon;
  assert(api && typeof api.getTerms === 'function' && typeof api.refresh === 'function',
    'shared vocabulary API must expose read and refresh methods');

  const serverRows = [
    { id:'canonical-sw-no', client_submit_id:'sw-no-new', source_language:'sw',
      normalized_chinese:'没有', chinese_text:'没有', local_text:'hakuna',
      local_pronunciation_cn:'阿姨姑', french_text:null, french_pronunciation_cn:null,
      category:'翻译新增词条', updated_at:'2026-11-19T13:38:19.726Z' },
    { id:'canonical-fr-no', client_submit_id:'fr-no-new', source_language:'fr',
      normalized_chinese:'没有', chinese_text:'没有', local_text:null, local_pronunciation_cn:null,
      french_text:'pas de', french_pronunciation_cn:'帕德',
      category:'法语词库修正', updated_at:'2026-11-19T13:39:00.000Z' }
  ];
  const queriedTables = [];
  const client = {
    from(table) {
      queriedTables.push(table);
      const data = table === 'shared_terms' ? legacyRows :
        table === 'shared_pronunciation_variants' ? [] : [];
      const query = {
        select() { return this; },
        order() { return this; },
        limit() { return Promise.resolve({ data, error: null }); }
      };
      return query;
    },
    channel() {
      return { on() { return this; }, subscribe() { return this; } };
    }
  };
  win.supabase = { createClient: () => client };
  let listRequests = 0;
  win.fetch = async (url, options) => {
    assert(String(url).includes('/functions/v1/dwss-upsert-dictionary-entry'),
      'canonical list must use the existing protected edge function');
    assert(options && options.method === 'POST', 'canonical list request must use POST');
    assert(options.headers && options.headers.apikey, 'canonical list must carry the public application key');
    const payload = JSON.parse(options.body || '{}');
    assert.equal(payload.action, 'list', 'canonical read must not masquerade as a dictionary write');
    listRequests += 1;
    return {
      ok: true, status: 200,
      json: async () => ({ ok: true, entries: serverRows })
    };
  };
  Object.defineProperty(win.navigator, 'onLine', { value: true, configurable: true });
  await api.refresh();

  assert.equal(listRequests, 1, 'refresh must request the authoritative canonical rows from the server');
  assert(queriedTables.includes('shared_terms') && queriedTables.includes('shared_pronunciation_variants'),
    'legacy vocabulary and pronunciation candidates must continue loading');
  assert(!queriedTables.includes('shared_dictionary_entries'),
    'browser must not query the canonical table directly');
  let terms = api.getTerms();
  const swNo = terms.filter(item => item.source_language === 'sw' && item.chinese_text === '没有');
  const frNo = terms.filter(item => item.source_language === 'fr' && item.chinese_text === '没有');
  assert.equal(swNo.length, 1, 'new Swahili canonical row must replace the stale legacy row');
  assert.equal(swNo[0].local_pronunciation_cn, '阿姨姑',
    'refreshed Swahili preferred pronunciation must not revert to 啊一古');
  assert.equal(frNo.length, 1, 'French and Swahili rows must remain language-scoped');
  assert.equal(frNo[0].french_text, 'pas de');
  assert.equal(frNo[0].french_pronunciation_cn, '帕德');

  // Simulate the cloud request finishing before the asynchronously injected app.js
  // has attached its shared-terms listener. app-ready must replay the fresh records.
  const previousEvents = events.length;
  win.dispatchEvent(new win.CustomEvent('dwss:app-ready'));
  assert(events.length > previousEvents,
    'app-ready must re-emit shared data after the application has registered listeners');
  const replayed = events[events.length - 1] || [];
  assert(replayed.some(item => item.source_language === 'sw' &&
    item.chinese_text === '没有' && item.local_pronunciation_cn === '阿姨姑'),
    'app-ready replay must contain the latest preferred Swahili pronunciation');

  dom.window.close();
  console.log('PASS DWSS 0.9.165: server-side canonical reads replace stale legacy/cached Swahili and French readings; language keys remain isolated; app-ready replays current corrections; old offline queue data cannot overwrite newer cloud entries.');
})().catch(error => { console.error(error); process.exitCode = 1; });
