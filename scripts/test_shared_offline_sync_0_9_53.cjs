'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const root = process.env.DWSS_TEST_ROOT || 'public';
const source = fs.readFileSync(root + '/shared-lexicon.js', 'utf8');
class Element {
  constructor(tag='div') { this.tagName=tag; this.id=''; this.hidden=false; this.textContent=''; this.value=''; this.className=''; this.listeners={}; this.children=[]; this._html=''; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  dispatch(type, event={}) { for (const fn of this.listeners[type]||[]) fn(Object.assign({target:this,currentTarget:this,preventDefault(){}},event)); }
  appendChild(el) { this.children.push(el); if (el.id) elements.set(el.id,el); return el; }
  set innerHTML(v) { this._html=String(v); for (const m of this._html.matchAll(/\bid="([^"]+)"/g)) { if (!elements.has(m[1])) { const e=new Element(); e.id=m[1]; elements.set(m[1],e); } } }
  get innerHTML() { return this._html; }
}
const elements=new Map();
const body=new Element('body'), head=new Element('head');
const docEvents={};
const document={readyState:'complete',visibilityState:'visible',body,head,addEventListener(type,fn){(docEvents[type] ||= []).push(fn);},getElementById(id){return elements.get(id)||null;},createElement(tag){return new Element(tag)}};
const winEvents={};
const window={crypto:{randomUUID:()=> 'client-id-0001'},setTimeout,clearTimeout,addEventListener(type,fn){(winEvents[type] ||= []).push(fn);},dispatchEvent(evt){for(const fn of winEvents[evt.type]||[]) fn(evt);return true;}};
class CustomEvent { constructor(type,opts={}){this.type=type;this.detail=opts.detail||{};} }
const dataStore=new Map();
const localStorage={getItem(k){return dataStore.has(k)?dataStore.get(k):null;},setItem(k,v){dataStore.set(k,String(v));},removeItem(k){dataStore.delete(k);}};
let online=false; const navigator={get onLine(){return online;}};
const entry={id:'offline-entry-1',zh:'检查车辆',reading:'切克 查',latin:'kagua gari',category:'安保',shareSyncStatus:'pending'};
const custom=[entry];
window.KolweziSwahili={getCustom(){return custom;},setCustomShareStatus(id,status,submitId){const e=custom.find(x=>x.id===id);if(e){e.shareSyncStatus=status;e.sharedSubmitId=submitId;}}};
let cloudRows=[]; let inserts=0;
function clientFrom(table){
  const state={mode:'select',payload:null,filter:null};
  const q={
    select(){if(state.mode!=='insert') state.mode='select';return q;},
    order(){return q;},
    range(){return Promise.resolve({data:table==='shared_terms'?cloudRows.slice():[],count:cloudRows.length,error:null});},
    insert(payload){state.mode='insert';state.payload=payload;return q;},
    eq(col,val){state.filter={col,val};return q;},
    single(){
      if(state.mode==='insert'){
        const p=state.payload;
        const existing=cloudRows.find(x=>x.client_submit_id===p.client_submit_id);
        if(existing)return Promise.resolve({data:null,error:{code:'23505',message:'duplicate submit id'}});
        const row=Object.assign({id:'cloud-'+(++inserts),created_at:new Date().toISOString()},p);
        cloudRows.push(row);
        return Promise.resolve({data:row,error:null});
      }
      const row=cloudRows.find(x=>x[state.filter?.col]===state.filter?.val);
      return Promise.resolve(row?{data:row,error:null}:{data:null,error:{code:'PGRST116',message:'not found'}});
    }
  };
  return q;
}
window.supabase={createClient(){return {from:clientFrom,channel(){return {on(){return this;},subscribe(){return this;}}}};}};
const context={window,document,localStorage,navigator,CustomEvent,crypto:window.crypto,console,setTimeout,clearTimeout,Date,Math,JSON,Map,Set,Array,Object,String,Number,Promise,Error};
vm.runInNewContext(source,context,{filename:'shared-lexicon.js'});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  await delay(10);
  const queueKey='dwss_shared_terms_queue_v1';
  window.dispatchEvent(new CustomEvent('dwss:personal-term-added',{detail:{entry}}));
  await delay(20);
  let queue=JSON.parse(localStorage.getItem(queueKey)||'[]');
  assert.equal(queue.length,1,'offline word is put in queue');
  const submitId=queue[0].client_submit_id;
  assert.ok(submitId,'queue has idempotency key');
  assert.equal(entry.shareSyncStatus,'queued');
  window.dispatchEvent(new CustomEvent('dwss:personal-term-added',{detail:{entry}}));
  await delay(20);
  queue=JSON.parse(localStorage.getItem(queueKey)||'[]');
  assert.equal(queue.length,1,'repeated local event does not duplicate queue');
  assert.equal(queue[0].client_submit_id,submitId,'retry preserves idempotency key');
  online=true;
  window.dispatchEvent(new Event('online'));
  await delay(80);
  queue=JSON.parse(localStorage.getItem(queueKey)||'[]');
  assert.equal(queue.length,0,'queue clears after cloud accepts entry');
  assert.equal(cloudRows.length,1,'one row uploaded to cloud');
  assert.equal(cloudRows[0].client_submit_id,submitId);
  assert.equal(entry.shareSyncStatus,'synced','local status is marked synced');
  window.dispatchEvent(new Event('online'));
  await delay(40);
  assert.equal(cloudRows.length,1,'reconnect retry remains idempotent');
  console.log('PASS: offline queue persistence, stable idempotency key, duplicate queue suppression, automatic online upload, queue clearing, synced state, and duplicate-safe reconnect.');
})().catch(e=>{console.error(e);process.exitCode=1;});
