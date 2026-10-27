'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const shared = fs.readFileSync('public/shared-lexicon.js', 'utf8');
const helperMatch = shared.match(/function needsAutomaticShare\(entry\)\s*\{[\s\S]*?\n\}/);
assert(helperMatch, 'automatic-share eligibility helper exists');
const context = vm.createContext({});
vm.runInContext(helperMatch[0] + '\nglobalThis.__needsAutomaticShare = needsAutomaticShare;', context);
const shouldShare = context.__needsAutomaticShare;
const legacy16 = Array.from({length:16}, (_,i) => ({
  id:'legacy-'+i, zh:'个人旧词-'+i, reading:'当地读音-'+i
}));
assert(legacy16.every(shouldShare), 'all 16 legacy personal Swahili terms are eligible for automatic backfill');
assert(shouldShare({id:'new-user-term',zh:'新词',reading:'当地读音'}), 'new Swahili terms from any user are eligible without a pending marker');
assert(shouldShare({id:'offline-french',zh:'法语备用',french:'Bonjour',shareSyncStatus:'queued'}), 'explicitly queued French fallback remains shareable as French');
assert(!shouldShare({id:'french-only',zh:'法语词',french:'Bonjour'}), 'unmarked French-only legacy term is not relabelled or bulk-published');
assert(!shouldShare({id:'already-synced',zh:'已共享',reading:'读音',shareSyncStatus:'synced'}), 'already-synced terms are not requeued');
assert(shared.includes('notes: null'), 'personal auto-share payloads omit personal notes/source metadata');
assert(!shared.includes('entry.source ? "来源："'), 'personal source labels are not uploaded');
assert(!shared.includes('String(entry.note || "").trim()'), 'personal notes are not uploaded');
assert(shared.includes('if (duplicate) {'), 'exact duplicates are linked rather than duplicated');
console.log('PASS: DWSS 0.9.39 legacy 16-word backfill eligibility and all-user sharing policy.');
