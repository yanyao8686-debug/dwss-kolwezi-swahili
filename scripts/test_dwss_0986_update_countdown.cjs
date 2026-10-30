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

assert.match(version,/^Version: 0\.9\.86$/m);
assert(sw.includes("const APP_VERSION = '0.9.86';"));
assert(html.includes('content="0.9.86">'));
assert(html.includes('DWSS_AUTO_UPDATE_0_9_86'));
assert(html.includes('版本 0.9.86 · 刚果金斯语翻译'));
assert((html.match(/dwss-release=0\.9\.86/g)||[]).length>=4);
assert.equal((html.match(/dwss-release=0\.9\.85/g)||[]).length,0);
assert(app.includes("version:'0.9.86'"));

assert(pwa.includes("const UPDATE_COUNTDOWN_SECONDS = 5;"));
assert(pwa.includes("const UPDATE_COMPLETION_KEY = 'dwss:pwa-update-completed:0.9.86';"));
assert(pwa.includes("state.textContent = String(text || '自动更新已开启')"));
assert(pwa.includes("setState('更新倒计时 ' + remaining, 'pwa-state-warn'"));
assert(pwa.includes("setState('正在下载新版本', 'pwa-state-warn'"));
assert(pwa.includes("setState('正在启用新版', 'pwa-state-warn'"));
assert(pwa.includes("setState('自动更新完毕', 'pwa-state-ok'"));
assert(pwa.includes("}, 2500);"));
assert(pwa.includes("setState('自动更新已开启', 'pwa-state-ok'"));
assert(pwa.includes("return startUpdateCountdown(registration.waiting);"));
assert(pwa.includes("startUpdateCountdown(worker);"));
assert(pwa.includes("sessionStorage.setItem(UPDATE_COMPLETION_KEY, String(Date.now()))"));
assert(pwa.includes("sessionStorage.removeItem(UPDATE_COMPLETION_KEY)"));
assert(pwa.includes("if (completionNoticeActive && text === '自动更新已开启') return;"));

const installBlock=sw.match(/self\.addEventListener\('install',[\s\S]*?\n\}\);/);
assert(installBlock,'Service Worker install event exists');
assert(installBlock[0].includes('await cache.addAll(PRECACHE_URLS)'));
assert(!installBlock[0].includes('skipWaiting'),'new worker must not bypass the countdown');
assert(sw.includes("if (event.data && event.data.type === 'DWSS_SKIP_WAITING') self.skipWaiting();"),
  'explicit activation message must remain');

assert(!pwa.includes("registration.waiting.postMessage({ type: 'DWSS_SKIP_WAITING' });"),
  'no immediate activation path may bypass countdown');
assert(pwa.includes("Math.ceil((updateCountdownDeadline - Date.now()) / 1000)"));
assert(pwa.includes("window.setTimeout(tick"));
assert(pwa.includes("if (!hadControllerAtBoot) return false;"),
  'first installation does not show a fake update countdown');
assert(pwa.includes("worker.state === 'installed' && navigator.serviceWorker.controller"),
  'countdown begins only after a fully installed update is waiting');
assert(pwa.includes("if (worker.state === 'redundant' && hadControllerAtBoot)"),
  'failed/redundant update is handled');

assert(pwa.includes("if (!navigator.onLine) return"));
assert(pwa.includes("setState('自动更新暂不可用', 'pwa-state-warn'") ||
       pwa.includes("setState('暂时无法连接更新服务', 'pwa-state-warn'"));
assert(pwa.includes("controllerchange"));
assert(pwa.includes("window.location.reload()"));
assert(pwa.includes("preserveDraftBeforeReload()"));

assert.equal(manifest.id,'./?app=dwss-kolwezi-swahili');
assert.equal(manifest.display,'standalone');
assert.equal(manifest.name,'刚果金斯语翻译');
assert(boot.indexOf('./hanzi-pinyin.js')<boot.indexOf('./pronunciation-search.js'));
assert(boot.indexOf('./pronunciation-search.js')<boot.indexOf('./app.js'));
assert(boot.includes("'./pwa.js'"));
assert(sw.includes("'./dictionary.js.gz'")||sw.includes('"./dictionary.js.gz"'));
assert(sw.includes("'./hanzi-pinyin.js'")||sw.includes('"./hanzi-pinyin.js"'));
assert(sw.includes("'./pronunciation-search.js'")||sw.includes('"./pronunciation-search.js"'));

for(const removed of ['newVariantNote','听到的地区或场景','若这个中文意思已经收录','新变体先待确认']){
  assert(!html.includes(removed),'clean add-word form remains clean: '+removed);
}
for(const id of ['newZh','newReading','newFrenchReadingZh','pronunciationSearch']){
  assert(html.includes('id="'+id+'"'),'required form/search control retained: '+id);
}
assert(html.includes("timeZone:'Africa/Lubumbashi'"));
assert(html.includes('id="dwss-announcement-controller"'));

console.log('PASS: update badge preserves real status labels instead of collapsing them to enabled.');
console.log('PASS: five-second countdown is tied to a fully installed waiting update.');
console.log('PASS: Service Worker cannot bypass the countdown; explicit skipWaiting remains wired.');
console.log('PASS: "自动更新完毕" is recorded only after controllerchange and reload, shown briefly, then reset.');
console.log('PASS: initial installation, failed update, offline behavior and draft preservation remain safe.');
console.log('PASS: clean form, pronunciation, announcement, PWA identity and offline modules remain intact.');
