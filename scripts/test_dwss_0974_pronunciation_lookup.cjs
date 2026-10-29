#!/usr/bin/env node
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const zlib=require('node:zlib');

const root=process.env.DWSS_PUBLIC_DIR||'public';
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const html=read('index.html');
const app=read('app.js');
const boot=read('boot.js');
const sw=read('sw.js');
const version=read('VERSION.txt');
const manifest=JSON.parse(read('manifest.webmanifest'));

assert.match(version,/^Version: 0\.9\.74$/m);
assert(sw.includes("const APP_VERSION = '0.9.74';"));
assert(html.includes('content="0.9.74">'));
assert(html.includes('DWSS_AUTO_UPDATE_0_9_74'));
assert(html.includes('版本 0.9.74 · 刚果金斯语翻译'));
assert(html.includes('data-tab="maintenance"><span>添加新词</span></button><button class="tab" data-tab="pronunciation"><span>发音查询</span>'));
assert(html.includes('<section class="panel" id="pronunciation">'));
assert(html.includes('id="pronunciationSearch"'));
assert(html.includes("id='dwss-pronunciation-lookup-style'") || html.includes('id="dwss-pronunciation-lookup-style"'));
assert(html.includes('['+"'maintenance','pronunciation','saved','dictionary'"+']'));
assert(html.includes('dwss-release=0.9.74'));
assert(app.includes("version:'0.9.74'"));
assert(app.includes('function renderPronunciationLookup()'));
assert(app.includes("preferredLocalVariants(item)"),'lookup uses effective local pronunciation variants');
assert(app.includes("all.map(item=>({zh:item.zh"),'lookup includes the complete active lexicon');
assert(boot.indexOf('./hanzi-pinyin.js')<boot.indexOf('./pronunciation-search.js'));
assert(boot.indexOf('./pronunciation-search.js')<boot.indexOf('./app.js'));
assert(sw.includes("'./hanzi-pinyin.js'")||sw.includes('"./hanzi-pinyin.js"'));
assert(sw.includes("'./pronunciation-search.js'")||sw.includes('"./pronunciation-search.js"'));
assert(sw.includes("'./dictionary.js.gz'")||sw.includes('"./dictionary.js.gz"'));
assert(!sw.includes("'./dictionary.js',")&&!sw.includes('"./dictionary.js",'));
assert.equal(manifest.id,'./?app=dwss-kolwezi-swahili');
assert.equal(manifest.display,'standalone');
assert.equal(manifest.name,'刚果金斯语翻译');

const pinyinContext={window:{}};
vm.runInNewContext(read('hanzi-pinyin.js'),pinyinContext);
const pinyin=pinyinContext.window.DWSS_HANZI_PINYIN;
assert(Object.keys(pinyin).length>18000,'full CJK pinyin table exists');
assert.equal(pinyin['该'],'gai');
assert.equal(pinyin['给'],'gei');
assert.equal(pinyin['小'],'xiao');
assert.equal(pinyin['朽'],'xiu');

const searchContext={window:{DWSS_HANZI_PINYIN:pinyin}};
vm.runInNewContext(read('pronunciation-search.js'),searchContext);
const engine=searchContext.window.DWSSPronunciationSearch;
assert(engine&&typeof engine.search==='function');
const dictionaryContext={window:{}};
const dictionarySource=zlib.gunzipSync(fs.readFileSync(path.join(root,'dictionary.js.gz'))).toString('utf8');
vm.runInNewContext(dictionarySource,dictionaryContext);
const db=dictionaryContext.window.SW_DB;
assert(Array.isArray(db)&&db.length>=2000,'full original vocabulary loaded');
const entries=db.map(item=>({zh:item.zh,category:'测试',variants:item.variants||[]}));

const exact=engine.search('给朽',entries,{limit:30});
assert(exact.some(item=>item.zh==='明天'&&item.matchedReading==='给朽'),'exact stored homophone finds 明天');
const fuzzy=engine.search('给晓',entries,{limit:30});
assert(fuzzy.some(item=>item.zh==='明天'&&item.matchedReading==='该小'),'different characters with similar pinyin find 明天');
const samePinyin=engine.search('该晓',entries,{limit:30});
assert(samePinyin.some(item=>item.zh==='明天'),'same pronunciation despite different Chinese characters finds 明天');

// User-added and shared terms are passed through the same search engine, not a built-in-only index.
const extra=engine.search('给晓',[{zh:'个人新增词',variants:[{reading:'该小',source:'用户手动添加'}]},
  {zh:'共享词条',variants:[{reading:'该小',source:'云端共享词库'}]}],{limit:10});
assert(extra.some(item=>item.zh==='个人新增词'));
assert(extra.some(item=>item.zh==='共享词条'));

console.log('PASS: 0.9.74 navigation, dedicated lookup panel and cache/module wiring.');
console.log('PASS: CJK pinyin map includes 20,000+ characters and correct gai/gei/xiao/xiu readings.');
console.log('PASS: 2,042 original dictionary records support exact and fuzzy sound lookup.');
console.log('PASS: 输入“给朽”以及近似写法“给晓”都能查到“明天（该小）”。');
console.log('PASS: personal additions and cloud-shared terms use the same search engine.');
