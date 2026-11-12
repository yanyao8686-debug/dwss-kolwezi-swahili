#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(
  path.join(process.cwd(), 'scripts/pronunciation-query-editor.js'),
  'utf8'
);
const html = [
'<!doctype html><html><head></head><body>',
'<div id="pronunciationResults"><article class="pronunciation-hit">',
'<div class="pronunciation-hit-main"><div class="pronunciation-hit-zh">明天<span class="pronunciation-match-chip">读音一致</span></div>',
'<div class="pronunciation-hit-reading">当地斯语中文谐音：该小</div>',
'<div class="pronunciation-hit-match">匹配到的读音：该小 · 分类：时间</div>',
'<div class="pronunciation-hit-meta">词库来源：内置词库</div></div>',
'<div class="pronunciation-hit-actions"><button type="button" data-pron-copy="该小">复制读音</button></div>',
'</article></div>',
'<div id="pronunciationFrenchResults">',
'<article class="pronunciation-hit"><div class="pronunciation-hit-main">',
'<div class="pronunciation-hit-zh">法语：bonjour<span class="pronunciation-match-chip">读音一致</span></div>',
'<div class="pronunciation-hit-reading">中文近似发音：邦茹</div>',
'<div class="pronunciation-hit-meta">IPA 音标：/bɔ̃.ʒuʁ/</div>',
'<div class="pronunciation-hit-meta pronunciation-hit-meaning"><strong>中文释义：</strong>你好；您好</div>',
'<div class="pronunciation-hit-meta">匹配读音：邦茹</div></div>',
'<div class="pronunciation-hit-actions"><button type="button" data-copy-french="bonjour">复制法语</button><button type="button" data-copy-french-reading="邦茹">复制谐音</button></div>',
'</article>',
'<article class="pronunciation-hit"><div class="pronunciation-hit-main">',
'<div class="pronunciation-hit-zh">法语：inconnu</div>',
'<div class="pronunciation-hit-reading">中文近似发音：安孔纽</div>',
'<div class="pronunciation-hit-meta">IPA 音标：/ɛ̃.kɔ.ny/</div>',
'<div class="pronunciation-hit-meta pronunciation-hit-meaning"><strong>中文释义：</strong>该法语词形暂未收录中文释义（法中词典没有对应词条）</div>',
'<div class="pronunciation-hit-meta">匹配读音：安孔纽</div></div></article>',
'</div></body></html>'
].join('');

const dom = new JSDOM(html, {
  url: 'https://dwss.test/',
  runScripts: 'outside-only',
  pretendToBeVisual: true
});
const { window } = dom;
const { document } = window;
let swPayload = null;
let frPayload = null;
window.DWSSDictionaryOverrides = {
  async update(payload) { swPayload = payload; return { ok: true }; }
};
window.DWSSSharedLexicon = {
  async submitFrenchPronunciationCorrection(payload) {
    frPayload = payload;
    return { synced: true, queued: false };
  }
};
window.DWSSRenderFrenchPronunciationQuery = () => {};
window.renderPronunciationLookup = () => {};

window.eval(source);
document.dispatchEvent(new window.Event('DOMContentLoaded'));
const pause = ms => new Promise(resolve => window.setTimeout(resolve, ms));

(async () => {
  await pause(20);
  const swArticle = document.querySelector('#pronunciationResults .pronunciation-hit');
  const frArticles = [...document.querySelectorAll('#pronunciationFrenchResults .pronunciation-hit')];
  assert(swArticle && frArticles.length === 2, 'test pronunciation cards did not render');
  assert.equal(document.querySelectorAll('.dwss-query-edit-toggle').length, 3,
    'each query result must have a direct edit action');
  assert.equal(document.querySelectorAll('.pronunciation-hit-actions').length, 0,
    'all legacy copy action containers must be removed');
  assert.equal(document.querySelectorAll('[data-pron-copy],[data-copy-french],[data-copy-french-reading]').length, 0,
    'no legacy copy buttons may remain');

  // Swahili: edit only the local Chinese homophone and use the Swahili override API.
  swArticle.querySelector('.dwss-query-edit-toggle').click();
  const swInput = swArticle.querySelector('.dwss-query-inline-editor input');
  assert(swInput, 'Swahili reading editor is missing');
  swInput.value = '该小（修正）';
  swArticle.querySelector('.dwss-query-editor-save').click();
  await pause(10);
  assert.deepEqual(JSON.parse(JSON.stringify(swPayload)), {
    chinese_text: '明天',
    local_pronunciation_cn: '该小（修正）'
  }, 'Swahili correction must use only the Swahili-specific shared override fields');
  assert.equal(swArticle.querySelector('.dwss-query-editor-status').dataset.kind, 'success');

  // French: word, Chinese meaning and Chinese approximate sound can be fixed together.
  const frArticle = frArticles[0];
  frArticle.querySelector('.dwss-query-edit-toggle').click();
  const frInputs = frArticle.querySelectorAll('.dwss-query-inline-editor input');
  const frMeaning = frArticle.querySelector('.dwss-query-inline-editor textarea');
  assert.equal(frInputs.length, 2, 'French editor must expose spelling and homophone inputs');
  assert(frMeaning, 'French editor must expose a Chinese meaning field');
  frInputs[0].value = 'bonjour';
  frMeaning.value = '你好；您好；日安';
  frInputs[1].value = '邦茹（修正）';
  frArticle.querySelector('.dwss-query-editor-save').click();
  await pause(10);
  assert.deepEqual(JSON.parse(JSON.stringify(frPayload)), {
    chinese_text: '你好；您好；日安',
    french_text: 'bonjour',
    french_pronunciation_cn: '邦茹（修正）'
  }, 'French correction must submit through French-only fields and include the corrected Chinese meaning');
  assert.equal(frArticle.querySelector('.dwss-query-editor-status').dataset.kind, 'success');

  // Missing-gloss cards must start with an empty meaning field so users can supply it.
  const missing = frArticles[1];
  missing.querySelector('.dwss-query-edit-toggle').click();
  assert.equal(missing.querySelector('.dwss-query-inline-editor textarea').value, '',
    'a missing dictionary gloss must open with an empty field, not the placeholder sentence');

  const css = document.getElementById('dwss-pronunciation-query-editor-0144').textContent;
  assert(css.includes('#pronunciationResults .pronunciation-hit-actions'));
  assert(css.includes('#pronunciationFrenchResults .pronunciation-hit-actions'));
  console.log('PASS DWSS 0.9.144: both pronunciation query modes hide copy clutter, allow direct edits, and save to isolated shared-language fields.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
