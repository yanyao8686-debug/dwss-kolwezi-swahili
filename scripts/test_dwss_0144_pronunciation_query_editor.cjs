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
'<div id="pronunciation" class="panel">',
'<div class="pronunciation-maintenance-entry"><button>公共词库维护</button></div>',
'<div id="pronunciationResults"><article class="pronunciation-hit">',
'<div class="pronunciation-hit-main"><div class="pronunciation-hit-zh">明天<span class="pronunciation-match-chip">读音一致</span></div>',
'<div class="pronunciation-hit-reading">当地斯语中文谐音：该小</div>',
'<div class="pronunciation-hit-match">匹配到的读音：该小 · 分类：时间</div>',
'<div class="pronunciation-hit-meta">词库来源：内置词库</div></div>',
'<div class="pronunciation-hit-actions"><button type="button">复制读音</button></div>',
'<div class="dwss-query-inline-tools"><button class="dwss-query-edit-toggle" type="button">修改结果</button><div class="dwss-query-inline-editor"><button class="dwss-query-editor-save">保存并同步给所有用户</button></div></div>',
'</article></div>',
'<div id="pronunciationFrenchResults">',
'<article class="pronunciation-hit"><div class="pronunciation-hit-main">',
'<div class="pronunciation-hit-zh">法语：bonjour<span class="pronunciation-match-chip">读音一致</span></div>',
'<div class="pronunciation-hit-reading">中文近似发音：邦茹</div>',
'<div class="pronunciation-hit-meta">IPA 音标：/bɔ̃.ʒuʁ/</div>',
'<div class="pronunciation-hit-meta pronunciation-hit-meaning"><strong>中文释义：</strong>你好；您好</div>',
'<div class="pronunciation-hit-meta">匹配读音：邦茹</div></div>',
'<div class="dwss-query-inline-tools"><button class="dwss-query-edit-toggle" type="button">修改结果</button></div>',
'</article>',
'<article class="pronunciation-hit"><div class="pronunciation-hit-main">',
'<div class="pronunciation-hit-zh">法语：inconnu</div>',
'<div class="pronunciation-hit-reading">中文近似发音：安孔纽</div>',
'<div class="pronunciation-hit-meta">IPA 音标：/ɛ̃.kɔ.ny/</div>',
'<div class="pronunciation-hit-meta pronunciation-hit-meaning"><strong>中文释义：</strong>该法语词形暂未收录中文释义</div>',
'</div></article></div>',
'</div></body></html>'
].join('');

const dom = new JSDOM(html, {
  url: 'https://dwss.test/',
  runScripts: 'outside-only',
  pretendToBeVisual: true
});
const { window } = dom;
const { document } = window;
let swWrites = 0;
let frWrites = 0;
window.DWSSDictionaryOverrides = {
  async update() { swWrites += 1; }
};
window.DWSSSharedLexicon = {
  async submitFrenchPronunciationCorrection() { frWrites += 1; }
};

window.eval(source);
document.dispatchEvent(new window.Event('DOMContentLoaded'));
const pause = ms => new Promise(resolve => window.setTimeout(resolve, ms));

(async () => {
  await pause(20);
  const swArticle = document.querySelector('#pronunciationResults .pronunciation-hit');
  const frArticles = [...document.querySelectorAll('#pronunciationFrenchResults .pronunciation-hit')];
  assert(swArticle && frArticles.length === 2, 'both language result lists must remain available');
  assert.equal(document.querySelectorAll('.dwss-query-edit-toggle,.dwss-query-inline-editor,.dwss-query-inline-tools').length, 0,
    'pronunciation results must not expose inline editing controls');
  assert.equal(document.querySelectorAll('.pronunciation-hit-actions').length, 0,
    'legacy result action buttons must be removed');
  assert.equal(document.querySelectorAll('.pronunciation-maintenance-entry').length, 0,
    'the duplicate maintenance entry must not appear in pronunciation lookup');
  assert(swArticle.textContent.includes('明天') && swArticle.textContent.includes('该小'),
    'Swahili pronunciation result content must be preserved');
  assert(frArticles[0].textContent.includes('bonjour') && frArticles[0].textContent.includes('你好；您好'),
    'French pronunciation result and Chinese meaning must be preserved');
  assert(frArticles[1].textContent.includes('inconnu'),
    'French results without a Chinese gloss must remain searchable');

  // Controls inserted by stale cached code are removed as well.
  const stale = document.createElement('div');
  stale.className = 'dwss-query-inline-tools';
  stale.innerHTML = '<button class="dwss-query-edit-toggle">旧版修改入口</button>';
  document.querySelector('#pronunciationResults').appendChild(stale);
  await pause(20);
  assert.equal(document.querySelectorAll('.dwss-query-inline-tools').length, 0,
    'stale edit controls must be stripped after dynamic result rendering');
  assert.equal(swWrites, 0, 'read-only pronunciation lookup must never write Swahili corrections');
  assert.equal(frWrites, 0, 'read-only pronunciation lookup must never write French corrections');

  for (const forbidden of [
    'DWSSDictionaryOverrides',
    'submitFrenchPronunciationCorrection',
    '修改结果',
    '保存并同步给所有用户'
  ]) {
    assert(!source.includes(forbidden), 'read-only query script must not contain edit capability: ' + forbidden);
  }
  const css = document.getElementById('dwss-pronunciation-query-readonly-0149').textContent;
  assert(css.includes('#pronunciationResults .pronunciation-hit-actions'));
  assert(css.includes('#pronunciationFrenchResults .pronunciation-hit-actions'));
  console.log('PASS DWSS 0.9.149: Swahili and French pronunciation lookup are read-only and preserve both result lists.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
