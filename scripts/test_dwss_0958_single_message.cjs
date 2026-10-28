'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const root = process.env.DWSS_TEST_ROOT || 'public';
const read = name => fs.readFileSync(root + '/' + name, 'utf8');
const app = read('app.js'), html = read('index.html'), sw = read('sw.js'), version = read('VERSION.txt');
assert(html.includes('content="0.9.58"><!-- DWSS_AUTO_UPDATE_0_9_58 -->'));
assert(html.includes('版本 0.9.58 · DWSS 智能翻译 PWA'));
assert(sw.includes("const APP_VERSION = '0.9.58';"));
assert(version.includes('Version: 0.9.58'));
assert(!html.includes('shareSyncSummary'));
assert(!app.includes('shareSyncSummary'));
assert(!app.includes('SHARE_STATUS_LABELS'));
assert(html.includes('<div class="compact-sync-status" id="sharedSyncActions" hidden>'));
assert(html.includes('id="retrySharedSync"'));
assert(app.includes("if(d.message)setMessage(d.message,d.type||'ok');"));
assert(app.includes("retry.hidden=!['failed','queued'].includes(String(d.status||''));"));
assert(app.includes('if(actions)actions.hidden=retry.hidden;'));
assert(app.includes("function setMessage(s,type){$('maintenanceMessage').textContent=s;"));
assert(app.includes("window.addEventListener('dwss:personal-share-status',e=>{"));

const maintenanceMessage={textContent:'',className:''};
const retry={hidden:true},actions={hidden:true};
const els={maintenanceMessage,retrySharedSync:retry,sharedSyncActions:actions};
const listeners={};
const ctx={
 $:id=>els[id],
 setMessage:(s,type)=>{maintenanceMessage.textContent=s;maintenanceMessage.className=type||'';},
 renderCustomList(){},
 window:{addEventListener:(name,fn)=>listeners[name]=fn}
};
const start=app.indexOf("window.addEventListener('dwss:personal-share-status',e=>{");
const end=app.indexOf("\n});",start)+4;
assert(start>=0&&end>start);
vm.runInNewContext(app.slice(start,end),ctx);
listeners['dwss:personal-share-status']({detail:{status:'synced',message:'新词已保存，并已自动同步到共享词库。',type:'ok'}});
assert.equal(maintenanceMessage.textContent,'新词已保存，并已自动同步到共享词库。');
assert.equal(retry.hidden,true);
assert.equal(actions.hidden,true);
listeners['dwss:personal-share-status']({detail:{status:'queued',message:'新词已保存在本机，等待联网同步。',type:'offline'}});
assert.equal(maintenanceMessage.textContent,'新词已保存在本机，等待联网同步。');
assert.equal(retry.hidden,false);
assert.equal(actions.hidden,false);
listeners['dwss:personal-share-status']({detail:{status:'failed',message:'共享提交失败，请重试。',type:'error'}});
assert.equal(maintenanceMessage.textContent,'共享提交失败，请重试。');
assert.equal(retry.hidden,false);
assert.equal(actions.hidden,false);
console.log('PASS: only one save/sync sentence is displayed.');
console.log('PASS: retry action appears only for queued/failed states.');
console.log('PASS: 0.9.58 PWA cache marker and version metadata are aligned.');
