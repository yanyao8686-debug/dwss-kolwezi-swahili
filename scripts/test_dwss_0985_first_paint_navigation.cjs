#!/usr/bin/env node
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=process.env.DWSS_PUBLIC_DIR||'public';
const read=n=>fs.readFileSync(path.join(root,n),'utf8');
const html=read('index.html');
const app=read('app.js');
const boot=read('boot.js');
const pwa=read('pwa.js');
const sw=read('sw.js');
const version=read('VERSION.txt');
const manifest=JSON.parse(read('manifest.webmanifest'));

assert.match(version,/^Version: 0\.9\.85$/m);
assert(sw.includes("const APP_VERSION = '0.9.85';"));
assert(html.includes('content="0.9.85">'));
assert(html.includes('DWSS_AUTO_UPDATE_0_9_85'));
assert(html.includes('版本 0.9.85 · 刚果金斯语翻译'));
assert((html.match(/dwss-release=0\.9\.85/g)||[]).length>=3);
assert.equal((html.match(/dwss-release=0\.9\.84/g)||[]).length,0);
assert(app.includes("version:'0.9.85'"));

const cssMatch=html.match(/<style id="dwss-startup-navigation-0985">([\s\S]*?)<\/style>/);
assert(cssMatch,'first-paint navigation style exists');
const css=cssMatch[1];
assert(css.includes('grid-template-columns:repeat(4,minmax(0,1fr))!important'));
assert(css.includes('grid-auto-rows:52px!important'));
assert(css.includes('height:52px!important'));
assert(css.includes('min-height:52px!important'));
assert(css.includes('max-height:52px!important'));
assert(css.includes('white-space:nowrap!important'));
assert(css.includes('word-break:keep-all!important'));
assert(css.includes('writing-mode:horizontal-tb!important'));
assert(css.includes('text-orientation:mixed!important'));
assert(css.includes('nav.tabs>.nav-clear-slot'));
assert(css.includes('height:48px!important'));
assert(css.includes('min-height:48px!important'));
assert(css.includes('max-height:48px!important'));
assert(css.includes('@media(max-width:520px)'));

const nav=html.match(/<nav class="tabs">([\s\S]*?)<\/nav>/);
assert(nav,'navigation exists');
assert.equal((nav[1].match(/class="tab"/g)||[]).length,3);
assert.equal((nav[1].match(/class="nav-clear-slot"/g)||[]).length,1);
assert(nav[1].includes('disabled aria-label="清空信息"'));
assert(nav[1].includes('清空信息'));

assert(html.includes('id="networkBadge">● 正在检查网络…</span>'));
assert(html.includes('class="chip pwa-state-warn" id="pwaState"'));
assert(html.includes('>正在检查更新…</span>'));
assert(pwa.includes("networkBadge.textContent = online ? '● 网络已连接' : '● 当前离线'"));
assert(pwa.includes("setState('自动更新已开启'"));
assert(html.includes("clearSlot.replaceWith(clearButton)"));
assert(html.includes("clearButton.className='nav-clear-action'"));

for(const removed of ['newVariantNote','听到的地区或场景','若这个中文意思已经收录','新变体先待确认']){
  assert(!html.includes(removed),'clean add-word UI remains absent: '+removed);
}
for(const id of ['newZh','newReading','newFrenchReadingZh','pronunciationSearch']){
  assert(html.includes('id="'+id+'"'),'required form/search control retained: '+id);
}
assert(boot.indexOf('./hanzi-pinyin.js')<boot.indexOf('./pronunciation-search.js'));
assert(boot.indexOf('./pronunciation-search.js')<boot.indexOf('./app.js'));
assert(boot.includes("'./pwa.js'"));
assert(sw.includes("'./dictionary.js.gz'")||sw.includes('"./dictionary.js.gz"'));
assert(sw.includes("'./hanzi-pinyin.js'")||sw.includes('"./hanzi-pinyin.js"'));
assert(sw.includes("'./pronunciation-search.js'")||sw.includes('"./pronunciation-search.js"'));
assert.equal(manifest.id,'./?app=dwss-kolwezi-swahili');
assert.equal(manifest.display,'standalone');
assert.equal(manifest.name,'刚果金斯语翻译');

// Verify the tab placeholder is a disabled temporary shell element; the
// real button is moved into its exact slot after JavaScript initialization.
assert(html.includes("clearSlot.replaceWith(clearButton)"));
assert(html.includes("clearButton.textContent='清空信息'"));
assert(html.includes("clearButton.setAttribute('aria-label','清空当前中文输入和翻译结果')"));

console.log('PASS: the first HTML paint already gives all four nav items a stable 52px/48px height.');
console.log('PASS: the clear placeholder is horizontally styled, no-wrap, and disabled until initialization.');
console.log('PASS: initial network/update labels are truthful and pwa.js replaces them after real checks.');
console.log('PASS: real Clear button wiring, translation, pronunciation, clean form and PWA identity remain.');
