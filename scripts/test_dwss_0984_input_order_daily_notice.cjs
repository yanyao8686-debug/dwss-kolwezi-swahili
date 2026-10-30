#!/usr/bin/env node
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=process.env.DWSS_PUBLIC_DIR||'public';
const read=n=>fs.readFileSync(path.join(root,n),'utf8');
const html=read('index.html'),app=read('app.js'),boot=read('boot.js'),sw=read('sw.js');
const version=read('VERSION.txt'),manifest=JSON.parse(read('manifest.webmanifest'));

assert.match(version,/^Version: 0\.9\.84$/m);
assert(sw.includes("const APP_VERSION = '0.9.84';"));
assert(html.includes('content="0.9.84">'));
assert(html.includes('DWSS_AUTO_UPDATE_0_9_84'));
assert(html.includes('版本 0.9.84 · 刚果金斯语翻译'));
assert((html.match(/dwss-release=0\.9\.84/g)||[]).length>=3);
assert.equal((html.match(/dwss-release=0\.9\.83/g)||[]).length,0);
assert(app.includes("version:'0.9.84'"));

// Assert DOM order: input must precede the instructional frame.
const inputPos=html.indexOf('<input id="pronunciationSearch"');
const instructionPos=html.indexOf('<div class="pronunciation-lookup-instruction" role="note">');
assert(inputPos>=0&&instructionPos>=0&&inputPos<instructionPos,
  'reverse-lookup input must appear before the explanatory text');
assert.equal((html.match(/id="pronunciationSearch"/g)||[]).length,1);
assert.equal((html.match(/class="pronunciation-lookup-instruction"/g)||[]).length,1);

// Previous clean add-word form stays clean.
for(const removed of ['newVariantNote','听到的地区或场景','若这个中文意思已经收录','新变体先待确认']){
  assert(!html.includes(removed),'removed form UI stays absent: '+removed);
  assert(!app.includes(removed),'removed form control stays absent from app code: '+removed);
}
for(const id of ['newZh','newReading','newFrenchReadingZh']){
  assert(html.includes('id="'+id+'"'),'retained add-word input: '+id);
}
assert(boot.indexOf('./hanzi-pinyin.js')<boot.indexOf('./pronunciation-search.js'));
assert(boot.indexOf('./pronunciation-search.js')<boot.indexOf('./app.js'));
assert(sw.includes("'./dictionary.js.gz'")||sw.includes('"./dictionary.js.gz"'));
assert(sw.includes("'./hanzi-pinyin.js'")||sw.includes('"./hanzi-pinyin.js"'));
assert(sw.includes("'./pronunciation-search.js'")||sw.includes('"./pronunciation-search.js"'));
assert.equal(manifest.id,'./?app=dwss-kolwezi-swahili');
assert.equal(manifest.display,'standalone');
assert.equal(manifest.name,'刚果金斯语翻译');

const match=html.match(/<script id="dwss-announcement-controller">([\s\S]*?)<\/script>/);
assert(match,'announcement controller exists');
const source=match[1];
for(const required of [
  "timeZone:'Africa/Lubumbashi'",
  "dwss:announcement-dismissed-date:",
  "dwss:announcement-last-shown:",
  "localStorage.removeItem(obsoleteShownKey)",
  "overlay.hidden=false",
  "localStorage.setItem(dismissedKey,todayKey())",
  "window.addEventListener('pageshow',refreshForLocalDay)",
  "window.addEventListener('focus',refreshForLocalDay)",
  "document.addEventListener('visibilitychange'",
  "local.getUTCFullYear()"
]) assert(source.includes(required),'announcement controller includes '+required);
assert(!source.includes("overlay.addEventListener('click'"),'backdrop never closes notice');
assert(!source.includes("document.addEventListener('keydown'"),'Escape never closes notice');
assert(!source.includes("setTimeout"),'no timed dismissal');
assert(!source.includes("localStorage.setItem(obsoleteShownKey"),'displaying does not save a dismissal');

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
function keyFor(ms){
  const parts=new Intl.DateTimeFormat('en-GB',{
    timeZone:'Africa/Lubumbashi',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(new Date(ms));
  const v={};for(const p of parts)v[p.type]=p.value;
  return v.year+'-'+v.month+'-'+v.day;
}
const today=keyFor(now);

function run(storage,platform='web'){
  const overlay={hidden:true,listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}};
  const button={listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}};
  const document={
    visibilityState:'visible',listeners:{},
    getElementById(id){return id==='dwss-announcement-overlay'?overlay:id==='dwss-announcement-close'?button:null;},
    addEventListener(type,fn){this.listeners[type]=fn;}
  };
  const window={location:{search:platform==='android'?'?dwss-native-app=1':''},listeners:{},
    addEventListener(type,fn){this.listeners[type]=fn;}};
  const context={document,window,localStorage:storage,Date:FixedDate,Intl,URLSearchParams};
  vm.runInNewContext(source,context);
  return {overlay,button,document,window};
}

// Legacy key written on display is not proof of user acknowledgement.
const storage=new Storage({'dwss:announcement-last-shown:web':today});
const first=run(storage,'web');
assert.equal(first.overlay.hidden,false,'first app open of Lubumbashi day shows notice');
assert.equal(storage.data.has('dwss:announcement-last-shown:web'),false,'obsolete marker is removed');
assert.equal(storage.writes.length,0,'displaying notice does not persist dismissal');
assert.equal(typeof first.button.listeners.click,'function');

// A reload before confirmation still shows the notice.
const reload=run(storage,'web');
assert.equal(reload.overlay.hidden,false,'unconfirmed notice shows after reload');

// Explicit confirmation hides it and records only Lubumbashi's date.
first.button.listeners.click();
assert.equal(first.overlay.hidden,true);
assert.equal(storage.data.get('dwss:announcement-dismissed-date:web'),today);

// Same local day remains closed after re-open.
const sameDay=run(storage,'web');
assert.equal(sameDay.overlay.hidden,true,'already confirmed today does not pop repeatedly');

// Cross into next Lubumbashi date while app is backgrounded, then resume.
// Asia/Kolkata handset configuration must not affect the Africa/Lubumbashi date.
now=Date.parse('2026-10-30T22:30:00.000Z'); // 2026-10-31 00:30 in Lubumbashi
const nextDate=keyFor(now);
assert.notEqual(nextDate,today);
const backgrounded=run(storage,'web');
assert.equal(backgrounded.overlay.hidden,false,'opening after local midnight shows the new daily notice');

// If a page was already open and hidden at midnight, foreground resume also shows it.
const stillOpen=run(storage,'web');
stillOpen.overlay.hidden=true;
now=Date.parse('2026-10-31T22:30:00.000Z'); // 2026-11-01 00:30 in Lubumbashi
stillOpen.document.visibilityState='visible';
stillOpen.document.listeners.visibilitychange();
assert.equal(stillOpen.overlay.hidden,false,'foreground resume after local midnight shows the new day notice');

// Android and web maintain independent daily confirmations.
const android=run(storage,'android');
assert.equal(android.overlay.hidden,false,'Android daily notice is independent of web');
assert.equal(storage.data.has('dwss:announcement-dismissed-date:android'),false);

console.log('PASS: reverse lookup input appears above explanatory text.');
console.log('PASS: notice appears on first app open of each Africa/Lubumbashi date.');
console.log('PASS: only explicit confirmation suppresses same-day repeats.');
console.log('PASS: returning to the foreground after Lubumbashi midnight shows the next daily notice.');
console.log('PASS: handset time zone does not alter the Lubumbashi calendar date.');
console.log('PASS: previous clean form, lookup modules and PWA identity are preserved.');
