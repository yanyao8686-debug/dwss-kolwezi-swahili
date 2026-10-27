'use strict';
const fs=require('node:fs'),vm=require('node:vm'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const root='public';
class ClassList{add(){}remove(){}toggle(){}contains(){return false;}}
class El{
 constructor(id=''){this.id=id;this.value='';this.textContent='';this.innerHTML='';this.hidden=false;this.disabled=false;this.dataset={};this.style={};this.className='';this.classList=new ClassList();this.handlers={};this.children=[];this.type='';this.name='';}
 addEventListener(t,f){(this.handlers[t]??=[]).push(f);}
 querySelectorAll(){return [];} querySelector(){return new El('query');}
 appendChild(x){this.children.push(x);return x;} prepend(x){this.children.unshift(x);}
 insertBefore(x){this.children.unshift(x);return x;} replaceWith(){} remove(){}
 reset(){for(const id of ['newZh','newReading','newLatin','newFrench','newFrenchReadingZh','newNote']){const e=elements.get(id);if(e)e.value='';}}
 focus(){}select(){}setAttribute(){}insertAdjacentHTML(){}
}
const elements=new Map();
const get=id=>{if(!elements.has(id))elements.set(id,new El(id));return elements.get(id);};
[...fs.readFileSync(root+'/index.html','utf8').matchAll(/\bid="([^"]+)"/g)].forEach(m=>get(m[1]));
const document={readyState:'complete',body:get('body'),head:get('head'),getElementById:get,querySelectorAll(){return [];},querySelector(){return null;},createElement(tag){return new El(tag);},execCommand(){return true;},addEventListener(){}};
const listeners={};
class CE{constructor(type,opts={}){this.type=type;this.detail=opts.detail||{};}}
class Ev{constructor(type,opts={}){this.type=type;Object.assign(this,opts);}}
let uuid=0;
const window={SW_DB:[],SW_FRENCH:{},SW_FRENCH_READINGS:{},DWSSSharedLexicon:null,crypto:{randomUUID:()=>'00000000-0000-4000-8000-'+String(++uuid).padStart(12,'0')},confirm:()=>true,scrollTo(){},addEventListener(t,f){(listeners[t]??=[]).push(f);},dispatchEvent(e){for(const f of listeners[e.type]||[])f(e);return true;},setTimeout,clearTimeout};
const storage=new Map();
const localStorage={getItem:k=>storage.has(k)?storage.get(k):null,setItem(k,v){storage.set(k,String(v));},removeItem(k){storage.delete(k);}};
const cloudRows=[];
const client={
 from(){return {
  select(){return {order(){return {limit:async()=>({data:cloudRows.slice(),error:null})};}};},
  insert(payload){return {select(){return {single:async()=>{const row={...payload,id:'cloud-'+(cloudRows.length+1),created_at:new Date().toISOString()};cloudRows.unshift(row);return {data:row,error:null};}};}};}
 };},
 channel(){return {on(){return this;},subscribe(){return this;}};}
};
window.supabase={createClient:()=>client};
const navigator={onLine:true,clipboard:{writeText:async()=>{}}};
const context={window,document,localStorage,navigator,location:{hash:''},CustomEvent:CE,Event:Ev,console,setTimeout,clearTimeout,Date,Math,JSON,Map,Set,Array,Object,String,Number,RegExp,Error,Promise,Intl,parseInt,parseFloat,URL,Blob,FormData,crypto:window.crypto};
vm.createContext(context);
vm.runInContext(zlib.gunzipSync(fs.readFileSync(root+'/dictionary.js.gz')).toString('utf8'),context);
vm.runInContext(fs.readFileSync(root+'/french-fallback.js','utf8'),context);
vm.runInContext(fs.readFileSync(root+'/shared-lexicon.js','utf8'),context);
vm.runInContext(fs.readFileSync(root+'/app.js','utf8'),context);
const sharedSource=fs.readFileSync(root+'/shared-lexicon.js','utf8');
assert(!sharedSource.includes('buildUi(); notifyApp();'),'separate floating shared-dictionary UI is disabled');
assert(sharedSource.includes('local_text: src === "sw" ? (local || null) : null,'),'blank optional spelling is sent as SQL NULL');
const api=window.KolweziSwahili;
assert(api,'DWSS API initialized');assert(api.dictCount>1000,'built-in dictionary loaded');
assert(fs.readFileSync(root+'/app.js','utf8').includes("version:'0.9.42'"),'app runtime version');
const latinOnly=api.addCustom({zh:'仅拉丁拼写测试词',reading:'',latin:'kagua gari',french:'',category:'安保与工作'});
assert.equal(latinOnly.ok,false,'Latin-only Swahili term is rejected before local save');
assert.match(latinOnly.error,/必须填写.*当地斯语中文谐音/);
assert.equal(api.customCount,0,'rejected entry is not stored locally');
const valid=api.addCustom({zh:'端到端共享测试词',reading:'噶古拉 嘎里',latin:'kagua gari',french:'',category:'安保与工作',source:'回归测试'});
assert.equal(valid.ok,true,'verified local Chinese reading saves');
assert(api.exact('端到端共享测试词'),'local index rebuilds');
assert(api.translate('端到端共享测试词').segments.some(s=>s.type==='local'&&s.canonical==='端到端共享测试词'&&s.reading.includes('噶古拉')),'new local term is immediately translated');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 await sleep(180);
 assert.equal(cloudRows.length,1,'new local Swahili word is posted to Supabase');
 assert.equal(cloudRows[0].source_language,'sw');
 assert.equal(cloudRows[0].local_pronunciation_cn,'噶古拉 嘎里');
 assert.equal(api.getCustom().find(x=>x.zh==='端到端共享测试词').shareSyncStatus,'synced','share status confirms cloud acceptance');
 assert(window.DWSSSharedLexicon.getTerms().some(x=>x.chinese_text==='端到端共享测试词'),'cloud row appears in shared list');
 assert(api.translate('端到端共享测试词').segments.some(s=>s.canonical==='端到端共享测试词'),'translation remains after shared merge');
 const withoutLatin=api.addCustom({zh:'无拉丁拼写共享测试词',reading:'科卢韦齐测试读音',latin:'',french:'',category:'安保与工作'});
 assert.equal(withoutLatin.ok,true,'a local term may omit Latin spelling when verified Chinese pronunciation exists');
 assert(api.translate('无拉丁拼写共享测试词').segments.some(s=>s.canonical==='无拉丁拼写共享测试词'),'no-Latin term enters local translation index');
 await sleep(180);
 assert.equal(cloudRows.length,2,'second Swahili term is also synced');
 const noLatinRow=cloudRows.find(x=>x.chinese_text==='无拉丁拼写共享测试词');
 assert(noLatinRow,'no-Latin entry is present in the shared database');
 assert.equal(noLatinRow.local_text,null,'blank optional Latin spelling is stored as SQL NULL');
 assert.equal(api.getCustom().find(x=>x.zh==='无拉丁拼写共享测试词').shareSyncStatus,'synced','no-Latin term receives synced status');
 const french=api.addCustom({zh:'法语备用测试词',reading:'',latin:'',french:'rassembler',frenchReadingZh:'',category:'其他'});
 assert.equal(french.ok,true,'French-only fallback remains supported');
 await sleep(180);
 const frenchRow=cloudRows.find(x=>x.chinese_text==='法语备用测试词');
 assert(frenchRow,'French fallback is also shared');
 assert.equal(frenchRow.source_language,'fr','French is not mislabeled as Swahili');
 console.log('PASS: 0.9.42 complete local add -> translation -> Supabase POST -> shared list, plus Latin-only guard and French fallback.');
})().catch(error=>{console.error(error);process.exitCode=1;});
