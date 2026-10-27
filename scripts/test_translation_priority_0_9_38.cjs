const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib');
const root=path.join(process.cwd(),'public'),read=n=>fs.readFileSync(path.join(root,n),'utf8');
class CL{add(){} remove(){} toggle(){} contains(){return false;}}
class El{constructor(id=''){this.id=id;this.value='';this.textContent='';this.innerHTML='';this.hidden=false;this.dataset={};this.style={};this.classList=new CL();this.handlers={};this.options=[];}
 addEventListener(t,f){(this.handlers[t]||=[]).push(f);} querySelectorAll(){return[];} appendChild(){return{};} prepend(){} reset(){this.value='';} focus(){} select(){} remove(){} insertAdjacentHTML(){} }
const ids=[...read('index.html').matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]),els=new Map(ids.map(id=>[id,new El(id)]));
const get=id=>{if(!els.has(id))els.set(id,new El(id));return els.get(id)};
const data=new Map();const localStorage={getItem:k=>data.has(k)?data.get(k):null,setItem(k,v){data.set(k,String(v));},removeItem(k){data.delete(k);}};
const eventMap={};const win={SW_DB:[],SW_FRENCH:{},SW_FRENCH_READINGS:{},DWSSSharedLexicon:null,addEventListener(t,f){(eventMap[t]||=[]).push(f);},dispatchEvent(e){for(const f of eventMap[e.type]||[])f(e);return true;},confirm(){return false;},scrollTo(){}};
class Ev{constructor(type,o={}){this.type=type;Object.assign(this,o);}}
const doc={body:new El('body'),readyState:'complete',getElementById:get,querySelectorAll(){return[];},createElement(t){return new El(t);},execCommand(){return true;}};
const ctx={window:win,document:doc,localStorage,navigator:{clipboard:{writeText:async()=>{}}},location:{hash:''},CustomEvent:Ev,Event:Ev,console,setTimeout(){return 1;},clearTimeout(){},Date,Math,JSON,Map,Set,Array,Object,String,Number,RegExp,Error,Promise,Intl,parseInt,parseFloat};
vm.createContext(ctx);
vm.runInContext(zlib.gunzipSync(fs.readFileSync(path.join(root,'dictionary.js.gz'))).toString('utf8'),ctx);
vm.runInContext(read('french-fallback.js'),ctx);
vm.runInContext(read('app.js'),ctx);
const api=win.KolweziSwahili;assert(api&&api.dictCount>1000,'dictionary boot');

// The reported conflict: French is available before a local Swahili word is added.
assert(api.translate('夜班').segments.some(s=>s.type==='french'),'French fallback remains available when local Swahili is absent');

// A new shared Swahili term takes priority over the built-in reading for the same Chinese key.
win.dispatchEvent(new Ev('dwss:shared-terms-updated',{detail:{terms:[{source_language:'sw',chinese_text:'上班',local_pronunciation_cn:'共享斯语读音'}]}}));
let seg=api.translate('上班').segments[0];assert.equal(seg.type,'local');assert.equal(seg.reading,'共享斯语读音','shared Swahili outranks built-in');

// A new personal Swahili word overrides the exact French fallback key.
const sharedEvents=[];win.addEventListener('dwss:personal-term-added',e=>sharedEvents.push(e.detail.entry));
const added=api.addCustom({zh:'夜班',reading:'夜班当地斯语读音',french:'Équipe de nuit'});
assert.equal(added.ok,true);
seg=api.translate('夜班').segments[0];assert.equal(seg.type,'local');assert.equal(seg.reading,'夜班当地斯语读音');
assert.equal(api.translate('夜班').segments.some(s=>s.type==='french'),false);
assert(sharedEvents.some(e=>e.zh==='夜班'&&e.shareSyncStatus==='pending'),'new personal term dispatches automatic shared-sync event');

// A personal addition wins over both shared and built-in local variants.
assert.equal(api.addCustom({zh:'上班',reading:'个人新增斯语读音'}).ok,true);
seg=api.translate('上班').segments[0];assert.equal(seg.type,'local');assert.equal(seg.reading,'个人新增斯语读音');

// New imported local/French terms are also placed in the auto-share queue.
const imported=api.importCustom({entries:[{zh:'自动共享导入测试词',reading:'导入词本地读音'}]});
assert.equal(imported.ok,true);
assert(sharedEvents.some(e=>e.zh==='自动共享导入测试词'&&e.shareSyncStatus==='pending'),'imported term dispatches automatic shared-sync event');

// French remains available as a secondary fallback for unrelated text with no local hit.
assert(api.translate('请你明天早上到办公室集合').segments.some(s=>s.type==='french'),'French fallback still works');
console.log('PASS: Swahili-first regression; personal > shared > built-in > French; new/imported terms auto-sync.');
