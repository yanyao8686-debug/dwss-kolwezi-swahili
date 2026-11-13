'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const root = path.resolve(process.env.DWSS_PUBLIC_DIR || 'public');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
function assert(ok, message) { if (!ok) throw new Error(message); }

const source = read('shared-lexicon.js');
for (const token of [
  'shared_dictionary_entries',
  'dwss-upsert-dictionary-entry',
  'submitQuickTranslationTerm',
  'submitFrenchPronunciationCorrection',
  'getPronunciationVariants',
  'managePronunciationVariant',
  'retryPending',
  'event: "*", schema: "public", table: "shared_dictionary_entries"',
  'event: "*", schema: "public", table: "shared_pronunciation_variants"'
]) assert(source.includes(token), 'shared canonical lexicon runtime is missing: ' + token);

(async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://dwss.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const win = dom.window;
  Object.defineProperty(win.navigator, 'onLine', { value: false, configurable: true });
  Object.defineProperty(win.crypto, 'randomUUID', {
    configurable: true,
    value: (() => { let id = 0; return () => '00000000-0000-4000-8000-' + String(++id).padStart(12, '0'); })()
  });
  win.localStorage.setItem('dwss_shared_terms_cache_v1', JSON.stringify([
    { id:'old-fr-hello', source_language:'fr', chinese_text:'你好', french_text:'Bonjour',
      french_pronunciation_cn:'邦如哈', created_at:'2026-11-01T00:00:00.000Z' },
    { id:'old-sw-thanks', source_language:'sw', chinese_text:'谢谢',
      local_pronunciation_cn:'买C', created_at:'2026-11-01T00:00:00.000Z' }
  ]));
  win.eval(source);
  win.document.dispatchEvent(new win.Event('DOMContentLoaded', { bubbles: true }));
  const api = win.DWSSSharedLexicon;
  assert(api && typeof api.submitFrenchPronunciationCorrection === 'function',
    'shared lexicon API must be available');
  const frenchResult = await api.submitFrenchPronunciationCorrection({
    chinese_text:'你好', french_text:'Salut', french_pronunciation_cn:'萨吕'
  });
  assert(frenchResult.queued === true, 'offline French correction must queue locally');
  let terms = api.getTerms();
  const frenchTerms = terms.filter(item => item.source_language === 'fr' && item.chinese_text === '你好');
  assert(frenchTerms.length === 1 && frenchTerms[0].french_text === 'Salut' &&
    frenchTerms[0].french_pronunciation_cn === '萨吕' && frenchTerms[0].__canonical,
    'the offline canonical French correction must replace the old Bonjour row in the active lexicon');

  const swResult = await api.submitQuickTranslationTerm({
    chinese_text:'谢谢', local_text:'asante', local_pronunciation_cn:'桑卡'
  });
  assert(swResult.queued === true, 'offline Swahili correction must queue locally');
  terms = api.getTerms();
  const swTerms = terms.filter(item => item.source_language === 'sw' && item.chinese_text === '谢谢');
  assert(swTerms.length === 1 && swTerms[0].local_pronunciation_cn === '桑卡' &&
    swTerms[0].local_text === 'asante' && swTerms[0].__canonical,
    'the offline canonical Swahili correction must replace the old preferred reading');

  // Both languages may have a row for the same Chinese text, but the keys are
  // language-scoped and neither one may shadow the other.
  const sharedChinese = await api.submitFrenchPronunciationCorrection({
    chinese_text:'谢谢', french_text:'Merci', french_pronunciation_cn:'麦赫西'
  });
  assert(sharedChinese.queued === true, 'French and Swahili rows may coexist for the same Chinese headword');
  terms = api.getTerms();
  assert(terms.some(item => item.source_language === 'fr' && item.chinese_text === '谢谢' && item.french_text === 'Merci') &&
    terms.some(item => item.source_language === 'sw' && item.chinese_text === '谢谢' && item.local_pronunciation_cn === '桑卡'),
    'language-specific canonical keys must prevent Swahili/French cross-over');

  const variant = await api.submitPronunciationVariant({
    chinese_text:'谢谢', pronunciation_cn:'桑卡', pinyin_key:'sang ka',
    dialect:'加丹加斯瓦希里语（科卢韦齐）', source_note:'本机离线测试', source_kind:'dictionary'
  });
  assert(variant.queued === true, 'offline pronunciation variants must be queued');
  const variants = api.getPronunciationVariants();
  assert(variants.some(item => item.chinese_text === '谢谢' && item.pronunciation_cn === '桑卡' && item.__pending),
    'offline pronunciation search index must expose the pending pronunciation variant immediately');

  const queue = JSON.parse(win.localStorage.getItem('dwss_shared_terms_queue_v1') || '[]');
  assert(queue.filter(item => item.__canonical).length === 3,
    'all three language-specific canonical headword corrections must persist on device');
  assert(queue.some(item => item.__variant), 'the offline pronunciation correction must persist in the same queue');

  dom.window.close();
  console.log('PASS DWSS 0.9.159: canonical Swahili/French entries replace stale active headwords offline; language-scoped entries coexist; pending pronunciation variants are instantly searchable and all changes persist for later sync.');
})().catch(error => { console.error(error); process.exitCode = 1; });
