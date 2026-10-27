'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const zlib=require('node:zlib');
const root=path.join(process.cwd(),'public');
const read=n=>fs.readFileSync(path.join(root,n),'utf8');
const html=read('index.html');
assert.match(html,/id="newFrench" maxlength="200"/,'French input is visible in the main add-word form');
assert(!/id="newReading"[^>]*required/.test(html),'Swahili pronunciation is optional when French is supplied');
assert.match(html,/当地斯语中文谐音和法语备用表达至少填写一项/,'form explains the either/or input rule');

const cloudRows=[],subscribers=[];
let nextId=1;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const client={
 from(table){
  assert.equal(table,'shared_terms');
  return {
   select(){return {order(){return {range:async()=>({data:cloudRows.map(x=>({...x})),count:cloudRows.length,error:null})};}};},
   insert(payload){return {select(){return {single:async()=>{
    const row={...payload,id:'cloud-'+(nextId++),created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
    cloudRows.unshift(row);subscribers.forEach(fn=>fn({new:{...row}}));return {data:{...row},error:null};
   }};}};}
  };
 },
 channel(){return {on(event,filter,fn){subscribers.push(fn);return this;},subscribe(cb){if(cb)cb('SUBSCRIBED');return this;}};}
};

function bootUser(name){
 const els=new Map();
 class ClassList{add(){} remove(){} toggle(){return false;} contains(){return false;}}
 class El{
  constructor(id=''){this.id=id;this.value='';this.textContent='';this.innerHTML='';this.hidden=false;this.disabled=false;this.required=false;this.maxLength=0;this.type='text';this.dataset={};this.style={};this.className='';this.classList=new ClassList();this.handlers={};this.children=[];this.options=[];}
  addEventListener(type,fn){(this.handlers[type]??=[]).push(fn);}
  querySelectorAll(){return [];}
  querySelector(){return null;}
  appendChild(el){this.children.push(el);return el;}
  prepend(el){this.children.unshift(el);}
  insertBefore(el){this.children.unshift(el);return el;}
  reset(){this.value='';}
  focus(){} select(){} remove(){} setAttribute(){} insertAdjacentHTML(){}
  dispatchEvent(){return true;}
 }
 const get=id=>{if(!els.has(id))els.set(id,new El(id));return els.get(id);};
 [...html.matchAll(/\bid="([^"]+)"/g)].forEach(m=>get(m[1]));
 const listeners={};
 const document={readyState:'complete',visibilityState:'visible',body:get('body'),head:get('head'),
  getElementById:get,querySelectorAll(){return [];},querySelector(){return null;},
  createElement(tag){return new El(tag);},execCommand(){return true;},
  addEventListener(type,fn){(listeners[type]??=[]).push(fn);}
 };
 const window={SW_DB:[],SW_FRENCH:{},SW_FRENCH_READINGS:{},crypto:{randomUUID:()=>name+'-'+(nextId++)},
  confirm(){return true;},scrollTo(){},addEventListener(type,fn){(listeners[type]??=[]).push(fn);},
  dispatchEvent(event){(listeners[event.type]||[]).forEach(fn=>fn(event));return true;},
  setTimeout(fn){return setTimeout(fn,0);},clearTimeout,
  supabase:{createClient(){return client;}}
 };
 class CE{constructor(type,options={}){this.type=type;this.detail=options.detail||{};}}
 class Ev{constructor(type,options={}){this.type=type;Object.assign(this,options);}}
 const storage=new Map();
 const localStorage={getItem:key=>storage.has(key)?storage.get(key):null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};
 const navigator={onLine:true,clipboard:{writeText:async()=>{}}};
 const context={window,document,localStorage,navigator,location:{hash:''},crypto:window.crypto,CustomEvent:CE,Event:Ev,
  console,setTimeout,clearTimeout,Date,Math,JSON,Map,Set,Array,Object,String,Number,RegExp,Error,Promise,Intl,parseInt,parseFloat,URL,Blob,FormData};
 vm.createContext(context);
 vm.runInContext(zlib.gunzipSync(fs.readFileSync(path.join(root,'dictionary.js.gz'))).toString('utf8'),context,{filename:name+'-dictionary.js'});
 vm.runInContext(read('french-fallback.js'),context,{filename:name+'-french-fallback.js'});
 vm.runInContext(read('shared-lexicon.js'),context,{filename:name+'-shared-lexicon.js'});
 vm.runInContext(read('app.js'),context,{filename:name+'-app.js'});
 return {api:window.KolweziSwahili,window,els,storage};
}

(async()=>{
 const a=bootUser('A');
 await wait(30);
 // Use the actual visible add form: French-only is accepted without a Swahili reading.
 a.els.get('newZh').value='夜班';
 a.els.get('newReading').value='';
 a.els.get('newFrench').value='travail de nuit';
 const submit=a.els.get('entryForm').handlers.submit[0];
 assert.equal(typeof submit,'function','main add-word form is wired');
 submit({preventDefault(){}});
 await wait(100);
 const frenchRow=cloudRows.find(x=>x.chinese_text==='夜班');
 assert(frenchRow,'French-only term is uploaded to shared_terms');
 assert.equal(frenchRow.source_language,'fr','French-only term is explicitly labelled French');
 assert.equal(frenchRow.french_text,'travail de nuit');
 assert.equal(frenchRow.local_text,null);
 assert(frenchRow.local_pronunciation_cn&&frenchRow.local_pronunciation_cn.trim(),'DB-required French pronunciation is generated automatically');
 assert.equal(a.api.getCustom().find(x=>x.zh==='夜班').shareSyncStatus,'synced','submitter receives confirmed synced status');
 let translated=a.api.translate('夜班');
 assert(translated.segments.some(x=>x.type==='french'&&x.french==='travail de nuit'),'submitter can translate French-only added term');
 assert(translated.segments.some(x=>x.type==='french'&&x.source==='用户新增法语备用词条'),'personal French term is correctly labelled');

 // A second user with no personal copy downloads the French row and can translate it.
 const b=bootUser('B');
 await wait(80);
 assert.equal(b.api.customCount,0,'second user has no local personal term');
 assert(b.api.sharedCount>=1,'second user receives the cloud shared vocabulary');
 translated=b.api.translate('夜班');
 assert(translated.segments.some(x=>x.type==='french'&&x.french==='travail de nuit'),'second user translates the cloud French fallback');
 assert(translated.segments.some(x=>x.type==='french'&&x.source==='云端共享词库中的法语补位'),'cloud French entry has the correct source label');

 // If Swahili and French are supplied together, the cloud row carries both and Swahili wins.
 assert.equal(a.api.addCustom({zh:'白班',reading:'白班当地斯语读音',french:'service de jour'}).ok,true);
 await wait(100);
 const comboRow=cloudRows.find(x=>x.chinese_text==='白班');
 assert(comboRow,'combined Swahili + French term is synced');
 assert.equal(comboRow.source_language,'sw');
 assert.equal(comboRow.local_pronunciation_cn,'白班当地斯语读音');
 assert.equal(comboRow.french_text,'service de jour','French backup is synced alongside Swahili');
 translated=a.api.translate('白班');
 const local=translated.segments.find(x=>x.type==='local');
 assert(local,'local Swahili remains the translation result when available');
 assert.equal(local.reading,'白班当地斯语读音');
 assert.equal(local.french,'service de jour','French backup remains attached as alternative metadata');
 assert(!translated.segments.some(x=>x.type==='french'),'French never replaces an available local Swahili hit');

 // A French-only user addition must not displace a matching built-in Swahili term.
 assert.equal(a.api.addCustom({zh:'这个',french:'ceci'}).ok,true);
 translated=a.api.translate('这个');
 assert(translated.segments.some(x=>x.type==='local'),'built-in local Swahili remains above French-only terms');
 assert(!translated.segments.some(x=>x.type==='french'),'French-only term does not displace the built-in local term');
 console.log('PASS 0.9.46: visible form -> French-only cloud upload -> second-user fallback; combined Swahili/French sync; strict Swahili priority.');
})().catch(error=>{console.error(error);process.exitCode=1;});
