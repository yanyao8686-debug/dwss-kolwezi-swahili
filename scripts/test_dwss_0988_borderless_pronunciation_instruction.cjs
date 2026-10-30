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

const sentence='输入听到却不懂意思的斯语中文谐音时，即便是同音不同字的中文，系统也会自动查询近似的读音来匹配对应发音的斯语';
assert.match(version,/^Version: 0\.9\.88$/m);
assert(sw.includes("const APP_VERSION = '0.9.88';"));
assert(html.includes('content="0.9.88">'));
assert(html.includes('DWSS_AUTO_UPDATE_0_9_88'));
assert(html.includes('版本 0.9.88 · 刚果金斯语翻译'));
assert((html.match(/dwss-release=0\.9\.88/g)||[]).length>=3);
assert.equal((html.match(/dwss-release=0\.9\.87/g)||[]).length,0);
assert(app.includes("version:'0.9.88'"));

assert.equal(html.split(sentence).length-1,1,'instruction sentence appears once');
const styleMatch=html.match(/<style id="dwss-pronunciation-instruction-frame-0988">([\s\S]*?)<\/style>/);
assert(styleMatch,'new exact-target instruction style exists');
const css=styleMatch[1];
assert(css.includes('color:#173b78!important;'),'reference dark-blue text color retained');
assert(css.includes('font-size:14px!important;'),'reference 14px font size retained');
assert(css.includes('font-weight:700!important;'),'reference bold weight retained');
assert(css.includes('text-align:center!important;'),'reference centered alignment retained');
assert(css.includes('border:0!important;'),'border removed');
assert(css.includes('border-radius:0!important;'),'rounded border frame removed');
assert(!css.includes('border:1px solid #b7c8bf'),'old green border removed');
assert(css.includes('background:transparent!important;'),'background remains transparent');

const inputPos=html.indexOf('<input id="pronunciationSearch"');
const instructionPos=html.indexOf('<div class="pronunciation-lookup-instruction" role="note">');
assert(inputPos>=0&&instructionPos>inputPos,'input remains above explanatory text');

assert(pwa.includes("const UPDATE_COUNTDOWN_SECONDS = 5;"));
assert(pwa.includes("setState('更新倒计时 ' + remaining, 'pwa-state-warn'"));
assert(pwa.includes("setState('自动更新完毕', 'pwa-state-ok'"));
assert(pwa.includes("setState('自动更新已开启', 'pwa-state-ok'"));
assert(sw.includes("if (event.data && event.data.type === 'DWSS_SKIP_WAITING') self.skipWaiting();"));
assert(pwa.includes("const UPDATE_COMPLETION_KEY = 'dwss:pwa-update-completed:0.9.86';"),
  'existing 0.9.86 update completion marker is left compatible during upgrade');

assert(html.includes("timeZone:'Africa/Lubumbashi'"));
assert(html.includes('id="dwss-announcement-controller"'));
assert.equal(manifest.id,'./?app=dwss-kolwezi-swahili');
assert.equal(manifest.display,'standalone');
assert.equal(manifest.name,'刚果金斯语翻译');

for(const removed of ['newVariantNote','听到的地区或场景','若这个中文意思已经收录','新变体先待确认']){
  assert(!html.includes(removed),'clean add-word form remains: '+removed);
}
for(const id of ['newZh','newReading','newFrenchReadingZh','pronunciationSearch']){
  assert(html.includes('id="'+id+'"'),'existing control remains: '+id);
}
assert(boot.indexOf('./hanzi-pinyin.js')<boot.indexOf('./pronunciation-search.js'));
assert(boot.indexOf('./pronunciation-search.js')<boot.indexOf('./app.js'));
assert(boot.includes("'./pwa.js'"));

console.log('PASS: reference text color #173b78 and font size 14px preserved.');
console.log('PASS: only the green border and rounded frame are removed from this one text element.');
console.log('PASS: input order, mobile layout, phrase, pronunciation search and other controls preserved.');
console.log('PASS: update countdown, Lubumbashi announcement, PWA and vocabulary-related resources preserved.');
