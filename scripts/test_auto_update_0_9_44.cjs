'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const root='public';
const pwa=fs.readFileSync(root+'/pwa.js','utf8');
const sw=fs.readFileSync(root+'/sw.js','utf8');
const html=fs.readFileSync(root+'/index.html','utf8');
const app=fs.readFileSync(root+'/app.js','utf8');
const version=fs.readFileSync(root+'/VERSION.txt','utf8');
assert.match(pwa,/await registration\.update\(\)/,'opens with a forced update check');
assert.match(pwa,/visibilitychange/,'checks again when app returns to foreground');
assert.match(pwa,/addEventListener\('focus'/,'checks when window regains focus');
assert.match(pwa,/registration\.waiting\.postMessage/,'automatically activates a waiting worker');
assert.match(pwa,/controllerchange/,'reloads after the new worker takes control');
assert.match(pwa,/preserveDraftBeforeReload/,'preserves unfinished text before reload');
assert.match(pwa,/restoreDraftAfterReload/,'restores unfinished text after reload');
assert.match(sw,/await self\.skipWaiting\(\)/,'service worker activates without waiting for a manual click');
assert.match(sw,/await self\.clients\.claim\(\)/,'new worker takes control of open app tabs');
assert.match(sw,/APP_VERSION = '0\.9\.44'/,'cache version is bumped to invalidate old app resources');
assert.match(app,/version:'0\.9\.44'/,'app metadata updated');
assert.match(html,/DWSS_AUTO_UPDATE_0_9_44/,'page build marker updated');
assert.match(version,/Version: 0\.9\.44/,'release marker updated');
assert.match(pwa,/dwss:pwa-resume:0\.9\.44/,'draft snapshot is version-scoped');

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function run({controlled=true,seedSnapshot=false}={}){
 const els=new Map(),windowHandlers={},documentHandlers={},serviceWorkerHandlers={};
 const calls={register:0,update:0,reload:0,waitingMessages:0,inputEvents:0,restored:{}};
 class El{
  constructor(id){this.id=id;this.textContent='';this.hidden=false;this.disabled=false;this.title='';this.className='';this.dataset={};this.style={};this.value='';this.handlers={};this.classList={add(){},remove(){}};}
  addEventListener(t,f){(this.handlers[t]??=[]).push(f);}
  dispatchEvent(){calls.inputEvents++;return true;}
  click(){(this.handlers.click||[]).forEach(f=>f());}
 }
 const get=id=>{if(!els.has(id))els.set(id,new El(id));return els.get(id);};
 const navTabs=['translate','saved','maintenance'].map(tab=>{const e=new El(tab);e.dataset.tab=tab;return e;});
 const document={
  readyState:'complete',visibilityState:'visible',
  getElementById:get,
  addEventListener(t,f){(documentHandlers[t]??=[]).push(f);},
  querySelector(){return navTabs.find(x=>x.dataset.tab==='translate')||null;},
  querySelectorAll(){return navTabs;}
 };
 const activeWorker={
  postMessage(msg){calls.waitingMessages++;},
  state:'installed',
  handlers:{},
  addEventListener(t,f){(this.handlers[t]??=[]).push(f);}
 };
 let registration;
 const serviceWorker={
  controller:controlled?{}:null,
  handlers:{},
  addEventListener(t,f){(this.handlers[t]??=[]).push(f);},
  async register(){
   calls.register++;
   registration={
    installing:null,waiting:null,
    handlers:{},
    addEventListener(t,f){(this.handlers[t]??=[]).push(f);},
    async update(){
     calls.update++;
     const worker={state:'installing',handlers:{},addEventListener(t,f){(this.handlers[t]??=[]).push(f);}};
     registration.installing=worker;
     (registration.handlers.updatefound||[]).forEach(f=>f());
     worker.state='installed';
     (worker.handlers.statechange||[]).forEach(f=>f());
     // The worker's install handler calls skipWaiting; model activation/controller change.
     serviceWorker.controller={version:'new'};
     (serviceWorker.handlers.controllerchange||[]).forEach(f=>f());
     registration.installing=null;
     return;
    }
   };
   return registration;
  },
  ready:Promise.resolve()
 };
 const store=new Map();
 if(seedSnapshot) store.set('dwss:pwa-resume:0.9.44',JSON.stringify({
  savedAt:Date.now(),values:{inputText:'早班',newZh:'夜班',newReading:'本地读音'},activeTab:'maintenance'
 }));
 const sessionStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
 const window={
  isSecureContext:true,
  location:{hostname:'example.test',reload(){calls.reload++;}},
  navigator:{standalone:false},
  matchMedia(){return {matches:false};},
  addEventListener(t,f){(windowHandlers[t]??=[]).push(f);},
  setTimeout(fn){fn();return 1;},clearTimeout(){},
 };
 const navigator={
  onLine:true,
  storage:{persist:async()=>false},
  serviceWorker,
 };
 const context={window,document,navigator,location:{hostname:'example.test'},sessionStorage,Event:class{constructor(type,options){this.type=type;this.options=options;}},console,setTimeout,clearTimeout,Date,Promise,Array,JSON,Boolean,Math};
 vm.createContext(context);vm.runInContext(pwa,context);
 await sleep(0);await sleep(0);
 return {calls,els,store,navTabs,documentHandlers,serviceWorker};
}
(async()=>{
 const first=await run({controlled:true});
 assert.equal(first.calls.register,1,'service worker registered');
 assert.equal(first.calls.update,1,'automatic update check runs without clicking');
 assert.equal(first.calls.reload,1,'existing app reloads automatically after controller changes');
 const firstState=first.els.get('pwaState').textContent;
 assert(firstState==='更新完成，正在刷新'||firstState==='正在自动更新'||firstState==='发现新版本','shows automatic update state');
 const initial=await run({controlled:false});
 assert.equal(initial.calls.update,1,'first install also checks for updates');
 assert.equal(initial.calls.reload,0,'first installation does not force-reload the page');
 const restored=await run({controlled:true,seedSnapshot:true});
 assert.equal(restored.els.get('inputText').value,'早班','translation draft restored');
 assert.equal(restored.els.get('newZh').value,'夜班','Chinese term draft restored');
 assert.equal(restored.els.get('newReading').value,'本地读音','pronunciation draft restored');
 assert.equal(restored.calls.inputEvents,1,'restored translation triggers re-translation');
 assert(!restored.store.has('dwss:pwa-resume:0.9.44'),'consumed session snapshot is removed');
 console.log('PASS 0.9.44: app-open update check, automatic controller-change reload, no first-install reload, and draft preservation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
