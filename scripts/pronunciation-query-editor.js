/* DWSS 0.9.144 — minimal pronunciation results with inline shared corrections. */
(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const cleanPrefix = (value, prefix) => String(value || "").replace(prefix, "").trim();
  const leadText = element => {
    if (!element) return "";
    return Array.from(element.childNodes)
      .filter(node => node.nodeType === 3)
      .map(node => node.textContent || "")
      .join("")
      .trim();
  };
  const makeField = (labelText, initialValue, placeholder, multiline = false) => {
    const label = document.createElement("label");
    label.className = "dwss-query-editor-field";
    const title = document.createElement("span");
    title.textContent = labelText;
    const input = multiline ? document.createElement("textarea") : document.createElement("input");
    if (!multiline) input.type = "text";
    input.value = initialValue || "";
    input.placeholder = placeholder || "";
    input.maxLength = multiline ? 500 : 200;
    label.append(title, input);
    return { label, input };
  };

  const style = document.createElement("style");
  style.id = "dwss-pronunciation-query-editor-0144";
  style.textContent = [
    "#pronunciationResults .pronunciation-hit-reading,#pronunciationResults .pronunciation-hit-match,#pronunciationResults .pronunciation-hit-meta,#pronunciationResults .pronunciation-match-chip,#pronunciationFrenchResults .pronunciation-hit-reading,#pronunciationFrenchResults .pronunciation-hit-meta:not(.pronunciation-hit-meaning),#pronunciationFrenchResults .pronunciation-match-chip,#pronunciationResults .pronunciation-hit-actions,#pronunciationFrenchResults .pronunciation-hit-actions{display:none!important}",
    "#pronunciationFrenchResults .pronunciation-hit-meaning{display:block!important;margin:5px 0 0!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;color:var(--muted,#738195)!important;font-size:13px!important;font-weight:600!important;line-height:1.55!important}",
    "#pronunciationFrenchResults .pronunciation-hit-meaning strong{color:var(--muted,#738195)!important;font-weight:600!important}",
    ".dwss-query-inline-tools{display:flex;align-items:center;gap:8px;margin:7px 0 0}",
    ".dwss-query-edit-toggle{min-height:30px;padding:5px 12px;border:1px solid #dbe3ec;border-radius:8px;background:#f7f9fc;color:#52647a;font:600 12px/1.3 inherit;cursor:pointer}",
    ".dwss-query-inline-editor{display:grid;gap:8px;margin:9px 0 2px;padding:10px;border:1px solid #e1e7ee;border-radius:10px;background:#fbfcfe}",
    ".dwss-query-inline-editor[hidden]{display:none!important}",
    ".dwss-query-editor-field{display:grid;gap:4px;color:#64748b;font-size:11px;font-weight:650}",
    ".dwss-query-editor-field input,.dwss-query-editor-field textarea{display:block;width:100%;box-sizing:border-box;min-height:36px;padding:8px 9px;border:1px solid #ccd6e1;border-radius:7px;background:#fff;color:#26364a;font:14px/1.45 inherit;outline:none}",
    ".dwss-query-editor-field textarea{min-height:58px;resize:vertical}",
    ".dwss-query-editor-field input:focus,.dwss-query-editor-field textarea:focus{border-color:#9ab0c9;box-shadow:0 0 0 2px rgba(56,92,132,.10)}",
    ".dwss-query-editor-actions{display:flex;gap:7px;flex-wrap:wrap}",
    ".dwss-query-editor-actions button{min-height:34px;padding:7px 11px;border:0;border-radius:7px;font:650 12px/1.3 inherit;cursor:pointer}",
    ".dwss-query-editor-save{background:#214a73;color:#fff}",
    ".dwss-query-editor-cancel{background:#edf1f5;color:#536276}",
    ".dwss-query-editor-status{font-size:11px;line-height:1.45;color:#6b7787}",
    ".dwss-query-editor-status[data-kind='error']{color:#b43b32}",
    ".dwss-query-editor-status[data-kind='success']{color:#28734e}",
    ".dwss-query-editor-status[hidden]{display:none!important}"
  ].join("\n");
  if (!document.getElementById(style.id)) document.head.appendChild(style);

  function processArticle(article, language) {
    if (!article || article.dataset.dwssQueryEditor === "1") return;
    const title = $(".pronunciation-hit-zh", article);
    const readingNode = $(".pronunciation-hit-reading", article);
    if (!title || !readingNode) return;

    const isFrench = language === "fr";
    const term = isFrench
      ? leadText(title).replace(/^法语：?/, "").trim()
      : leadText(title);
    if (!term) return;

    const reading = isFrench
      ? cleanPrefix(readingNode.textContent, /^中文近似发音：/)
      : cleanPrefix(readingNode.textContent, /^当地斯语中文谐音：/);
    const meaningNode = $(".pronunciation-hit-meaning", article);
    const currentMeaning = meaningNode
      ? cleanPrefix(meaningNode.textContent, /^中文释义：/)
      : "";
    const missingGloss = /暂未收录中文释义|没有对应词条|未找到中文释义/.test(currentMeaning);

    $$(".pronunciation-hit-actions", article).forEach(element => element.remove());

    const tools = document.createElement("div");
    tools.className = "dwss-query-inline-tools";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "dwss-query-edit-toggle";
    toggle.textContent = "修改结果";
    tools.appendChild(toggle);

    const editor = document.createElement("div");
    editor.className = "dwss-query-inline-editor";
    editor.hidden = true;
    editor.setAttribute("aria-label", isFrench ? "修改法语发音查询结果" : "修改斯语发音查询结果");

    let frenchField = null;
    let meaningField = null;
    if (isFrench) {
      frenchField = makeField("法语词条", term, "修正法语单词或词形");
      meaningField = makeField(
        "中文释义",
        missingGloss ? "" : currentMeaning,
        "填写这个法语词的中文意思",
        true
      );
      editor.append(frenchField.label, meaningField.label);
    }
    const readingField = makeField(
      isFrench ? "中文近似发音" : "科卢韦齐斯瓦希里语中文谐音",
      reading,
      "填写正确的中文谐音"
    );
    editor.append(readingField.label);

    const actions = document.createElement("div");
    actions.className = "dwss-query-editor-actions";
    const save = document.createElement("button");
    save.type = "button";
    save.className = "dwss-query-editor-save";
    save.textContent = "保存并同步给所有用户";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "dwss-query-editor-cancel";
    cancel.textContent = "取消";
    actions.append(save, cancel);

    const status = document.createElement("div");
    status.className = "dwss-query-editor-status";
    status.hidden = true;
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    editor.append(actions, status);
    tools.appendChild(editor);

    const main = $(".pronunciation-hit-main", article) || article;
    main.appendChild(tools);
    article.dataset.dwssQueryEditor = "1";

    const setStatus = (message, kind) => {
      status.textContent = message || "";
      status.dataset.kind = kind || "";
      status.hidden = !message;
    };
    toggle.addEventListener("click", () => {
      editor.hidden = !editor.hidden;
      toggle.textContent = editor.hidden ? "修改结果" : "收起修改";
      setStatus("", "");
      const target = isFrench ? frenchField.input : readingField.input;
      if (!editor.hidden && target) target.focus();
    });
    cancel.addEventListener("click", () => {
      editor.hidden = true;
      toggle.textContent = "修改结果";
      setStatus("", "");
    });

    save.addEventListener("click", async () => {
      if (save.disabled) return;
      const correctedReading = String(readingField.input.value || "").trim();
      if (!correctedReading) {
        setStatus("请填写正确的中文谐音。", "error");
        readingField.input.focus();
        return;
      }
      save.disabled = true;
      save.textContent = "正在保存…";
      setStatus("正在提交共享修正…", "info");
      try {
        if (isFrench) {
          const correctedFrench = String(frenchField.input.value || "").trim();
          const correctedMeaning = String(meaningField.input.value || "").trim();
          if (!correctedFrench) throw new Error("请填写法语词条。");
          if (!correctedMeaning) throw new Error("请填写中文释义；尚无释义的词条可以在这里补充。");
          const shared = window.DWSSSharedLexicon;
          if (!shared || typeof shared.submitFrenchPronunciationCorrection !== "function") {
            throw new Error("法语共享词库尚未就绪，请刷新页面后重试。");
          }
          const result = await shared.submitFrenchPronunciationCorrection({
            chinese_text: correctedMeaning,
            french_text: correctedFrench,
            french_pronunciation_cn: correctedReading
          });
          const frTitle = $(".pronunciation-hit-zh", article);
          if (frTitle) {
            const chip = $(".pronunciation-match-chip", frTitle);
            frTitle.textContent = "法语：" + correctedFrench;
            if (chip) frTitle.appendChild(chip);
          }
          if (meaningNode) meaningNode.textContent = "中文释义：" + correctedMeaning;
          readingNode.textContent = "中文近似发音：" + correctedReading;
          setStatus(result && result.queued
            ? "已保存在本机，联网后自动同步给所有用户。"
            : "已保存，法语词条和中文释义已加入共享词库。",
            "success");
          if (typeof window.DWSSRenderFrenchPronunciationQuery === "function") {
            window.DWSSRenderFrenchPronunciationQuery();
          }
        } else {
          const overrides = window.DWSSDictionaryOverrides;
          if (!overrides || typeof overrides.update !== "function") {
            throw new Error("斯语共享读音修正服务尚未就绪，请刷新页面后重试。");
          }
          await overrides.update({
            chinese_text: term,
            local_pronunciation_cn: correctedReading
          });
          readingNode.textContent = "当地斯语中文谐音：" + correctedReading;
          setStatus("已保存，斯语读音修正已同步到共享词库。", "success");
          if (typeof window.DWSSRenderPronunciationLookup === "function") {
            window.DWSSRenderPronunciationLookup();
          }
        }
        save.textContent = "已保存";
        window.setTimeout(() => {
          save.disabled = false;
          save.textContent = "保存并同步给所有用户";
        }, 900);
      } catch (error) {
        setStatus(String(error && error.message || "保存失败，请检查网络后重试。"), "error");
        save.disabled = false;
        save.textContent = "保存并同步给所有用户";
      }
    });
  }

  function processResults() {
    $$("#pronunciationResults .pronunciation-hit").forEach(article => processArticle(article, "sw"));
    $$("#pronunciationFrenchResults .pronunciation-hit").forEach(article => processArticle(article, "fr"));
  }

  function start() {
    processResults();
    if (document.body) {
      const observer = new MutationObserver(() => processResults());
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  window.DWSSPronunciationQueryEditor = Object.freeze({
    refresh: processResults
  });
})();
