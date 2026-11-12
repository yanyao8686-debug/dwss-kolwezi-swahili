#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const root = path.resolve(process.env.DWSS_PUBLIC_DIR || 'public');
const read = name => fs.readFileSync(path.join(root, name));
const readText = name => read(name).toString('utf8');
function assert(ok, message) { if (!ok) throw new Error(message); }
function gunzipText(name) { return zlib.gunzipSync(read(name)).toString('utf8'); }

(async () => {
  const html = readText('index.html');
  const sw = readText('sw.js');
  const version = readText('VERSION.txt');
  assert(version.includes('Version: 0.9.147'), 'offline parity test must target DWSS 0.9.147');
  assert(sw.includes("const APP_VERSION = '0.9.147';"), 'offline cache version must match site version');
  assert(sw.includes('async function precacheFrenchShardFamilies(cache)'), 'Service Worker must precache both French shard families');
  assert(sw.includes('activeCache.match(request, { ignoreSearch: true })'), 'cache-busted scripts must resolve to canonical offline cache entries');

  const pronMeta = JSON.parse(readText('french-pronunciation-index.json'));
  const wordMeta = JSON.parse(readText('french-word-index.json'));
  assert(Array.isArray(pronMeta.firstKeys) && pronMeta.firstKeys.length >= 100, 'French pronunciation shard index is incomplete');
  assert(Array.isArray(wordMeta.prefixes) && wordMeta.prefixes.length >= 100, 'French spelling shard index is incomplete');
  const frenchShards = [];
  for (const key of pronMeta.firstKeys) frenchShards.push('french-pronunciation-shards/' + key + '.tsv.gz');
  for (const key of wordMeta.prefixes) frenchShards.push('french-word-shards/' + key + '.tsv.gz');
  assert(frenchShards.length >= 500 && frenchShards.length <= 2000, 'French offline shard inventory has an unexpected size');
  let shardBytes = 0;
  for (const asset of frenchShards) {
    const full = path.join(root, asset);
    assert(fs.existsSync(full), 'offline French shard is missing from deployment artifact: ' + asset);
    const bytes = fs.readFileSync(full);
    assert(bytes.length > 20 && bytes[0] === 0x1f && bytes[1] === 0x8b, 'French shard is not a valid gzip asset: ' + asset);
    shardBytes += bytes.length;
  }
  assert(shardBytes > 30 * 1024 * 1024 && shardBytes < 60 * 1024 * 1024, 'French offline shard package size is outside audited bounds');

  // Verify genuine Chinese-to-French local translation and the matching reading.
  const glossLines = gunzipText('french-gloss-index.tsv.gz').split(/\r?\n/).filter(Boolean);
  const glossRows = glossLines.map(line => line.split('\t')).filter(row => row.length >= 5 && row[1] && row[4]);
  const bonjour = glossRows.find(row => row[1].toLowerCase() === 'bonjour' && row[4].split('¦').includes('你好'));
  assert(bonjour, 'offline Chinese-to-French glossary must contain bonjour -> 你好');
  const pronText = gunzipText('french-pronunciation-shards/bang.tsv.gz');
  assert(pronText.split(/\r?\n/).some(line => line.split('\t')[0]?.toLowerCase() === 'bonjour'),
    'offline French homophone lookup shard must contain bonjour');

  const wordPrefix = wordMeta.prefixes.includes('bo') ? 'bo' : '';
  assert(wordPrefix, 'French spelling shard for bonjour is missing');
  const wordText = gunzipText('french-word-shards/' + wordPrefix + '.tsv.gz');
  const bonjourWord = wordText.split(/\r?\n/).map(line => line.split('\t')).find(row => row[1]?.toLowerCase() === 'bonjour');
  assert(bonjourWord && bonjourWord[3] && bonjourWord[3] !== '谐音待补',
    'offline French sentence pronunciation index must contain a real bonjour reading');
  assert(String(bonjour[3] || '') === String(bonjourWord[3] || ''),
    'French main gloss and spelling-index homophone must remain aligned offline');

  const frenchExtension = readText('french-extension.js');
  const frenchSandbox = { window: {}, document: null };
  vm.runInNewContext(frenchExtension, frenchSandbox, { filename: 'french-extension.js' });
  const frenchTools = frenchSandbox.window.DWSSFrenchTools;
  assert(frenchTools && typeof frenchTools.translateChinese === 'function' &&
    typeof frenchTools.buildFrenchWordReadingLookup === 'function' &&
    typeof frenchTools.buildFrenchWordPairs === 'function', 'offline French translation helpers are unavailable');
  const meaningIndex = new Map();
  for (const row of glossRows) {
    const meanings = String(row[4] || '').split('¦').filter(Boolean);
    const record = { word: row[1], ipa: row[2], reading: row[3], meanings, confidence: row[5] || '' };
    for (const meaning of meanings) {
      if (!meaningIndex.has(meaning)) meaningIndex.set(meaning, []);
      meaningIndex.get(meaning).push(record);
    }
  }
  const localFrench = frenchTools.translateChinese('你好', meaningIndex);
  assert(localFrench.words.toLowerCase().includes('bonjour') && localFrench.reading.trim(),
    'offline Chinese-to-French translation must return a word and Chinese homophone');
  const localLookup = frenchTools.buildFrenchWordReadingLookup([{
    word: bonjourWord[1], ipa: bonjourWord[2], reading: bonjourWord[3], confidence: bonjourWord[4], kind: bonjourWord[5]
  }]);
  const localPairs = frenchTools.buildFrenchWordPairs('bonjour', localLookup, []);
  assert(localPairs.length === 1 && localPairs[0].reading === bonjourWord[3],
    'offline French single-word gloss must expose the same word-level homophone');

  // Verify local Swahili dictionary data and its pinyin search engine are shipped.
  const dictionarySource = zlib.gunzipSync(read('dictionary.js.gz')).toString('utf8');
  assert(dictionarySource.length > 100000, 'offline Swahili dictionary asset is incomplete');
  const pronunciationSource = readText('pronunciation-search.js');
  const pinyinSandbox = { window: { DWSS_HANZI_PINYIN: { '邦':'bang','帮':'bang','旁':'pang','茹':'ru','如':'ru' } } };
  vm.runInNewContext(pronunciationSource, pinyinSandbox, { filename: 'pronunciation-search.js' });
  assert(pinyinSandbox.window.DWSSPronunciationSearch &&
    typeof pinyinSandbox.window.DWSSPronunciationSearch.syllableDistance === 'function',
    'offline Swahili/Chinese-homophone search engine is unavailable');

  for (const asset of ['app.js','boot.js','shared-lexicon.js','dictionary-overrides.js','hanzi-pinyin.js',
    'pronunciation-search.js','dwss-pronunciation-controls.js','french-extension.js',
    'french-translation-runtime.js','french-gloss-index.tsv.gz','french-pronunciation-index.json',
    'french-word-index.json','pronunciation-query-editor.js']) {
    assert(fs.existsSync(path.join(root, asset)) && read(asset).length > 0, 'offline core asset missing: ' + asset);
  }
  for (const asset of ['dictionary.js.gz','hanzi-pinyin.js','pronunciation-search.js',
    'dwss-pronunciation-controls.js','french-extension.js','french-translation-runtime.js',
    'french-gloss-index.tsv.gz','french-pronunciation-index.json','french-word-index.json',
    'pronunciation-query-editor.js']) {
    assert(sw.includes(asset), 'Service Worker base cache is missing: ' + asset);
  }

  // Run the actual Service Worker install handler in a deterministic cache simulator.
  // This proves it schedules every French shard and that versioned scripts match offline.
  const scope = 'https://yanyao8686-debug.github.io/dwss-kolwezi-swahili/';
  const stored = new Map();
  const indexBody = new Map([
    [new URL('./french-pronunciation-index.json', scope).href, readText('french-pronunciation-index.json')],
    [new URL('./french-word-index.json', scope).href, readText('french-word-index.json')]
  ]);
  const normalize = (value, ignoreSearch = false) => {
    const u = new URL(typeof value === 'string' ? value : value.url, scope);
    if (ignoreSearch) { u.search = ''; u.hash = ''; }
    return u.href;
  };
  const cache = {
    async addAll(entries) {
      for (const entry of entries) {
        const key = normalize(entry);
        stored.set(key, new Response(indexBody.get(key) || 'cached-static-asset'));
      }
    },
    async match(value, options = {}) {
      const key = normalize(value, !!options.ignoreSearch);
      if (stored.has(key)) return stored.get(key).clone();
      return null;
    },
    async put(value, response) { stored.set(normalize(value), response.clone()); }
  };
  let networkRequests = 0;
  const handlers = {};
  const context = {
    URL, Request, Response, Promise, setTimeout, clearTimeout,
    caches: { open: async () => cache, keys: async () => ['dwss-kolwezi-0.9.147'], delete: async () => true },
    fetch: async () => { networkRequests++; return new Response('cached-french-shard', { status: 200 }); },
    self: {
      registration: { scope }, location: new URL(scope),
      clients: { claim: async () => {} },
      addEventListener(name, callback) { handlers[name] = callback; },
      skipWaiting: async () => {}
    }
  };
  vm.runInNewContext(sw, context, { filename: 'sw.js' });
  let installPromise;
  handlers.install({ waitUntil(promise) { installPromise = promise; } });
  assert(installPromise, 'Service Worker install handler did not register its promise');
  await installPromise;
  assert(networkRequests === frenchShards.length,
    'Service Worker did not fetch all French shards: ' + networkRequests + ' / ' + frenchShards.length);
  for (const asset of frenchShards) {
    const url = new URL('./' + asset, scope).href;
    assert(await cache.match(url), 'French shard was not cached at install: ' + asset);
  }
  const cacheBustedScripts = [
    './supabase.min.js?dwss-release=0.9.147',
    './shared-lexicon.js?dwss-release=0.9.147',
    './boot.js?dwss-release=0.9.147',
    './pronunciation-query-editor.js?dwss-release=0.9.147'
  ];
  for (const asset of cacheBustedScripts) {
    assert(await cache.match(new URL(asset, scope).href, { ignoreSearch: true }),
      'versioned script cannot resolve to cached offline asset: ' + asset);
  }
  const request = new Request(new URL('./shared-lexicon.js?dwss-release=0.9.147', scope).href);
  let offlineResponsePromise;
  context.fetch = async () => { throw new Error('offline'); };
  handlers.fetch({ request, respondWith(promise) { offlineResponsePromise = promise; } });
  const offlineResponse = await offlineResponsePromise;
  assert(offlineResponse && offlineResponse.ok, 'versioned shared-lexicon script failed while offline');
  assert(networkRequests === frenchShards.length, 'offline cache lookup unexpectedly went to the network');

  console.log('PASS DWSS 0.9.147 offline parity: Swahili dictionary/search assets, French local translation/gloss, and all ' +
    frenchShards.length + ' French spelling/pronunciation shards are installed and available offline (' +
    (shardBytes / 1024 / 1024).toFixed(1) + ' MiB French shards).');
})().catch(error => { console.error(error); process.exitCode = 1; });
