'use strict';
const fs = require('fs');
const source = fs.readFileSync(process.argv[2] || 'supabase/functions/dwss-french-language/index.ts', 'utf8');
function assert(ok, message) { if (!ok) throw new Error(message); }
assert(source.includes('Promise.any(['), 'Google and MyMemory no longer run in parallel');
assert(source.includes('translateWithGoogleWeb(text)'), 'Google provider missing');
assert(source.includes('translateWithMyMemory(text)'), 'MyMemory provider missing');
assert(source.includes('result = await translateWithLibreTranslate(text)'), 'LibreTranslate fallback missing');
assert(source.includes('30 * 60_000'), 'server-side cache missing');
assert(!source.includes('for (const provider of providers)'), 'sequential providers loop remains');
console.log('PASS: Google and MyMemory race in parallel with LibreTranslate fallback.');
