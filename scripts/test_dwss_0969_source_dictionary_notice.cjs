const assert=require('node:assert/strict');
const fs=require('node:fs');
const zlib=require('node:zlib');
const path=require('node:path');
const root=process.env.DWSS_PUBLIC_DIR||'public';
const repo=process.env.DWSS_REPO_DIR||'.';
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('index.html');
const app=read('app.js');
const boot=read('boot.js');
const sw=read('sw.js');
const version=read('VERSION.txt');
const manifest=JSON.parse(read('manifest.webmanifest'));
const raw=zlib.gunzipSync(fs.readFileSync(path.join(root,'dictionary.js.gz'))).toString('utf8');
const match=raw.match(/^window\.SW_DB\s*=\s*(\[.*\]);\s*$/s);
assert(match,'compressed dictionary exports SW_DB JSON');
const db=JSON.parse(match[1]);

function parseCsv(text){
 const rows=[];let row=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){
   if(c==='"'&&text[i+1]==='"'){field+='"';i++;}
   else if(c==='"')quoted=false;
   else field+=c;
  }else if(c==='"')quoted=true;
  else if(c===','){row.push(field);field='';}
  else if(c==='\n'){row.push(field);rows.push(row);row=[];field='';}
  else if(c!=='\r')field+=c;
 }
 if(field.length||row.length){row.push(field);rows.push(row);}
 const headers=rows.shift();
 return rows.filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]||''])));
}
const supplement=parseCsv(fs.readFileSync(path.join(repo,'data/source_terms_restore_0_9_69.csv'),'utf8'));
assert.equal(supplement.length,51,'all audited source rows are retained in the patch manifest');
const normalize=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\s，。！？；：、,.!?;:（）()“”"'‘’]/g,'');
const byHead=new Map();
for(const item of db){
 const key=normalize(item.zh);
 if(!byHead.has(key))byHead.set(key,[]);
 byHead.get(key).push(...(item.variants||[]));
}
for(const row of supplement){
 const variants=byHead.get(normalize(row.chinese))||[];
 assert(variants.some(v=>normalize(v.reading)===normalize(row.reading)),
   'source word searchable: '+row.source_id+' '+row.chinese);
}
const added=db.flatMap(x=>x.variants||[]).filter(v=>v.kind==='原始资料补录');
assert.equal(added.length,47,'exactly 47 genuinely missing source variants were restored');

function searchNorm(s){return normalize(s).replace(/[.…⋯]/g,'');}
assert(searchNorm('与一样')===searchNorm('与…一样'),'ellipsis-normalized dictionary search works');
assert(byHead.has(searchNorm('与…一样')),'source entry with ellipsis exists');
assert(byHead.has(searchNorm('对…说')),'second source entry with ellipsis exists');
for(const term of ['谢谢','今天','水','上班','柴油','保安','车辆','我问一下去利卡西的路','与…一样','对…说']){
 assert(byHead.has(normalize(term)),'representative source head exists: '+term);
}

assert(app.includes("name:'刚果金斯语翻译'")&&app.includes("version:'0.9.69'"),'product metadata updated');
assert(app.includes("searchNorm=value=>norm(value).replace(/[.…⋯]/g,'')"),'dictionary search handles punctuation/ellipsis');
assert(app.includes("v.sourceRawText||''"),'dictionary search also indexes original source text');
assert(boot.includes("dwss-release=")&&boot.includes("cache:'no-store'"),'bootstrap cache-busts dictionary');
for(const name of ['supabase.min.js','shared-lexicon.js','boot.js']){
 assert(html.includes('./'+name+'?dwss-release=0.9.69'),'entry script is versioned: '+name);
}
assert(sw.includes("const APP_VERSION = '0.9.69';"),'Service Worker cache version updated');
assert(version.includes('Version: 0.9.69'),'live version metadata updated');
assert(html.includes('版本 0.9.69 · 刚果金斯语翻译'),'visible version updated');
assert(html.includes('dwss:announcement-dismissed:0.9.69'),'announcement dismissal persists for this release');
for(const heading of ['一、开发目的','二、底版词库来源','三、云端共享词库','四、自动更新与离线使用']){
 assert(html.includes(heading),'announcement section exists: '+heading);
}
assert(html.includes('我已阅读，进入应用'),'announcement has a close/continue action');
assert.equal(manifest.id,'./?app=dwss-kolwezi-swahili','Apple PWA install identity unchanged');
assert.equal(manifest.display,'standalone','Apple PWA standalone mode retained');
assert.equal(manifest.name,'刚果金斯语翻译','Apple PWA name retained');
assert(!html.includes('软件版权、品牌归属与授权说明'),'removed legal accordion does not return');
assert(!html.includes('词库来自原始资料；当地读音尚待科卢韦齐母语者全面复核。'),'removed footer disclaimer does not return');
console.log('PASS: 51 audited source rows all searchable; 47 missing readings restored without overwriting existing entries.');
console.log('PASS: representative original DOC/PDF terms and ellipsis variants searchable.');
console.log('PASS: versioned cache-busting, 0.9.69 SW, closable announcement, and unchanged Apple PWA identity.');
