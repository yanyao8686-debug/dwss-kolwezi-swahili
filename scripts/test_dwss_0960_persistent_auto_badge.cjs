'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const root = process.env.DWSS_TEST_ROOT || 'public';
const read = name => fs.readFileSync(root + '/' + name, 'utf8');
const html = read('index.html'), pwa = read('pwa.js'), sw = read('sw.js'), app = read('app.js'), version = read('VERSION.txt');

assert(html.includes('content="0.9.60"><!-- DWSS_AUTO_UPDATE_0_9_60 -->'));
assert(html.includes('id="pwaState" role="status" aria-live="polite" title="应用启动、恢复联网或回到前台时会自动检查新版">自动更新已开启</span>'));
assert(!html.includes('checkUpdateBtn'));
assert(!html.includes('>检查更新</button>'));
assert(!pwa.includes('checkUpdateBtn'));
assert(!pwa.includes('state.hidden = true'));
assert(!pwa.includes('state.hidden = !text'));
assert(pwa.includes("state.hidden = false;"));
assert(pwa.includes("state.textContent = unavailable ? '自动更新暂不可用' : '自动更新已开启';"));
assert(pwa.includes("await registration.update();"));
assert(pwa.includes("window.addEventListener('online', () => {"));
assert(pwa.includes("document.addEventListener('visibilitychange', () => {"));
assert(pwa.includes("window.addEventListener('focus', () => checkForUpdates());"));
assert(pwa.includes("window.addEventListener('load', initializeUpdateService, { once: true })"));
assert(pwa.includes("navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' })"));
assert(pwa.includes("registration.waiting.postMessage({ type: 'DWSS_SKIP_WAITING' })"));
assert(pwa.includes('preserveDraftBeforeReload();'));
assert(sw.includes("const APP_VERSION = '0.9.60';"));
assert(app.includes("version:'0.9.60'"));
assert(version.includes('Version: 0.9.60'));

let now = 1000000;
class FakeDate extends Date { static now(){ return now; } }
const winEvents = {}, docEvents = {}, swEvents = {}, regEvents = {}, workerEvents = {};
const timeoutQueue = [], stored = new Map();
let updateCalls = 0, reloadCalls = 0, skipWaitingMessages = 0;
const state = {textContent:'自动更新已开启',hidden:false,className:'chip pwa-state-ok',title:''};
const network = {textContent:'',style:{}};
const toast = {textContent:'',hidden:true,classList:{add(){},remove(){}}};
const install = {hidden:true,textContent:'',addEventListener(){}};
const els = {pwaState:state,networkBadge:network,pwaMessage:{textContent:'',hidden:true},pwaToast:toast,installAppBtn:install,inputText:{value:'检查车辆'},newZh:{value:'检查车辆'}};
const worker = {state:'installing',addEventListener(name,fn){workerEvents[name]=fn;}};
const waitingWorker = {postMessage(message){if(message.type==='DWSS_SKIP_WAITING')skipWaitingMessages++;}};
const registration = {waiting:null,installing:null,async update(){updateCalls++;},addEventListener(name,fn){regEvents[name]=fn;}};
const navigator = {
  onLine:true,
  serviceWorker:{
    controller:{active:true},ready:Promise.resolve(registration),
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
  // Critical regression check: the badge must be visible immediately, before async registration resolves.
  assert.equal(state.hidden,false,'automatic-update badge is visible on first paint');
  assert.equal(state.textContent,'自动更新已开启');
  await flush();
  assert.equal(updateCalls,1,'startup automatically checks for updates');
  assert.equal(state.hidden,false,'startup update check does not hide the badge');
  assert.equal(state.textContent,'自动更新已开启');

  now += 60001; winEvents.online(); await flush();
  assert.equal(updateCalls,2,'network reconnection triggers update check');
  assert.equal(state.hidden,false,'reconnection does not hide the badge');

  now += 60001; document.visibilityState='visible'; docEvents.visibilitychange(); await flush();
  assert.equal(updateCalls,3,'returning to foreground triggers update check');
  assert.equal(state.hidden,false);

  now += 60001; winEvents.focus(); await flush();
  assert.equal(updateCalls,4,'window focus triggers update check');
  assert.equal(state.hidden,false);

  // Updating states keep the badge visible and its requested wording.
  registration.installing=worker; registration.waiting=waitingWorker;
  regEvents.updatefound();
  worker.state='installed'; workerEvents.statechange();
  assert.equal(skipWaitingMessages,1,'new Service Worker is automatically activated');
  assert.equal(state.hidden,false);
  assert.equal(state.textContent,'自动更新已开启');

  // Drafts survive automatic replacement.
  swEvents.controllerchange();
  const saved=JSON.parse(stored.get('dwss:pwa-resume:0.9.44'));
  assert.equal(saved.values.inputText,'检查车辆');
  assert.equal(saved.values.newZh,'检查车辆');
  assert.equal(saved.activePanel,'maintenance');
  assert.equal(timeoutQueue.length,1);
  timeoutQueue[0]();
  assert.equal(reloadCalls,1);
  assert.equal(state.hidden,false);
  console.log('PASS: badge is visible on first paint and remains visible after every automatic-update transition.');
  console.log('PASS: badge wording remains “自动更新已开启” while auto checks/installs run.');
  console.log('PASS: startup, reconnect, foreground-return and focus all trigger automatic checks.');
  console.log('PASS: new Service Worker activates and reloads only after preserving drafts.');
  console.log('PASS: manual “检查更新” button is absent.');
})().catch(error=>{console.error(error);process.exitCode=1;});
