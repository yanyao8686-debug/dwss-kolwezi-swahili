#!/usr/bin/env node
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=process.env.DWSS_PUBLIC_DIR||'public';
const read=n=>fs.readFileSync(path.join(root,n),'utf8');
const html=read('index.html'),app=read('app.js'),boot=read('boot.js'),sw=read('sw.js');
const version=read('VERSION.txt'),manifest=JSON.parse(read('manifest.webmanifest'));

assert.match(version,/^Version: 0\.9\.82$/m);
assert(sw.includes("const APP_VERSION = '0.9.82';"));
assert(html.includes('content="0.9.82">'));
assert(html.includes('DWSS_AUTO_UPDATE_0_9_82'));
assert(html.includes('版本 0.9.82 · 刚果金斯语翻译'));
assert((html.match(/dwss-release=0\.9\.82/g)||[]).length>=3);
assert.equal((html.match(/dwss-release=0\.9\.81/g)||[]).length,0);
assert(app.includes("version:'0.9.82'"));

class CompactFormAudit{
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
const tags=/<\/?([a-zA-Z][\w:-]*)([^>]*)>/g;
let token;
while((token=tags.exec(html))){
  const closing=token[0].startsWith('</'),tag=token[1].toLowerCase();
  if(closing){audit.end(tag);continue;}
  const attrs=[],pattern=/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let a;while((a=pattern.exec(token[2])))attrs.push([a[1],a[2]??a[3]??a[4]??'']);
  audit.start(tag,attrs);
}
assert.deepEqual(audit.inputs,['newZh','newReading','newFrenchReadingZh']);

for(const phrase of ['newVariantNote','听到的地区或场景','科卢韦齐市区常见说法','若这个中文意思已经收录','新变体先待确认','.field-hint{']){
  assert(!html.includes(phrase),'removed UI absent from HTML: '+phrase);
}
assert(!app.includes('newVariantNote'));
assert(app.includes("variantNote:''"));
assert(app.includes('submitPronunciationVariant'));
assert(app.includes("source_note:d.variantNote||''"));
assert(app.includes('另一种科卢韦齐当地发音提交？'));
assert(app.includes('当前标记为“待确认”'));

assert(boot.indexOf('./hanzi-pinyin.js')<boot.indexOf('./pronunciation-search.js'));
assert(boot.indexOf('./pronunciation-search.js')<boot.indexOf('./app.js'));
assert(sw.includes("'./dictionary.js.gz'")||sw.includes('"./dictionary.js.gz"'));
assert(sw.includes("'./hanzi-pinyin.js'")||sw.includes('"./hanzi-pinyin.js"'));
assert(sw.includes("'./pronunciation-search.js'")||sw.includes('"./pronunciation-search.js"'));
assert.equal(manifest.id,'./?app=dwss-kolwezi-swahili');
assert.equal(manifest.display,'standalone');
assert.equal(manifest.name,'刚果金斯语翻译');

console.log('PASS: red-circled note and region/context input are removed.');
console.log('PASS: exactly three intended add-word fields remain.');
console.log('PASS: pending pronunciation-variant confirmation and shared submission are preserved.');
console.log('PASS: 0.9.82 cache and PWA identity are valid.');
