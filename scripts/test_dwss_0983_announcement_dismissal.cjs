#!/usr/bin/env node
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=process.env.DWSS_PUBLIC_DIR||'public';
const read=n=>fs.readFileSync(path.join(root,n),'utf8');
const html=read('index.html');
const app=read('app.js');
const sw=read('sw.js');
const version=read('VERSION.txt');
const manifest=JSON.parse(read('manifest.webmanifest'));

assert.match(version,/^Version: 0\.9\.83$/m);
assert(sw.includes("const APP_VERSION = '0.9.83';"));
assert(html.includes('content="0.9.83">'));
assert(html.includes('DWSS_AUTO_UPDATE_0_9_83'));
assert(html.includes('版本 0.9.83 · 刚果金斯语翻译'));
assert((html.match(/dwss-release=0\.9\.83/g)||[]).length>=3);
assert.equal((html.match(/dwss-release=0\.9\.82/g)||[]).length,0);
assert(app.includes("version:'0.9.83'"));

for(const removed of ['newVariantNote','听到的地区或场景','若这个中文意思已经收录','新变体先待确认']){
  assert(!html.includes(removed),'previously removed form UI must stay absent: '+removed);
  assert(!app.includes(removed),'previously removed field must not be referenced: '+removed);
}
for(const id of ['newZh','newReading','newFrenchReadingZh']){
  assert(html.includes('id="'+id+'"'),'intended field retained: '+id);
}
assert(html.includes('id="dwss-announcement-overlay"'));
assert(html.includes('id="dwss-announcement-close"'));

const controllerMatch=html.match(/<script id="dwss-announcement-controller">([\s\S]*?)<\/script>/);
assert(controllerMatch,'announcement controller exists');
const source=controllerMatch[1];
assert(source.includes("dwss:announcement-dismissed-date:"));
assert(source.includes("dwss:announcement-last-shown:"));
assert(source.includes("localStorage.removeItem(obsoleteShownKey)"));
assert(source.includes("overlay.hidden=(dismissedDate===todayKey())"));
assert(source.includes("localStorage.setItem(dismissedKey,todayKey())"));
assert(!source.includes("overlay.addEventListener('click'"));
assert(!source.includes("document.addEventListener('keydown'"));
assert(!source.includes("setTimeout"));
assert(!source.includes("localStorage.setItem(obsoleteShownKey"));

let now=Date.parse('2026-10-30T10:00:00.000Z');
class FixedDate extends Date{
  constructor(...args){super(...(args.length?args:[now]));}
  static now(){return now;}
}
class Storage{
  constructor(seed={}){this.data=new Map(Object.entries(seed));this.writes=[];}
  getItem(k){return this.data.has(k)?this.data.get(k):null;}
  setItem(k,v){this.writes.push([k,String(v)]);this.data.set(k,String(v));}
  removeItem(k){this.data.delete(k);}
}
function localDay(timestamp){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Lubumbashi',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(timestamp));
  const v={};for(const x of parts)v[x.type]=x.value;
  return v.year+'-'+v.month+'-'+v.day;
}
const today=localDay(now);

function runController(storage,platform='web'){
  const overlay={hidden:true,listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}};
  const button={listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}};
  const document={
    getElementById(id){return id==='dwss-announcement-overlay'?overlay:id==='dwss-announcement-close'?button:null;},
    listeners:{},
    addEventListener(type,fn){this.listeners[type]=fn;}
  };
  const context={
    document,localStorage:storage,Date:FixedDate,Intl,URLSearchParams,
    window:{location:{search:platform==='android'?'?dwss-native-app=1':''}}
  };
  vm.runInNewContext(source,context);
  return {overlay,button,document};
}

// Regression: the old implementation wrote today's last-shown date just by opening.
// Even with that stale key present, the new release must show the dialog again.
const storage=new Storage({'dwss:announcement-last-shown:web':today});
const first=runController(storage,'web');
assert.equal(first.overlay.hidden,false,'old last-shown value must not hide the announcement');
assert.equal(storage.data.has('dwss:announcement-last-shown:web'),false,'obsolete false-dismissal key is removed');
assert.equal(storage.writes.length,0,'opening the announcement must not write dismissal state');

// Backdrop and Escape are not close actions; no handler exists for either.
assert.equal(first.overlay.listeners.click,undefined);
assert.equal(first.document.listeners.keydown,undefined);
assert.equal(typeof first.button.listeners.click,'function');

// An automatic page reload before the close button is pressed must show it again.
const afterReload=runController(storage,'web');
assert.equal(afterReload.overlay.hidden,false,'reload without explicit close must keep the announcement visible');

// Only the explicit button records dismissal.
first.button.listeners.click();
assert.equal(first.overlay.hidden,true,'confirmation button closes the announcement');
assert.equal(storage.data.get('dwss:announcement-dismissed-date:web'),today,'button records the Lubumbashi date');

// Reload on the same Lubumbashi day stays closed because the user actually confirmed.
const sameDayReload=runController(storage,'web');
assert.equal(sameDayReload.overlay.hidden,true,'a confirmed notice stays closed for the same local day');

// On the next Lubumbashi date, the announcement is shown again and is not pre-marked.
now=Date.parse('2026-10-31T10:00:00.000Z');
const nextDay=runController(storage,'web');
assert.equal(nextDay.overlay.hidden,false,'announcement returns on the next local day');
assert.equal(storage.data.get('dwss:announcement-dismissed-date:web'),today,'displaying on a new day does not pre-write dismissal');

// Android and web retain separate dismissal state.
const android=runController(storage,'android');
assert.equal(android.overlay.hidden,false,'Android has an independent confirmation state');

assert.equal(manifest.id,'./?app=dwss-kolwezi-swahili');
assert.equal(manifest.display,'standalone');
assert.equal(manifest.name,'刚果金斯语翻译');

console.log('PASS: opening, reloads and automatic updates cannot mark the announcement dismissed.');
console.log('PASS: old last-shown state is discarded because it did not prove a user click.');
console.log('PASS: only the explicit confirmation button closes and persists the daily dismissal.');
console.log('PASS: the announcement returns on the next Africa/Lubumbashi day.');
console.log('PASS: web and Android dismissal states remain independent.');
console.log('PASS: clean 0.9.82 form, PWA identity, cache version and app metadata are preserved.');
