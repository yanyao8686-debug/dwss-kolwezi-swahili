'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),zlib=require('node:zlib');
const root='public',read=n=>fs.readFileSync(root+'/'+n,'utf8');
class CL{add(){}remove(){}toggle(){}contains(){return false;}}
class El{constructor(id=''){this.id=id;this.value='';this.textContent='';this._html='';this.hidden=false;this.dataset={};this.style={};this.className='';this.classList=new CL();this.handlers={};this.disabled=false;}
 set innerHTML(v){this._html=v;}get innerHTML(){return this._html;}
 addEventListener(t,f){(this.handlers[t]??=[]).push(f);}querySelectorAll(){return [];}querySelector(){return new El('submit');}
 appendChild(x){return x;}prepend(){}focus(){}select(){}remove(){}insertAdjacentHTML(){}
 reset(){for(const id of ['newZh','newReading','newLatin','newFrench','newFrenchReadingZh','newNote'])elements.get(id).value='';}}
const ids=[...read('index.html').matchAll(/\\bid="([^"]+)"/g)].map(x=>x[1]),elements=new Map(ids.map(id=>[id,new El(id)]));
const get=id=>{if(!elements.has(id))elements.set(id,new El(id));return elements.get(id);};
const store=new Map(),localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem(k,v){store.set(k,String(v));},removeItem(k){store.delete(k);}};
const we={},de={},remote=[],posts=[];
const win={SW_DB:[],SW_FRENCH:{},SW_FRENCH_READINGS:{},__remote:remote,__posts:posts,addEventListener(t,f){(we[t]??=[]).push(f);},dispatchEvent(e){for(const f of we[e.type]||[])f(e);return true;},confirm(){return true;},scrollTo(){},setTimeout,clearTimeout,crypto:{randomUUID:()=>'11111111-1111-4111-8111-111111111111'}};
class Ev{constructor(type,opts={}){this.type=type;Object.assign(this,opts);}}
const doc={readyState:'loading',body:new El('body'),head:new El('head'),getElementById:get,querySelectorAll(){return [];},createElement(t){return new El(t);},execCommand(){return true;},addEventListener(t,f){(de[t]??=[]).push(f);}};
class Q{constructor(){this.op='select';this.payload=null;this.k=null;this.v=null;}select(){return this;}order(){return this;}range(a,b){return Promise.resolve({data:remote.slice(a,b+1),count:remote.length,error:null});}insert(p){this.op='insert';this.payload=p;return this;}single(){if(this.op==='insert'){posts.push(this.payload);const row={...this.payload,id:'cloud-'+(remote.length+1),created_at:new Date().toISOString()};remote.unshift(row);return Promise.resolve({data:row,error:null});}return Promise.resolve({data:remote[0]||null,error:null});}eq(k,v){this.k=k;this.v=v;return this;}then(ok,bad){return Promise.resolve({data:this.k?remote.filter(x=>x[this.k]===this.v):remote.slice(),error:null}).then(ok,bad);}}
const client={from(){return new Q();},channel(){return {on(){return this;},subscribe(cb){if(cb)cb('SUBSCRIBED');return this;}};}};
win.supabase={createClient(){return client;}};
const ctx={window:win,document:doc,localStorage,navigator:{onLine:true,clipboard:{writeText:async()=>{}}},location:{hash:''},CustomEvent:Ev,Event:Ev,console,setTimeout,clearTimeout,Date,Math,JSON,Map,Set,Array,Object,String,Number,RegExp,Error,Promise,Intl,parseInt,parseFloat,URL,Blob,crypto:win.crypto};
vm.createContext(ctx);
vm.runInContext(zlib.gunzipSync(fs.readFileSync(root+'/dictionary.js.gz')).toString('utf8'),ctx);
vm.runInContext(read('french-fallback.js'),ctx);
vm.runInContext(read('app.js'),ctx);
const api=win.KolweziSwahili;assert(api&&api.dictCount>1000);
const submit=get('entryForm').handlers.submit[0];assert.equal(typeof submit,'function');
get('newZh').value='仅拼写测试词';get('newLatin').value='kagua';get('newReading').value='';get('newFrench').value='';
submit({preventDefault(){}});
assert.equal(api.customCount,0,'Latin-only Swahili form cannot silently save');
assert(get('maintenanceMessage').textContent.includes('只填拼写不能生成中文读音'),'clear validation guidance');
vm.runInContext(read('shared-lexicon.js'),ctx);
for(const fn of de.DOMContentLoaded||[])fn(new Ev('DOMContentLoaded'));
setTimeout(()=>{
 try{
  get('newZh').value='自动同步端到端测试词';get('newReading').value='科卢韦齐测试读音';get('newLatin').value='kagua-test';get('newFrench').value='';
  submit({preventDefault(){}});
  setTimeout(()=>{
   try{
    assert.equal(api.customCount,1);assert(api.exact('自动同步端到端测试词'));
    const translated=api.translate('自动同步端到端测试词');
    assert.equal(translated.segments[0].type,'local');assert.equal(translated.segments[0].reading,'科卢韦齐测试读音');
    assert.equal(posts.length,1);assert.equal(posts[0].source_language,'sw');assert.equal(posts[0].chinese_text,'自动同步端到端测试词');assert.equal(posts[0].local_pronunciation_cn,'科卢韦齐测试读音');
    assert.equal(api.getCustom()[0].shareSyncStatus,'synced');assert.equal(api.sharedCount,1);
    assert(read('sw.js').includes("const APP_VERSION = '0.9.42';"));
    console.log('PASS: personal form -> local save -> immediate translation -> shared insert -> shared index.');
   }catch(e){console.error(e.stack);process.exitCode=1;}
  },180);
 }catch(e){console.error(e.stack);process.exitCode=1;}
},80);
