'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync('shared-lexicon.js', 'utf8');

(async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url:'https://dwss-pagination.test/', runScripts:'outside-only', pretendToBeVisual:true
  });
  const win = dom.window;
  Object.defineProperty(win.navigator, 'onLine', { value:false, configurable:true });
  win.eval(source);
  win.document.dispatchEvent(new win.Event('DOMContentLoaded', { bubbles:true }));

  const emptyQuery = () => {
    const query = {
      select() { return query; },
      order() { return query; },
      limit() { return Promise.resolve({ data:[], error:null }); }
    };
    return query;
  };
  win.supabase = {
    createClient() {
      return {
        from() { return emptyQuery(); },
        channel() {
          return { on() { return this; }, subscribe() { return this; } };
        }
      };
    }
  };

  const first = {
    id:'10000000-0000-4000-8000-000000000001',
    source_language:'sw', normalized_chinese:'测试第一条', chinese_text:'测试第一条',
    local_text:'test one', local_pronunciation_cn:'首选读音一',
    french_text:null, french_pronunciation_cn:null, category:'回归测试'
  };
  const second = {
    id:'20000000-0000-4000-8000-000000000002',
    source_language:'fr', normalized_chinese:'测试第二条', chinese_text:'测试第二条',
    local_text:null, local_pronunciation_cn:null, french_text:'deuxième',
    french_pronunciation_cn:'读音二', category:'回归测试'
  };
  const requests = [];
  win.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body || '{}');
    requests.push(payload.after_id || null);
    const page = payload.after_id ? [second] : [first];
    return {
      ok:true, status:200,
      json:async () => payload.after_id
        ? { ok:true, entries:page, has_more:false, next_after_id:null }
        : { ok:true, entries:page, has_more:true, next_after_id:first.id }
    };
  };
  Object.defineProperty(win.navigator, 'onLine', { value:true, configurable:true });
  const refreshed = await win.DWSSSharedLexicon.refresh();
  assert.equal(refreshed, undefined);
  assert.deepEqual(requests, [null, first.id],
    'canonical loader must request the next page using the server cursor');
  const rows = win.DWSSSharedLexicon.getTerms();
  assert(rows.some(row => row.source_language === 'sw' && row.chinese_text === '测试第一条'),
    'the first page must be added to the active dictionary');
  assert(rows.some(row => row.source_language === 'fr' && row.chinese_text === '测试第二条'),
    'the second page must also be added to the active dictionary');
  assert.equal(rows.length, 2, 'all rows from every canonical page must be available');
  dom.window.close();
  console.log('PASS DWSS canonical pagination: all language-scoped rows are loaded across successive server pages.');
})().catch(error => { console.error(error); process.exitCode = 1; });
