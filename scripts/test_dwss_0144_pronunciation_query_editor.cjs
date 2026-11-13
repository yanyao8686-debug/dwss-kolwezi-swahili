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
window.DWSSDictionaryOverrides = { async update() { swWrites += 1; } };
window.DWSSSharedLexicon = { async submitFrenchPronunciationCorrection() { frWrites += 1; } };

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
  assert.equal(document.querySelectorAll('.pronunciation-hit-actions').length, 1,
    'read-only copy action must remain available');
  assert(swArticle.querySelector('.pronunciation-hit-reading'), 'Swahili homophone must remain visible');
  assert(swArticle.querySelector('.pronunciation-hit-match'), 'Swahili matched reading must remain visible');
  assert(swArticle.querySelector('.pronunciation-hit-meta'), 'Swahili dictionary source must remain visible');
  assert.equal(document.querySelectorAll('.pronunciation-maintenance-entry').length, 0,
    'the duplicate maintenance entry must not appear in pronunciation lookup');
  assert(swArticle.textContent.includes('明天') && swArticle.textContent.includes('该小'),
    'Swahili pronunciation result content must be preserved');
  assert(frArticles[0].textContent.includes('bonjour') && frArticles[0].textContent.includes('你好；您好'),
    'French pronunciation result and Chinese meaning must be preserved');
  assert(frArticles[1].textContent.includes('inconnu'),
    'French results without a Chinese gloss must remain searchable');

  const staleSw = document.createElement('div');
  staleSw.className = 'dwss-query-inline-tools';
  staleSw.innerHTML = '<button class="dwss-query-edit-toggle">旧版斯语修改入口</button>';
  document.querySelector('#pronunciationResults').appendChild(staleSw);
  const staleFr = document.createElement('div');
  staleFr.className = 'dwss-query-inline-tools';
  staleFr.innerHTML = '<button class="dwss-query-edit-toggle">旧版法语修改入口</button>';
  document.querySelector('#pronunciationFrenchResults').appendChild(staleFr);
  await pause(20);
  assert.equal(document.querySelectorAll('.dwss-query-inline-tools').length, 0,
    'stale edit controls must be stripped from both result lists');
  assert.equal(swWrites, 0, 'read-only pronunciation lookup must never write Swahili corrections');
  assert.equal(frWrites, 0, 'read-only pronunciation lookup must never write French corrections');

  for (const forbidden of ['DWSSDictionaryOverrides','submitFrenchPronunciationCorrection','修改结果','保存并同步给所有用户']) {
    assert(!source.includes(forbidden), 'read-only query script must not contain edit capability: ' + forbidden);
  }
  const css = document.getElementById('dwss-pronunciation-query-readonly-0151').textContent;
  assert(css.includes('#pronunciationResults .pronunciation-hit-reading,#pronunciationResults .pronunciation-hit-match'));
  assert(css.includes('#pronunciationFrenchResults .pronunciation-hit-reading'));
  assert(css.includes('display:block!important;visibility:visible!important;opacity:1!important'));
  assert(!css.includes('#pronunciationResults .pronunciation-hit-actions'));
  assert(source.includes('MutationObserver'));
  assert(source.includes('getElementById("pronunciationResults")'));
  assert(source.includes('getElementById("pronunciationFrenchResults")'));
  assert(!source.includes('observer.observe(document.body'),
    'query cleanup must not observe the full application DOM');
  console.log('PASS DWSS 0.9.152: both pronunciation lists are read-only; stale editors are stripped with query-scoped observers only.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
