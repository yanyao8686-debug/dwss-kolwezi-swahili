'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),zlib=require('node:zlib');
class CL{add(){}remove(){}toggle(){}}
class E{constructor(){this.value='';this.textContent='';this.innerHTML='';this.hidden=false;this.disabled=false;this.style={};this.dataset={};this.classList=new CL();this.handlers={};this.options=[];}addEventListener(t,f){(this.handlers[t]??=[]).push(f)}fire(t,e={}){for(const f of this.handlers[t]||[])f(Object.assign({preventDefault(){},isComposing:false},e))}querySelectorAll(){return []}querySelector(){return null}appendChild(){}insertBefore(){}prepend(){}insertAdjacentHTML(){}reset(){}focus(){}select(){}remove(){}setAttribute(){}}
const p='public',html=fs.readFileSync(p+'/index.html','utf8'),els=new Map(),get=id=>{if(!els.has(id))els.set(id,new E());return els.get(id)};
for(const m of html.matchAll(/\bid="([^"]+)"/g))get(m[1]);
const listeners={},document={readyState:'complete',body:get('body'),head:get('head'),getElementById:get,querySelectorAll(){return []},querySelector(){return null},createElement(){return new E()},addEventListener(t,f){(listeners[t]??=[]).push(f)},execCommand(){return true}};
const window={SW_DB:[],SW_FRENCH:{},SW_FRENCH_READINGS:{},crypto:{randomUUID:()=>'test'},addEventListener(t,f){(listeners[t]??=[]).push(f)},dispatchEvent(e){(listeners[e.type]||[]).forEach(f=>f(e))},confirm(){return true},scrollTo(){}};
class CE{constructor(type,o={}){this.type=type;this.detail=o.detail||{}}}class Ev{constructor(type){this.type=type}}
const store=new Map(),localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
const context={window,document,localStorage,navigator:{onLine:true,clipboard:{writeText:async()=>{}}},location:{hash:''},CustomEvent:CE,Event:Ev,console,setTimeout,clearTimeout,Date,Math,JSON,Map,Set,Array,Object,String,Number,RegExp,Error,Promise,Intl,parseInt,parseFloat,URL,Blob,FormData};
vm.createContext(context);vm.runInContext(zlib.gunzipSync(fs.readFileSync(p+'/dictionary.js.gz')).toString(),context);vm.runInContext(fs.readFileSync(p+'/app.js','utf8'),context);
const api=window.KolweziSwahili;assert(api);
const result=api.translate('欢迎(请进来)').segments.find(s=>s.type==='local');
assert.equal(result.reading,'噶里布 是:迪有');
assert(!result.reading.includes('｜'));
assert.match(html,/版本 0\.9\.51 · DWSS/);
assert.match(fs.readFileSync(p+'/sw.js','utf8'),/APP_VERSION = '0\.9\.51'/);
console.log('PASS: result shows only first Swahili homophone.');
