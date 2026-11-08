(function (window, document) {
  "use strict";

  const ENDPOINT = "https://pautxzcfmtwkaunjxghj.supabase.co/functions/v1/dwss-french-language";
  const PUBLISHABLE_KEY = "sb_publishable_9BB_pwnlj6-gVHPFzpjivA_L7SGU_Bp";
  const WORD_META_URL = "./french-word-index.json";
  const WORD_SHARD_BASE = "./french-word-shards/";
  const LABELS = {
    A: "多来源一致", B: "单一来源并经独立校验", C: "单一来源未独立校验",
    R: "人工复核", P: "同一词项形式推导", K: "词典短语来源",
    T: "人工复核特殊形式", E: "缩写读法", N: "已确认外来词/人名",
    M: "外来词/人名单一来源", S: "复合词片段", G: "模型预测，低可信度",
    I: "补充词典来源"
  };

  function normalizeFrenchWord(value) {
    return String(value || "").normalize("NFKD")
      .replace(/œ/gi, "oe").replace(/æ/gi, "ae")
      .replace(/\p{M}/gu, "").toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }
  function wordPrefix(value) {
    const key = normalizeFrenchWord(value);
    return key.length >= 2 ? key.slice(0, 2) : (key ? key + "_" : "");
  }
  function exportTools() {
    return Object.freeze({ normalizeFrenchWord, wordPrefix });
  }
  window.DWSSFrenchMachineTranslation = exportTools();
  if (!document || !document.getElementById) return;

  const $ = id => document.getElementById(id);
  let metaPromise = null;
  const wordShardCache = new Map();
  const translationCache = new Map();
  let translateTimer = null;
  let activeRequest = 0;
  let lastChinese = "";
  let lastMachineFrench = "";
  let pendingChinese = "";
  let composing = false;
  let grammarButton = null;
  let grammarDetails = null;

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    })[c]);
  }
  function isFrenchMode() {
    const result = $("resultFrenchReading");
    const button = $("dwssMainFrMode");
    return !!result && !result.hidden && (!button || button.classList.contains("active"));
  }
  function setMeta(message) {
    const meta = $("dwssFrenchIpaMeta");
    if (meta) meta.textContent = message || "";
  }
  function setGrammarStatus(message, type) {
    const status = $("dwssFrenchCorrectionStatus");
    if (status) {
      status.textContent = message;
      status.dataset.status = type || "info";
    }
  }
  async function apiCall(payload) {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": PUBLISHABLE_KEY },
      body: JSON.stringify(payload),
      cache: "no-store"
    });
    let data;
    try { data = await response.json(); } catch (_) { throw new Error("法语服务返回了无法识别的数据。"); }
    if (!response.ok || !data || data.ok !== true) {
      throw new Error(data && data.error ? data.error : ("法语服务错误（HTTP " + response.status + "）。"));
    }
    return data;
  }
  async function decompressGzip(response, label) {
    if (!response.ok) throw new Error(label + "加载失败（HTTP " + response.status + "）。");
    if (typeof DecompressionStream === "undefined") throw new Error("当前浏览器不支持法语发音词库解压，请更新浏览器或安卓 WebView。");
    return new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).text();
  }
  async function loadWordMeta() {
    if (!metaPromise) {
      metaPromise = fetch(WORD_META_URL, { cache: "no-cache" }).then(async response => {
        if (!response.ok) throw new Error("法语整句发音索引暂不可用。");
        const data = await response.json();
        if (!Array.isArray(data.prefixes) || Number(data.wordFormsWithIpa || 0) < 1000000) {
          throw new Error("法语整句发音索引数量校验失败。");
        }
        return data;
      }).catch(error => { metaPromise = null; throw error; });
    }
    return metaPromise;
  }
  async function loadWordShard(prefix) {
    if (!prefix) return new Map();
    if (wordShardCache.has(prefix)) {
      const cached = wordShardCache.get(prefix);
      wordShardCache.delete(prefix);
      wordShardCache.set(prefix, cached);
      return cached;
    }
    const meta = await loadWordMeta();
    if (!meta.prefixes.includes(prefix)) return new Map();
    const response = await fetch(WORD_SHARD_BASE + encodeURIComponent(prefix) + ".tsv.gz");
    const source = await decompressGzip(response, "法语词形 " + prefix);
    const map = new Map();
    for (const line of source.split(/\r?\n/)) {
      if (!line) continue;
      const f = line.split("\t");
      if (f.length < 6 || !f[0] || !f[2]) continue;
      map.set(f[0], { word: f[1], ipa: f[2], reading: f[3], confidence: f[4], kind: f[5] });
    }
    wordShardCache.set(prefix, map);
    while (wordShardCache.size > 12) wordShardCache.delete(wordShardCache.keys().next().value);
    return map;
  }
  function fallbackElision(token) {
    const forms = {
      l:"勒", d:"德", j:"日", c:"斯", n:"恩", m:"姆", s:"斯", t:"特", qu:"克"
    };
    return forms[token.toLowerCase()] || "";
  }
  function createWordTokens(text) {
    const re = /[\p{L}\p{M}]+/gu;
    const tokens = [];
    let match;
    while ((match = re.exec(text)) !== null) {
      tokens.push({ word: match[0], start: match.index, end: match.index + match[0].length });
    }
    return tokens;
  }
  async function buildPhraseReading(french) {
    const tokens = createWordTokens(french);
    if (!tokens.length) return { reading: "", ipa: [], missing: [] };
    const prefixes = [...new Set(tokens.map(x => wordPrefix(x.word)).filter(Boolean))];
    const shards = await Promise.all(prefixes.map(loadWordShard));
    const words = new Map();
    for (const shard of shards) for (const [key, value] of shard) words.set(key, value);

    let reading = "";
    let ipa = [];
    const missing = [];
    let cursor = 0;
    for (const token of tokens) {
      const gap = french.slice(cursor, token.start).replace(/[’']/g, "").replace(/[-‐‑–—]/g, " ");
      reading += gap;
      const key = normalizeFrenchWord(token.word);
      const item = words.get(key);
      if (item && item.ipa) {
        const tools = window.DWSSFrenchTools;
        const cue = tools && typeof tools.ipaToChinese === "function" ? tools.ipaToChinese(item.ipa) : item.reading;
        if (cue) {
          reading += cue;
          ipa.push(token.word + " /" + item.ipa + "/ [" + (LABELS[item.confidence] || "来源未标注") + "]");
        } else {
          reading += "〔发音待核〕";
          missing.push(token.word);
        }
      } else {
        const elision = fallbackElision(token.word);
        if (elision) reading += elision;
        else {
          reading += "〔" + token.word + "读音待补〕";
          missing.push(token.word);
        }
      }
      cursor = token.end;
      if (cursor < french.length && /\s/.test(french[cursor])) reading += " ";
    }
    reading += french.slice(cursor).replace(/[’']/g, "");
    reading = reading.replace(/\s{2,}/g, " ").trim();
    return { reading, ipa, missing };
  }
  function resetGrammarDetails() {
    if (grammarDetails) {
      grammarDetails.open = false;
      grammarDetails.innerHTML = "";
    }
  }
  async function renderPronunciation(french, requestId) {
    const spelling = $("dwssFrenchSpelling");
    const result = $("resultFrenchReading");
    if (!spelling || !result) return;
    try {
      const pronunciation = await buildPhraseReading(french);
      if (requestId !== activeRequest || String(spelling.value || "").trim() !== french) return;
      result.value = pronunciation.reading;
      const source = pronunciation.ipa.length ? "逐词 IPA：" + pronunciation.ipa.slice(0, 24).join("；") : "未找到可核对的词形 IPA。";
      const missing = pronunciation.missing.length
        ? "；未收录读音：" + [...new Set(pronunciation.missing)].slice(0, 12).join("、")
        : "";
      setMeta("发音来源：LeXiK 1.0 法语词形 IPA。中文近似音仅作辅助；法语连读和联诵受语境影响，不能用逐词读音完全替代。" + missing + "\n" + source);
    } catch (error) {
      result.value = "";
      setMeta("法语原文已生成，但整句发音词库暂时无法加载：" + String(error && error.message || error));
    }
  }
  async function translateCurrentChinese() {
    if (!isFrenchMode()) return;
    const input = $("inputText");
    const spelling = $("dwssFrenchSpelling");
    const output = $("resultFrenchReading");
    if (!input || !spelling || !output) return;
    const chinese = String(input.value || "").trim();
    if (!chinese) {
      spelling.value = "";
      output.value = "";
      setMeta("");
      activeRequest += 1;
      pendingChinese = "";
      lastChinese = "";
      lastMachineFrench = "";
      return;
    }
    if (pendingChinese === chinese) return;
    if (chinese === lastChinese && spelling.value.trim() && spelling.value.trim() === lastMachineFrench) return;
    lastChinese = chinese;
    pendingChinese = chinese;
    const requestId = ++activeRequest;
    spelling.value = "";
    output.value = "";
    lastMachineFrench = "";
    setMeta("正在进行中文 → 法语整句翻译…");
    setGrammarStatus("正在生成完整法语句子…", "info");
    resetGrammarDetails();
    try {
      let data = translationCache.get(chinese);
      if (!data) {
        data = await apiCall({ action: "translate", text: chinese });
        translationCache.set(chinese, data);
        if (translationCache.size > 100) translationCache.delete(translationCache.keys().next().value);
      }
      if (requestId !== activeRequest) return;
      if (!isFrenchMode() || String(input.value || "").trim() !== chinese) {
        pendingChinese = "";
        return;
      }
      const french = String(data.translatedText || "").trim();
      if (!french) throw new Error("翻译服务没有返回法语原文。");
      spelling.value = french;
      lastMachineFrench = french;
      setGrammarStatus("整句已生成；建议点击“检查法语语法”进行第二步校对。", "info");
      await renderPronunciation(french, requestId);
      if (requestId !== activeRequest) return;
      const cachedLabel = data.cached ? "（缓存结果）" : "";
      const providerLabel = data.provider || "免密机器翻译服务";
      const meta = $("dwssFrenchIpaMeta");
      if (meta) meta.textContent = "法语整句来源：" + providerLabel + cachedLabel + "。语法校对尚未执行；中文近似音为 IPA 自动转写。" +
        (meta.textContent ? "\n" + meta.textContent : "");
      if (requestId === activeRequest) pendingChinese = "";
    } catch (error) {
      if (requestId !== activeRequest) return;
      pendingChinese = "";
      setGrammarStatus("在线整句翻译失败：" + String(error && error.message || error) +
        "。当前如有旧的词典拼接内容，只能作单词参考，不能视为语法正确的法语句子。", "error");
      setMeta("在线翻译节点暂不可用。本次不把逐词拼接结果冒充完整法语翻译。请保持联网后重试。");
    }
  }
  function scheduleTranslation(delay) {
    window.clearTimeout(translateTimer);
    if (!isFrenchMode()) {
      if (pendingChinese) {
        pendingChinese = "";
        activeRequest += 1;
      }
      return;
    }
    translateTimer = window.setTimeout(() => translateCurrentChinese(), delay == null ? 700 : delay);
  }
  async function runGrammarCheck() {
    if (!isFrenchMode()) return;
    const spelling = $("dwssFrenchSpelling");
    const french = String(spelling && spelling.value || "").trim();
    if (!french) {
      setGrammarStatus("请先生成或填写法语原文。", "error");
      return;
    }
    grammarButton.disabled = true;
    grammarButton.textContent = "正在检查…";
    setGrammarStatus("正在调用 LanguageTool 检查法语拼写和语法…", "info");
    try {
      const result = await apiCall({ action: "check", text: french });
      const corrected = String(result.correctedText || french);
      const corrections = Array.isArray(result.appliedCorrections) ? result.appliedCorrections : [];
      const matches = Array.isArray(result.matches) ? result.matches : [];
      if (corrected !== french) {
        spelling.value = corrected;
        lastMachineFrench = corrected;
        lastChinese = String($("inputText") && $("inputText").value || "").trim();
        await renderPronunciation(corrected, activeRequest);
      }
      if (matches.length) {
        setGrammarStatus("发现 " + result.totalIssues + " 处疑似问题，已按首选建议自动修正 " + corrections.length +
          " 处。请复核法语原文与中文原意；机器校对不能保证语义完全正确。", "ok");
      } else {
        setGrammarStatus("LanguageTool 未发现明显拼写或语法问题；这不等于语义和用词已获母语者确认。", "ok");
      }
      if (grammarDetails) {
        grammarDetails.innerHTML = "<summary>查看校对建议（" + matches.length + " 项）</summary>" +
          (matches.length ? "<ul>" + matches.map(item =>
            "<li><b>" + escapeHtml(item.shortMessage || item.category || "建议") + "</b>：" +
            escapeHtml(item.message) + (item.suggestions && item.suggestions.length
              ? "；建议：" + escapeHtml(item.suggestions.join(" / ")) : "") + "</li>"
          ).join("") + "</ul>" : "<p>没有返回需要展示的建议。</p>");
      }
    } catch (error) {
      setGrammarStatus("法语语法检查暂时失败：" + String(error && error.message || error) + "。法语原文保持不变。", "error");
    } finally {
      grammarButton.disabled = false;
      grammarButton.textContent = "检查法语语法";
    }
  }
  function addGrammarControls() {
    if (grammarButton) return;
    const anchor = $("dwssFrenchIpaMeta");
    if (!anchor || !anchor.parentElement) return;
    const panel = document.createElement("div");
    panel.className = "dwss-fr-machine-tools";
    panel.style.cssText = "display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 0 4px";
    const grammarStatus = document.createElement("div");
    grammarStatus.id = "dwssFrenchCorrectionStatus";
    grammarStatus.className = "dwss-french-grammar-status";
    grammarStatus.setAttribute("role", "status");
    grammarStatus.setAttribute("aria-live", "polite");
    grammarStatus.style.cssText = "width:100%;font-size:12px;line-height:1.5;min-height:1.2em";
    grammarButton = document.createElement("button");
    grammarButton.type = "button";
    grammarButton.className = "soft mini";
    grammarButton.textContent = "检查法语语法";
    grammarButton.addEventListener("click", runGrammarCheck);
    const note = document.createElement("small");
    note.style.cssText = "font-size:12px;opacity:.82";
    note.innerHTML = '使用免密公共翻译节点和第三方法语校对；文本会发送到外部服务，请勿输入矿区或个人敏感信息。校对由 <a href="https://languagetool.org" target="_blank" rel="noopener">LanguageTool</a> 提供。';
    panel.appendChild(grammarStatus);
    panel.appendChild(grammarButton);
    panel.appendChild(note);
    anchor.insertAdjacentElement("afterend", panel);
    grammarDetails = document.createElement("details");
    grammarDetails.style.cssText = "font-size:12px;margin:4px 0 8px";
    panel.insertAdjacentElement("afterend", grammarDetails);
  }
  function bind() {
    addGrammarControls();
    const input = $("inputText");
    const spelling = $("dwssFrenchSpelling");
    if (!input || !spelling) return;
    input.addEventListener("compositionstart", () => { composing = true; });
    input.addEventListener("compositionend", () => { composing = false; scheduleTranslation(100); });
    input.addEventListener("input", () => { if (!composing) scheduleTranslation(750); });
    const frenchMode = $("dwssMainFrMode");
    if (frenchMode) frenchMode.addEventListener("click", () => scheduleTranslation(100));
    const swMode = $("dwssMainSwMode");
    if (swMode) swMode.addEventListener("click", () => { window.clearTimeout(translateTimer); pendingChinese = ""; activeRequest += 1; });
    const translateButton = $("translateBtn");
    if (translateButton) translateButton.addEventListener("click", () => scheduleTranslation(100));
    const clearButton = $("clearBtn");
    if (clearButton) clearButton.addEventListener("click", () => scheduleTranslation(100));
    spelling.addEventListener("input", () => {
      if (!isFrenchMode()) return;
      const french = String(spelling.value || "").trim();
      pendingChinese = "";
      lastMachineFrench = "";
      const requestId = ++activeRequest;
      if (french) {
        setMeta("正在根据已编辑的法语原文生成词形 IPA…");
        window.setTimeout(() => renderPronunciation(french, requestId), 260);
      } else {
        $("resultFrenchReading").value = "";
        setMeta("");
      }
    });
    if (isFrenchMode()) scheduleTranslation(150);
  }
  window.DWSSFrenchMachineTranslationController = Object.freeze({
    translateCurrentChinese,
    scheduleTranslation,
    isFrenchMode
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once: true });
  else bind();
})(window, document);
