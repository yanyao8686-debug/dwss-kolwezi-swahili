#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve('scripts/french-extension-0135.js'), 'utf8');
function assert(ok, message) { if (!ok) throw new Error(message); }
assert(source.includes('let mainModeGeneration = 0;'),
  'main translation mode must have a generation counter');
const setStart = source.indexOf('function setMainMode(mode)');
const setEnd = source.indexOf('function setupFrenchPronunciationEditor()', setStart);
assert(setStart >= 0 && setEnd > setStart, 'main language switch function is missing');
const setMode = source.slice(setStart, setEnd);
assert(setMode.includes('const modeGeneration = ++mainModeGeneration;'),
  'every language switch must invalidate previous asynchronous work');
assert(setMode.includes('const isCurrentFrenchMode = () => modeGeneration === mainModeGeneration && activeMainMode === "fr";'),
  'French callbacks must validate the active language generation');
assert(setMode.includes('if (!isCurrentFrenchMode()) return;'),
  'late French dictionary success and error callbacks must be ignored');
assert(setMode.includes('window.clearTimeout(mainTimer);') && setMode.includes('mainTimer = null;'),
  'switching back to Swahili must cancel delayed French rendering');
const bindStart = source.indexOf('  function bind()');
const scheduleStart = source.indexOf('    const scheduleMain = () => {', bindStart);
const scheduleEnd = source.indexOf('    $("inputText").addEventListener("input", scheduleMain);', scheduleStart);
assert(scheduleStart >= 0 && scheduleEnd > scheduleStart, 'French input scheduler is missing');
const scheduler = source.slice(scheduleStart, scheduleEnd);
assert(scheduler.includes('const modeGeneration = mainModeGeneration;') &&
       scheduler.includes('if (!isCurrentFrenchMode()) return;'),
  'delayed French input rendering must also be protected from stale language switches');
console.log('PASS DWSS 0.9.157: stale French dictionary/input callbacks cannot repaint the Swahili result or gloss.');
