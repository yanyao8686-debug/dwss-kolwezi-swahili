#!/usr/bin/env node
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {parse}=require('node:util');

const root=process.env.DWSS_PUBLIC_DIR||'public';
const read=n=>fs.readFileSync(path.join(root,n),'utf8');
const html=read('index.html');
const app=read('app.js');
const sw=read('sw.js');
const boot=read('boot.js');
const version=read('VERSION.txt');
const manifest=JSON.parse(read('manifest.webmanifest'));

assert.match(version,/^Version: 0\.9\.81$/m);
assert(sw.includes("const APP_VERSION = '0.9.81';"));
assert(html.includes('content="0.9.81">'));
assert(html.includes('DWSS_AUTO_UPDATE_0_9_81'));
assert(html.includes('版本 0.9.81 · 刚果金斯语翻译'));
assert((html.match(/dwss-release=0\.9\.81/g)||[]).length>=3);
assert.equal((html.match(/dwss-release=0\.9\.80/g)||[]).length,0);
assert(app.includes("version:'0.9.81'"));

class CompactFormAudit {
  constructor(){this.depth=0;this.active=false;this.inputs=[];}
  start(tag,attrs){
    attrs=Object.fromEntries(attrs);
    if(tag==='div'){
      const classes=(attrs.class||'').split(/\s+/);
      if(!this.active&&classes.includes('compact-add-form')){this.active=true;this.depth=1;}
      else if(this.active)this.depth++;
    }
    if(this.active&&tag==='input'&&attrs.id)this.inputs.push(attrs.id);
  }
  end(tag){
    if(this.active&&tag==='div'){this.depth--;if(this.depth===0)this.active=false;}
  }
}
const audit=new CompactFormAudit();
const tokenRe=/<\/?([a-zA-Z][\w:-]*)([^>]*)>/g;
let m;
while((m=tokenRe.exec(html))){
  const closing=m[0].startsWith('</');
  const tag=m[1].toLowerCase();
  if(closing){audit.end(tag);continue;}
  const attrs=[];
  const re=/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let a;
  while((a=re.exec(m[2])))attrs.push([a[1],a[2]??a[3]??a[4]??'']);
  audit.start(tag,attrs);
}
assert.deepEqual(audit.inputs,['newZh','newReading','newFrenchReadingZh'],
  'add-word form retains only Chinese meaning, local pronunciation and French pronunciation');

const removed=[
  '若这个中文意思已经收录',
  '保存时会询问是否新增读法变体',
  '不会覆盖原读音',
  '新变体先待确认',
  '听到的地区或场景',
  '科卢韦齐市区常见说法'
];
for(const phrase of removed){
  assert(!html.includes(phrase),'removed notice/context phrase absent from HTML: '+phrase);
  assert(!app.includes(phrase),'removed notice/context phrase absent from app code: '+phrase);
}
assert(boot.indexOf('./hanzi-pinyin.js')<boot.indexOf('./pronunciation-search.js'));
assert(boot.indexOf('./pronunciation-search.js')<boot.indexOf('./app.js'));
assert(sw.includes("'./dictionary.js.gz'")||sw.includes('"./dictionary.js.gz"'));
assert(sw.includes("'./hanzi-pinyin.js'")||sw.includes('"./hanzi-pinyin.js"'));
assert(sw.includes("'./pronunciation-search.js'")||sw.includes('"./pronunciation-search.js"'));
assert.equal(manifest.id,'./?app=dwss-kolwezi-swahili');
assert.equal(manifest.display,'standalone');
assert.equal(manifest.name,'刚果金斯语翻译');

console.log('PASS: 0.9.81 add-word form has exactly the three intended inputs.');
console.log('PASS: the red-circled explanation and region/context field are absent.');
console.log('PASS: local pronunciation, French pronunciation, saving and PWA assets remain wired.');
