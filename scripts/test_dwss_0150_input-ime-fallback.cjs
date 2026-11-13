#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(process.env.DWSS_PUBLIC_DIR || 'public');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script id="dwss-input-ime-fallback-0150">([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length, 1, 'the Android IME fallback must be embedded exactly once');
const source = scripts[0][1];
assert.equal(html.split('pronunciation-query-editor.js?dwss-release=0.9.153').length - 1, 1,
  'the read-only pronunciation script must be loaded once');

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function verifyMode(mode) {
  const dom = new JSDOM(
    '<!doctype html><html><body><button id="dwssMainFrMode"></button><input id="inputText"></body></html>',
    { url: 'https://dwss.test/', runScripts: 'outside-only', pretendToBeVisual: true }
  );
  const { window } = dom;
  const { document } = window;
  const input = document.getElementById('inputText');
  const frenchButton = document.getElementById('dwssMainFrMode');
  const calls = [];

  if (mode === 'fr') {
    frenchButton.classList.add('active');
    window.DWSSFrenchMachineTranslationController = {
      scheduleTranslation(delay) { calls.push({ mode: 'fr', delay }); }
    };
    // Represents the real French translation runtime's compositionend handler.
    input.addEventListener('compositionend', () => {
      window.DWSSFrenchMachineTranslationController.scheduleTranslation(60);
    });
  } else {
    window.DWSSRenderTranslation = () => calls.push({ mode: 'sw' });
    // Represents the main app's compositionend handler.
    input.addEventListener('compositionend', () => window.DWSSRenderTranslation());
  }

  window.eval(source);
  input.dispatchEvent(new window.CompositionEvent('compositionstart', { bubbles: true }));
  input.value = '你好';
  input.dispatchEvent(new window.InputEvent('input', {
    bubbles: true, data: '好', inputType: 'insertCompositionText', isComposing: true
  }));

  // Simulate an Android keyboard that never sends compositionend.
  await pause(1450);
  assert.equal(calls.length, 1, mode + ' input must trigger translation after the IME fallback');
  assert.equal(calls[0].mode, mode);
  if (mode === 'fr') assert.equal(calls[0].delay, 60);

  window.close();
}

(async () => {
  await verifyMode('sw');
  await verifyMode('fr');
  console.log('PASS DWSS 0.9.153: stalled Chinese IME composition triggers Swahili and French translation without compositionend.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
