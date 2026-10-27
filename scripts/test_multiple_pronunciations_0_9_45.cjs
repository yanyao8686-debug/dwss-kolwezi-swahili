'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib');
const root=path.join(process.cwd(),'public'),read=n=>fs.readFileSync(path.join(root,n),'utf8');
class ClassList{add(){}remove(){}toggle(){}contains(){return false;}}
class El{constructor(id=''){this.id=id;this.value='';this.textContent='';this.innerHTML='';this.hidden=false;this.dataset={};this.style={};this.classList=new ClassList();this.handlers={};this.options=[];}addEventListener(t,f){(this.handlers[t]||=[]).push(f);}querySelectorAll(){return [];}appendChild(){return{};}prepend(){}reset(){this.value='';}focus(){}select(){}remove(){}insertAdjacentHTML(){}click(){(this.handlers.click||[]).forEach(f=>f());}dispatchEvent(){return true;}}
function bootUser(seed=[]){
 const ids=[...read('index.html').matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]),els=new Map(ids.map(id=>[id,new El(id)])),get=id=>{if(!els.has(id))els.set(id,new El(id));return els.get(id);};
 const storage=new Map();if(seed.length)storage.set('sw_custom_dictionary_v1',JSON.stringify(seed));
 const localStorage={getItem:k=>storage.has(k)?storage.get(k):null,setItem(k,v){storage.set(k,String(v));},removeItem(k){storage.delete(k);}};
 const events={};const window={SW_DB:[],SW_FRENCH:{},SW_FRENCH_READINGS:{},addEventListener(t,f){(events[t]||=[]).push(f);},dispatchEvent(e){(events[e.type]||[]).forEach(f=>f(e));return true;},confirm(){return false;},scrollTo(){}};
 class Ev{constructor(type,o={}){this.type=type;Object.assign(this,o);}}
 const document={body:new El('body'),readyState:'complete',getElementById:get,querySelectorAll(){return[];},createElement(t){return new El(t);},execCommand(){return true;}};
 const context={window,document,localStorage,navigator:{clipboard:{writeText:async()=>{}}},location:{hash:''},CustomEvent:Ev,Event:Ev,console,setTimeout(){return 1;},clearTimeout(){},Date,Math,JSON,Map,Set,Array,Object,String,Number,RegExp,Error,Promise,Intl,parseInt,parseFloat};
 vm.createContext(context);vm.runInContext(zlib.gunzipSync(fs.readFileSync(path.join(root,'dictionary.js.gz'))).toString('utf8'),context);vm.runInContext(read('french-fallback.js'),context);vm.runInContext(read('app.js'),context);
 return {api:window.KolweziSwahili,window};
}
const sep='　｜　';
const a=bootUser();
assert.equal(a.api.translate('这个').segments.find(s=>s.type==='local').reading,'撒');
assert.equal(a.api.addCustom({zh:'这个',reading:'以C'}).ok,true);
let out=a.api.translate('这个').segments.find(s=>s.type==='local');
assert.equal(out.reading,'以C'+sep+'撒','personal and original pronunciations appear together');
assert.deepEqual(Array.from(out.variants,v=>v.origin),['personal','builtin']);
a.window.dispatchEvent(new (class{constructor(){this.type='dwss:shared-terms-updated';this.detail={terms:[{id:'one',source_language:'sw',chinese_text:'这个',local_pronunciation_cn:'以C',category:'其他'},{id:'two',source_language:'sw',chinese_text:'这个',local_pronunciation_cn:'伊西',category:'其他'}]};}})());
out=a.api.translate('这个').segments.find(s=>s.type==='local');
assert.equal(out.reading,'以C'+sep+'伊西'+sep+'撒','shared and original readings join personal');
assert.equal(out.variants.length,3,'three distinct readings are preserved');
const second='这位';
assert(a.api.translate(second).segments.find(s=>s.type==='local').reading.includes('古吾苏'));
assert.equal(a.api.addCustom({zh:second,reading:'另一条核验读音'}).ok,true);
out=a.api.translate(second).segments.find(s=>s.type==='local');
assert(out.reading.includes('另一条核验读音')&&out.reading.includes('古吾苏')&&out.reading.includes(sep),'other headwords use the same generic rule');
const b=bootUser();
b.window.dispatchEvent(new (class{constructor(){this.type='dwss:shared-terms-updated';this.detail={terms:[{id:'cloud-b',source_language:'sw',chinese_text:'这个',local_pronunciation_cn:'以C',category:'其他'}]};}})());
out=b.api.translate('这个').segments.find(s=>s.type==='local');
assert.equal(out.reading,'以C'+sep+'撒','another user sees cloud plus built-in pronunciations');
assert.equal(b.api.customCount,0,'no personal copy is needed on the other device');
console.log('PASS 0.9.45 multi-pronunciation regression.');
