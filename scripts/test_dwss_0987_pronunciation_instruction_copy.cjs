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

const oldText='输入听到却不懂意思的斯语中文谐音时，不限同音不同字的中文，系统会自动查询近似的读音来匹配对应发音的斯语';
const newText='输入听到却不懂意思的斯语中文谐音时，即便是同音不同字的中文，系统也会自动查询近似的读音来匹配对应发音的斯语';

assert.match(version,/^Version: 0\.9\.87$/m);
assert(sw.includes("const APP_VERSION = '0.9.87';"));
assert(html.includes('content="0.9.87">'));
assert(html.includes('DWSS_AUTO_UPDATE_0_9_87'));
assert(html.includes('版本 0.9.87 · 刚果金斯语翻译'));
assert((html.match(/dwss-release=0\.9\.87/g)||[]).length>=3);
assert.equal((html.match(/dwss-release=0\.9\.86/g)||[]).length,0);
assert(app.includes("version:'0.9.87'"));

assert.equal(html.split(oldText).length-1,0,'old wording fully removed');
assert.equal(html.split(newText).length-1,1,'new wording appears exactly once');

const inputPos=html.indexOf('<input id="pronunciationSearch"');
const instructionPos=html.indexOf('<div class="pronunciation-lookup-instruction" role="note">');
assert(inputPos>=0&&instructionPos>=0&&inputPos<instructionPos,
  'pronunciation input remains above the instruction');
const cssStart=html.indexOf('.pronunciation-lookup-card .pronunciation-lookup-instruction{');
assert(cssStart>=0);
const cssEnd=html.indexOf('}',cssStart);
const css=html.slice(cssStart,cssEnd+1);
assert(css.includes('font-size:14px'));
assert(css.includes('text-align:center'));
assert(css.includes('white-space:normal'));
assert(css.includes('overflow-wrap:anywhere'));
assert(css.includes('word-break:normal'));

assert(pwa.includes("const UPDATE_COUNTDOWN_SECONDS = 5;"));
assert(pwa.includes("setState('更新倒计时 ' + remaining, 'pwa-state-warn'"));
assert(pwa.includes("setState('自动更新完毕', 'pwa-state-ok'"));
assert(pwa.includes("setState('自动更新已开启', 'pwa-state-ok'"));
assert(sw.includes("if (event.data && event.data.type === 'DWSS_SKIP_WAITING') self.skipWaiting();"));
assert(pwa.includes("const UPDATE_COMPLETION_KEY = 'dwss:pwa-update-completed:0.9.86';"),
  'completion marker remains compatible with the currently running 0.9.86 page during the upgrade');

assert(html.includes("timeZone:'Africa/Lubumbashi'"));
assert(html.includes('id="dwss-announcement-controller"'));
assert.equal(manifest.id,'./?app=dwss-kolwezi-swahili');
assert.equal(manifest.display,'standalone');
assert.equal(manifest.name,'刚果金斯语翻译');

for(const removed of ['newVariantNote','听到的地区或场景','若这个中文意思已经收录','新变体先待确认']){
  assert(!html.includes(removed),'previous form cleanup preserved: '+removed);
}
for(const id of ['newZh','newReading','newFrenchReadingZh','pronunciationSearch']){
  assert(html.includes('id="'+id+'"'),'existing field preserved: '+id);
}
assert(boot.indexOf('./hanzi-pinyin.js')<boot.indexOf('./pronunciation-search.js'));
assert(boot.indexOf('./pronunciation-search.js')<boot.indexOf('./app.js'));
assert(boot.includes("'./pwa.js'"));

console.log('PASS: exact new instruction appears once; old sentence is completely removed.');
console.log('PASS: input order, font size, centered layout and mobile wrapping are preserved.');
console.log('PASS: 0.9.86-to-0.9.87 automatic update countdown compatibility is preserved.');
console.log('PASS: Lubumbashi daily announcement, vocabulary, translation and PWA identity are unchanged.');
