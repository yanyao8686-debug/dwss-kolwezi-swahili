'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const root = process.env.DWSS_TEST_ROOT || 'public';
const read = name => fs.readFileSync(root + '/' + name, 'utf8');
const html = read('index.html'), pwa = read('pwa.js'), sw = read('sw.js'), boot = read('boot.js'), app = read('app.js'), version = read('VERSION.txt');

assert(html.includes('content="0.9.59"><!-- DWSS_AUTO_UPDATE_0_9_59 -->'));
assert(!html.includes('checkUpdateBtn'));
assert(!html.includes('>检查更新</button>'));
assert(html.includes('id="pwaState" role="status" aria-live="polite"'));
assert(html.indexOf('id="pwaState"') > html.indexOf('id="networkBadge"'));
assert(html.includes('.status-strip #pwaState{flex:0 0 auto;margin-left:auto!important;'));
assert(!pwa.includes('checkUpdateBtn'));
assert(!pwa.includes('updateButton'));
assert(!pwa.includes('manual'));
assert(pwa.includes("await registration.update();"));
assert(pwa.includes("window.addEventListener('online', () => {"));
assert(pwa.includes("document.addEventListener('visibilitychange', () => {"));
assert(pwa.includes("window.addEventListener('focus', () => checkForUpdates());"));
assert(pwa.includes("window.addEventListener('load', initializeUpdateService, { once: true })"));
assert(pwa.includes("navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' })"));
assert(pwa.includes("registration.addEventListener('updatefound'"));
assert(pwa.includes("worker.state === 'installed' && navigator.serviceWorker.controller"));
assert(pwa.includes("registration.waiting.postMessage({ type: 'DWSS_SKIP_WAITING' })"));
assert(pwa.includes("navigator.serviceWorker && navigator.serviceWorker.addEventListener('controllerchange'"));
assert(pwa.includes('preserveDraftBeforeReload();'));
assert(pwa.includes('window.location.reload()'));
assert(sw.includes("const APP_VERSION = '0.9.59';"));
assert(sw.includes('await cache.addAll(PRECACHE_URLS);'));
assert(sw.includes('await self.skipWaiting();'));
assert(sw.includes('await self.clients.claim();'));
assert(app.includes("version:'0.9.59'"));
assert(boot.includes('会在重新联网或重新打开应用时自动检测并安装'));
assert(!boot.includes('检查更新'));
assert(version.includes('Version: 0.9.59'));

let now = 1000000;
class FakeDate extends Date { static now(){ return now; } }
const winEvents = {}, docEvents = {}, swEvents = {}, regEvents = {}, workerEvents = {};
const timeoutQueue = [];
const stored = new Map();
let updateCalls = 0, reloadCalls = 0, skipWaitingMessages = 0;
const state = {textContent:'',hidden:true,className:''};
const network = {textContent:'',style:{}};
const toast = {textContent:'',hidden:true,classList:{add(){},remove(){}}};
const install = {hidden:true,textContent:'',addEventListener(){}};
const input = {value:'检查车辆'};
const newZh = {value:'检查车辆'};
const els = {pwaState:state,networkBadge:network,pwaMessage:{textContent:'',hidden:true},pwaToast:toast,installAppBtn:install,inputText:input,newZh};
const worker = {state:'installing',addEventListener(name,fn){workerEvents[name]=fn;}};
const waitingWorker = {postMessage(message){if(message.type==='DWSS_SKIP_WAITING')skipWaitingMessages++;}};
const registration = {
  waiting:null, installing:null,
  async update(){updateCalls++;},
  addEventListener(name,fn){regEvents[name]=fn;}
};
const navigator = {
  onLine:true,
  serviceWorker:{
    controller:{active:true}, ready:Promise.resolve(registration),
    async register(url,options){assert.equal(url,'./sw.js');assert.equal(options.updateViaCache,'none');return registration;},
    addEventListener(name,fn){swEvents[name]=fn;}
  }
};
const document = {
  readyState:'complete',visibilityState:'visible',
  getElementById:id=>els[id]||null,
  addEventListener(name,fn){docEvents[name]=fn;},
  querySelector(selector){
    if(selector==='nav.tabs .tab.active')return {dataset:{tab:'maintenance'}};
    if(selector==='main .panel.active')return {id:'maintenance'};
    return null;
  }
};
const window = {
  isSecureContext:true,
  addEventListener(name,fn){winEvents[name]=fn;},
  setTimeout(fn){timeoutQueue.push(fn);return timeoutQueue.length;},
  clearTimeout(){},
  location:{reload(){reloadCalls++;}}
};
const sessionStorage = {setItem(k,v){stored.set(k,String(v));},getItem(k){return stored.get(k)||null;},removeItem(k){stored.delete(k);}};
const context = {window,document,navigator,location:{hostname:'example.github.io'},sessionStorage,Date:FakeDate,Event:class Event{constructor(type){this.type=type;}},console,Promise,Array,JSON};
vm.runInNewContext(pwa,context,{filename:'pwa.js'});
const flush = async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
(async()=>{
  await flush();
  assert.equal(updateCalls,1,'startup automatically checks for updates');
  assert.equal(state.textContent,'自动更新已开启');
  now += 60001; winEvents.online(); await flush();
  assert.equal(updateCalls,2,'network reconnection triggers update check');
  now += 60001; document.visibilityState='visible'; docEvents.visibilitychange(); await flush();
  assert.equal(updateCalls,3,'returning to foreground triggers update check');
  now += 60001; winEvents.focus(); await flush();
  assert.equal(updateCalls,4,'window focus triggers update check');

  registration.installing=worker; registration.waiting=waitingWorker;
  regEvents.updatefound();
  worker.state='installed'; workerEvents.statechange();
  assert.equal(skipWaitingMessages,1,'new waiting Service Worker is automatically activated');
  swEvents.controllerchange();
  const saved=JSON.parse(stored.get('dwss:pwa-resume:0.9.44'));
  assert.equal(saved.values.inputText,'检查车辆');
  assert.equal(saved.values.newZh,'检查车辆');
  assert.equal(saved.activePanel,'maintenance');
  assert.equal(timeoutQueue.length,1,'automatic update schedules one safe reload');
  timeoutQueue[0]();
  assert.equal(reloadCalls,1);
  console.log('PASS: automatic check runs at app startup, reconnect, foreground return and focus.');
  console.log('PASS: Service Worker downloads/activates newer build and reloads after preserving input drafts.');
  console.log('PASS: right-side status badge is the only update control; no manual check button remains.');
})().catch(error=>{console.error(error);process.exitCode=1;});
