'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const zlib = require('node:zlib');
const root = process.env.DWSS_TEST_ROOT || 'public';
class ClassList {
  constructor(){this.values=new Set();}
  add(v){this.values.add(v);}
  remove(v){this.values.delete(v);}
  toggle(v,force){if(force===undefined)force=!this.values.has(v);if(force)this.values.add(v);else this.values.delete(v);return force;}
  contains(v){return this.values.has(v);}
}
class Element {
  constructor(){this.value='';this.textContent='';this.innerHTML='';this.hidden=false;this.disabled=false;this.style={};this.dataset={};this.classList=new ClassList();this.handlers={};this.options=[];this.attributes={};this.open=false;}
  addEventListener(type,fn){(this.handlers[type] ||= []).push(fn);}
  fire(type,event={}){for(const fn of this.handlers[type]||[])fn(Object.assign({preventDefault(){},isComposing:false,currentTarget:this,target:this},event));}
  querySelectorAll(){return [];}
  querySelector(){return null;}
  appendChild(){}
  insertBefore(){}
  prepend(){}
  insertAdjacentHTML(){}
  reset(){}
  focus(){}
  select(){}
  remove(){}
  setAttribute(k,v){this.attributes[k]=v;}
  removeAttribute(k){delete this.attributes[k];}
  close(){this.open=false;}
}
const html=fs.readFileSync(root+'/index.html','utf8');
const elements=new Map();
const get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
for(const m of html.matchAll(/\bid="([^"]+)"/g))get(m[1]);
const listeners={};
const document={
  readyState:'complete',body:get('body'),head:get('head'),documentElement:get('html'),
  getElementById:get,querySelectorAll(){return [];},querySelector(){return null;},
  createElement(){return new Element();},
  addEventListener(type,fn){(listeners[type] ||= []).push(fn);},
  execCommand(){return true;}
};
const window={
  SW_DB:[],SW_FRENCH:{},SW_FRENCH_READINGS:{},
  crypto:{randomUUID:()=>'test'},
  addEventListener(type,fn){(listeners[type] ||= []).push(fn);},
  dispatchEvent(event){(listeners[event.type]||[]).forEach(fn=>fn(event));return true;},
  confirm(){return true;},scrollTo(){}
};
class CustomEvent {constructor(type,options={}){this.type=type;this.detail=options.detail||{};}}
class BrowserEvent {constructor(type){this.type=type;}}
const storage=new Map();
const localStorage={
  getItem(key){return storage.get(key)||null;},
  setItem(key,value){storage.set(key,String(value));},
  removeItem(key){storage.delete(key);}
};
const context={
  window,document,localStorage,
  navigator:{onLine:true,clipboard:{writeText:async()=>{}}},
  location:{hash:''},CustomEvent,Event:BrowserEvent,
  console,setTimeout,clearTimeout,Date,Math,JSON,Map,Set,Array,Object,String,
  Number,RegExp,Error,Promise,Intl,parseInt,parseFloat,URL,Blob,FormData
};
vm.createContext(context);
const dictionarySource=zlib.gunzipSync(fs.readFileSync(root+'/dictionary.js.gz')).toString('utf8');
vm.runInContext(dictionarySource,context,{filename:'dictionary.js'});
vm.runInContext(fs.readFileSync(root+'/app.js','utf8'),context,{filename:'app.js'});
assert(window.KolweziSwahili,'translation app initialized');
const segments=window.KolweziSwahili.translate('欢迎(请进来)').segments;
const result=segments.find(s=>s.type==='local');
assert(result,'built-in Chinese headword is matched');
assert.equal(result.reading,'噶里布 是:迪有','only the first preferred local pronunciation is emitted');
assert(!result.reading.includes('｜'),'alternative readings are not joined into the spoken result');
console.log('PASS: 0.9.54 translation runtime keeps the first preferred local reading for a multi-reading built-in headword.');
