/* DWSS 0.9.102 — direct inline pronunciation editing; no management menus. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const panel = $('translationCorrectionPanel');
  const save = $('submitTranslationCorrection');
  if (!panel || !save) return;
  save.textContent = '保存并同步';
  save.setAttribute('aria-label', '保存并同步当前读音给所有用户');
  save.title = '保存上方输入框中的读音，并同步为所有用户的首选读音';
  ['submitTranslationVariant','restoreTranslationCorrection','viewTranslationCorrectionHistory','viewWithdrawnVariants']
    .forEach(id => { const el=$(id); if(el) el.hidden=true; });
  const hint = panel.querySelector('.translation-correction-hint');
  if (hint) hint.textContent = '直接修改上方的斯语中文谐音，点击“保存并同步”即可更新所有人的首选读音。';
  const help = panel.querySelector('.translation-pronunciation-candidates-help');
  if (help) help.textContent = '不同读音会并排显示。点击旁边的读音即可载入上方输入框；修改后保存，就能设为首选。相同或近似读音会自动合并。';
  const style=document.createElement('style');
  style.id='dwss-inline-pronunciation-style-0102';
  style.textContent=`
    .translation-correction-actions{display:flex!important;flex-direction:row!important;justify-content:flex-start!important;align-items:center!important}
    #submitTranslationCorrection{min-width:130px!important;margin:0!important;padding:9px 18px!important}
    .translation-pronunciation-candidate{flex:0 0 min(80%,260px)!important}
    .translation-pronunciation-choice{display:inline-flex;align-items:center;justify-content:center;min-height:34px;margin:4px 5px 0 0;padding:6px 10px;border:1px solid #d9e1eb;border-radius:999px;background:#f7f9fc;color:#263e5b;font:700 13px/1.3 inherit;max-width:100%;overflow-wrap:anywhere}
    .translation-pronunciation-choice.selected{border-color:#bd984b;background:#fff6df;color:#66491a}
    .translation-pronunciation-choice.alias{min-height:27px;padding:4px 8px;font-size:11px;font-weight:600;background:#fff}
    .translation-pronunciation-candidate-reading{margin-bottom:2px}
    .translation-pronunciation-candidate-actions{display:none!important}
    @media(max-width:520px){.translation-pronunciation-choice{font-size:12px}}
  `;
  document.head.appendChild(style);
  console.info('[DWSS] Inline pronunciation editing ready.');
})();
