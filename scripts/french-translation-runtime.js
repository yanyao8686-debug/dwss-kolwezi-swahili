(function (window, document) {
  "use strict";

  const ENDPOINT = "https://pautxzcfmtwkaunjxghj.supabase.co/functions/v1/dwss-french-language";
  const PUBLISHABLE_KEY = "sb_publishable_9BB_pwnlj6-gVHPFzpjivA_L7SGU_Bp";
  const WORD_META_URL = "./french-word-index.json";
  const WORD_SHARD_BASE = "./french-word-shards/";
  const LABELS = {
    A: "多来源一致", B: "单一来源并经独立校验", C: "单一来源未独立校验",
    R: "人工复核", P: "同一词项形式推导", K: "词典短语来源", W: "Wiktionary IPA 来源，中文近似音自动生成，待核对",
    T: "人工复核特殊形式", E: "缩写读法", N: "已确认外来词/人名",
    M: "外来词/人名单一来源", S: "复合词片段", G: "模型预测，低可信度",
    I: "补充词典来源", W: "Wiktionary IPA 来源，中文近似音自动生成，待核对"
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
  function formatCombinedResult(_french, reading) {
    return String(reading || "").trim();
  }
  function parseCombinedResult(value) {
    const text = String(value || "");
    const marker = "\n中文近似音：";
    const index = text.indexOf(marker);
    if (index < 0) return { french: "", reading: text.trim() };
    const french = text.slice(0, index).replace(/^法语原文：/, "").trim();
    const reading = text.slice(index + marker.length).trim();
    return { french, reading };
  }
  window.DWSSFrenchCombinedResult = Object.freeze({
    format: formatCombinedResult,
    parse: parseCombinedResult
  });
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
  let combinedEditTimer = null;
  let userEditedCombined = false;
  let writingCombinedOutput = false;
  let localPreviewChinese = "";
  let localPreviewCompleteChinese = "";
  const PERSISTED_CACHE_KEY = "dwss.french.translation-cache.v1";
  const PERSISTED_CACHE_MAX = 60;
  const PERSISTED_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;

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
  function setMeta(_message) {
    const meta = $("dwssFrenchIpaMeta");
    if (meta) {
      meta.textContent = "";
      meta.hidden = true;
      meta.style.display = "none";
    }
  }
  function setGrammarStatus(message, type) {
    const status = $("dwssFrenchCorrectionStatus");
    if (!status) return;
    const visibleText = String(message || "").trim();
    status.textContent = visibleText;
    status.dataset.status = type || "info";
    status.hidden = !visibleText;
    status.style.display = visibleText ? "block" : "none";
  }
  function setFrenchResult(value) {
    const result = $("resultFrenchReading");
    if (!result) return;
    const text = String(value == null ? "" : value);
    writingCombinedOutput = true;
    result.value = text;
    result.classList.toggle("empty", !text.trim());
    writingCombinedOutput = false;
    result.dispatchEvent(new Event("dwss:french-result-updated"));
  }
  function restorePersistentTranslations() {
    try {
      const raw = window.localStorage.getItem(PERSISTED_CACHE_KEY);
      const entries = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(entries)) return;
      const now = Date.now();
      for (const item of entries.slice(-PERSISTED_CACHE_MAX)) {
        const chinese = String(item && item.chinese || "").trim();
        const french = String(item && item.french || "").trim();
        const at = Number(item && item.at || 0);
        if (!chinese || !french || !at || now - at > PERSISTED_CACHE_TTL) continue;
        translationCache.set(chinese, { translatedText: french, provider: "本机缓存", cached: true, at });
      }
    } catch (_) {}
  }
  function persistTranslations() {
    try {
      const entries = Array.from(translationCache.entries())
        .filter(([chinese, data]) => chinese && data && data.translatedText)
        .slice(-PERSISTED_CACHE_MAX)
        .map(([chinese, data]) => ({
          chinese, french: String(data.translatedText || "").slice(0, 8000),
          at: Number(data.at || Date.now())
        }));
      window.localStorage.setItem(PERSISTED_CACHE_KEY, JSON.stringify(entries));
    } catch (_) {}
  }
  function showInstantLocalDraft(chinese) {
    const tools = window.DWSSFrenchTools;
    const input = $("inputText");
    const spelling = $("dwssFrenchSpelling");
    if (!tools || !spelling) return false;
    const displayDraft = draft => {
      // Never let a late local draft overwrite a pending or already-returned cloud translation.
      if (!draft || (lastChinese === chinese && lastMachineFrench)) return;
      if (!String(draft.words || "").trim() || !String(draft.reading || "").trim()) return;
      if (!isFrenchMode() || String(input && input.value || "").trim() !== chinese) return;
      const french = String(draft.words).trim();
      spelling.value = french;
      lastMachineFrench = "";
      localPreviewChinese = chinese;
      localPreviewCompleteChinese = Array.isArray(draft.misses) && draft.misses.length === 0 ? chinese : "";
      setFrenchResult(draft.reading);
      setMeta("");
      setGrammarStatus(
        draft.misses && draft.misses.length
          ? "本地词库先行结果，部分词语未收录；联网后自动补全。"
          : "本地词库即时结果，联网后自动优化。",
        "info"
      );
      if (typeof tools.renderSingleGloss === "function") tools.renderSingleGloss(chinese, french);
    };
    if (typeof tools.translateOfflineChinese === "function") {
      try {
        const immediate = tools.translateOfflineChinese(chinese);
        if (immediate && String(immediate.words || "").trim() && String(immediate.reading || "").trim()) {
          displayDraft(immediate); return true;
        }
      } catch (_) {}
    }
    if (typeof tools.prepareOfflineChinese === "function") {
      tools.prepareOfflineChinese(chinese).then(displayDraft).catch(() => {}); return false;
    }
    return false;
  }
  function showCachedTranslation(chinese, data) {
    const spelling = $("dwssFrenchSpelling");
    if (!spelling || !data || !String(data.translatedText || "").trim()) return false;
    const rawFrench = String(data.translatedText).trim();
    const numberTools = window.DWSSFrenchTools;
    const french = numberTools && typeof numberTools.expandFrenchNumerals === "function"
      ? numberTools.expandFrenchNumerals(rawFrench) : rawFrench;
    const requestId = ++activeRequest;
    lastChinese = chinese;
    lastMachineFrench = french;
    localPreviewChinese = "";
    localPreviewCompleteChinese = "";
    pendingChinese = "";
    userEditedCombined = false;
    spelling.value = french;
    setGrammarStatus("使用本机已保存的法语译文。", "info");
    renderPronunciation(french, requestId);
    return true;
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
    if (!tokens.length) return { reading: "", ipa: [], missing: [], wordReadings: new Map() };
    const tools = window.DWSSFrenchTools;
    let localPairs = [];
    if (tools && typeof tools.getPhraseWordPairs === "function") {
      try { localPairs = await tools.getPhraseWordPairs(french); } catch (_) { localPairs = []; }
    }
    const localReadings = new Map();
    for (const pair of localPairs) {
      const key = normalizeFrenchWord(pair && pair.token);
      const cue = String(pair && pair.reading || "").trim();
      if (key && cue && cue !== "谐音待补") localReadings.set(key, cue);
    }
    const unresolved = tokens.filter(token => {
      const key = normalizeFrenchWord(token.word);
      return !localReadings.has(key) && !fallbackElision(token.word);
    });
    const words = new Map();
    if (unresolved.length) {
      try {
        const prefixes = [...new Set(unresolved.map(x => wordPrefix(x.word)).filter(Boolean))];
        const shards = await Promise.all(prefixes.map(loadWordShard));
        for (const shard of shards) for (const [key, value] of shard) words.set(key, value);
      } catch (_) {}
    }
    let reading = "";
    const ipa = [];
    const missing = [];
    const wordReadings = new Map();
    let cursor = 0;
    for (const token of tokens) {
      const gap = french.slice(cursor, token.start).replace(/[’']/g, "").replace(/[-‐‑–—]/g, " ");
      reading += gap;
      const key = normalizeFrenchWord(token.word);
      const localCue = localReadings.get(key);
      const item = words.get(key);
      if (localCue) {
        reading += localCue;
        wordReadings.set(key, { word: token.word, reading: localCue, ipa: "", confidence: "local-gloss" });
      } else if (item) {
        const ipaReading = item.ipa && tools && typeof tools.ipaToChinese === "function"
          ? tools.ipaToChinese(item.ipa) : "";
        const cue = String(item.reading || ipaReading || "").trim();
        if (cue) {
          reading += cue;
          if (item.ipa) ipa.push(token.word + " /" + item.ipa + "/ [" + (LABELS[item.confidence] || "来源未标注") + "]");
          wordReadings.set(key, { word: token.word, reading: cue, ipa: item.ipa || "", confidence: item.confidence || "" });
        } else {
          reading += "〔发音待核〕";
          missing.push(token.word);
          wordReadings.set(key, { word: token.word, reading: "", ipa: item.ipa || "", confidence: item.confidence || "", missing: true });
        }
      } else {
        const elision = fallbackElision(token.word);
        if (elision) {
          reading += elision;
          wordReadings.set(key, { word: token.word, reading: elision, ipa: "", confidence: "fallback" });
        } else {
          reading += "〔" + token.word + "读音待补〕";
          missing.push(token.word);
          wordReadings.set(key, { word: token.word, reading: "", ipa: "", missing: true });
        }
      }
      cursor = token.end;
      if (cursor < french.length && /\s/.test(french[cursor])) reading += " ";
    }
    reading += french.slice(cursor).replace(/[’']/g, "");
    reading = reading.replace(/\s{2,}/g, " ").trim();
    return { reading, ipa, missing, wordReadings };
  }
  async function buildLocalPhraseReading(french) {
    const tokens = createWordTokens(french);
    if (!tokens.length) return { reading: "", ipa: [], missing: [], wordReadings: new Map() };
    const tools = window.DWSSFrenchTools;
    let pairs = [];
    if (tools && typeof tools.getPhraseWordPairs === "function") {
      try { pairs = await tools.getPhraseWordPairs(french); } catch (_) { pairs = []; }
    }
    const lookup = new Map();
    for (const pair of pairs) {
      const key = normalizeFrenchWord(pair && pair.token);
      const cue = String(pair && pair.reading || "").trim();
      if (key && cue && cue !== "谐音待补") lookup.set(key, cue);
    }
    let reading = "";
    const missing = [];
    const wordReadings = new Map();
    let cursor = 0;
    for (const token of tokens) {
      reading += french.slice(cursor, token.start);
      const key = normalizeFrenchWord(token.word);
      const cue = lookup.get(key) || fallbackElision(token.word);
      if (cue) {
        reading += cue;
        wordReadings.set(key, { word: token.word, reading: cue, ipa: "", confidence: "local-gloss" });
      } else {
        reading += "〔发音待补〕";
        missing.push(token.word);
        wordReadings.set(key, { word: token.word, reading: "", ipa: "", missing: true });
      }
      cursor = token.end;
    }
    reading += french.slice(cursor);
    return { reading: reading.trim(), ipa: [], missing, wordReadings };
  }
  async function renderPronunciation(french, requestId) {
    const spelling = $("dwssFrenchSpelling");
    const result = $("resultFrenchReading");
    if (!spelling || !result) return;
    try {
      const local = await buildLocalPhraseReading(french);
      if (requestId !== activeRequest || String(spelling.value || "").trim() !== french) return;
      setFrenchResult(local.reading);
      const glossTools = window.DWSSFrenchTools;
      if (glossTools && typeof glossTools.renderSingleGloss === "function" && lastChinese) {
        glossTools.renderSingleGloss(lastChinese, french);
      }
      setMeta("");
      // Enrich missing word forms in the background without delaying this local result.
      if (typeof navigator === "undefined" || navigator.onLine !== false) {
        buildPhraseReading(french).then(enriched => {
          if (requestId !== activeRequest || String(spelling.value || "").trim() !== french) return;
          setFrenchResult(enriched.reading);
          const enrichedGlossTools = window.DWSSFrenchTools;
          if (enrichedGlossTools && typeof enrichedGlossTools.renderSingleGloss === "function" && lastChinese) {
            enrichedGlossTools.renderSingleGloss(lastChinese, french, enriched.wordReadings);
          }
        }).catch(() => {
          if (requestId !== activeRequest || String(spelling.value || "").trim() !== french) return;
          const enrichedGlossTools = window.DWSSFrenchTools;
          if (enrichedGlossTools && typeof enrichedGlossTools.renderSingleGloss === "function" && lastChinese) {
            enrichedGlossTools.renderSingleGloss(lastChinese, french, new Map());
          }
        });
      }
    } catch (_) {
      setFrenchResult("近似音暂不可用");
      const glossTools = window.DWSSFrenchTools;
      if (glossTools && typeof glossTools.renderSingleGloss === "function" && lastChinese) {
        glossTools.renderSingleGloss(lastChinese, french);
      }
      setGrammarStatus("法语近似音暂不可用。", "error");
    }
  }
  async function translateCurrentChinese() {
    if (!isFrenchMode()) return;
    const input = $("inputText");
    const spelling = $("dwssFrenchSpelling");
    const output = $("resultFrenchReading");
    if (!input || !spelling || !output) return;
    const chinese = String(input.value || "").trim();
    const numeralTools = window.DWSSFrenchTools;
    if (chinese && numeralTools && typeof numeralTools.isNumericExpression === "function" &&
        numeralTools.isNumericExpression(chinese)) {
      const numberDraft = typeof numeralTools.translateOfflineChinese === "function"
        ? numeralTools.translateOfflineChinese(chinese) : null;
      if (numberDraft && String(numberDraft.words || "").trim() && String(numberDraft.reading || "").trim()) {
        ++activeRequest; lastChinese = chinese; lastMachineFrench = String(numberDraft.words).trim();
        localPreviewChinese = ""; localPreviewCompleteChinese = chinese; pendingChinese = ""; spelling.value = lastMachineFrench;
        setFrenchResult(numberDraft.reading); setGrammarStatus("数字已直接转换为法语读法。", "info");
        if (typeof numeralTools.renderSingleGloss === "function") numeralTools.renderSingleGloss(chinese, lastMachineFrench);
        return;
      }
    }
    if (!chinese) {
      spelling.value = "";
      setFrenchResult("");
      setMeta("");
      setGrammarStatus("");
      activeRequest += 1;
      pendingChinese = "";
      lastChinese = "";
      lastMachineFrench = "";
      localPreviewChinese = "";
      localPreviewCompleteChinese = "";
      const glossTools = window.DWSSFrenchTools;
      if (glossTools && typeof glossTools.renderSingleGloss === "function") glossTools.renderSingleGloss("", "");
      return;
    }
    if (localPreviewCompleteChinese === chinese && localPreviewChinese === chinese && spelling.value.trim()) {
      lastMachineFrench = spelling.value.trim();
      pendingChinese = "";
      setGrammarStatus("本机法语词库即时翻译，无需联网。", "info");
      return;
    }
    if (pendingChinese === chinese) return;
    if (chinese === lastChinese && spelling.value.trim() && spelling.value.trim() === lastMachineFrench) return;
    const hasLocalPreview = localPreviewChinese === chinese && !!spelling.value.trim();
    lastChinese = chinese;
    pendingChinese = chinese;
    userEditedCombined = false;
    const requestId = ++activeRequest;
    if (!hasLocalPreview) {
      spelling.value = "";
      setFrenchResult("");
      lastMachineFrench = "";
      setGrammarStatus("");
    }
    setMeta("");

    // Resolve the dedicated French lexicon locally before any network request.
    // A complete local hit is final; only missing terms are eligible for online completion.
    const localTools = window.DWSSFrenchTools;
    let localDraft = null;
    try {
      if (localTools && typeof localTools.translateOfflineChinese === "function") {
        localDraft = localTools.translateOfflineChinese(chinese);
      }
      if ((!localDraft || !String(localDraft.words || "").trim()) &&
          localTools && typeof localTools.prepareOfflineChinese === "function") {
        localDraft = await localTools.prepareOfflineChinese(chinese);
      }
    } catch (_) {}
    if (requestId !== activeRequest) return;
    if (localDraft && String(localDraft.words || "").trim() && String(localDraft.reading || "").trim()) {
      const misses = Array.isArray(localDraft.misses) ? localDraft.misses : [];
      spelling.value = String(localDraft.words).trim();
      localPreviewChinese = chinese;
      setFrenchResult(localDraft.reading);
      if (misses.length === 0) {
        localPreviewCompleteChinese = chinese;
        lastMachineFrench = spelling.value.trim();
        pendingChinese = "";
        setGrammarStatus("本机法语词库即时翻译，无需联网。", "info");
        await renderPronunciation(spelling.value.trim(), requestId);
        return;
      }
      localPreviewCompleteChinese = "";
      lastMachineFrench = "";
      setGrammarStatus("本机法语词库已匹配部分内容；正在联网补全未收录部分。", "info");
    } else {
      localPreviewCompleteChinese = "";
    }

    try {
      let data = translationCache.get(chinese);
      const fromCache = !!data;
      if (!data) {
        if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("当前处于离线状态");
        data = await apiCall({ action: "translate", text: chinese });
        data.at = Date.now();
        translationCache.set(chinese, data);
        if (translationCache.size > 100) translationCache.delete(translationCache.keys().next().value);
        persistTranslations();
      }
      if (requestId !== activeRequest) return;
      if (!isFrenchMode() || String(input.value || "").trim() !== chinese) {
        pendingChinese = "";
        return;
      }
      const rawFrench = String(data.translatedText || "").trim();
      const numberTools = window.DWSSFrenchTools;
      const french = numberTools && typeof numberTools.expandFrenchNumerals === "function"
        ? numberTools.expandFrenchNumerals(rawFrench) : rawFrench;
      if (!french) throw new Error("empty translation");
      spelling.value = french;
      lastMachineFrench = french;
      localPreviewChinese = "";
      await renderPronunciation(french, requestId);
      if (requestId !== activeRequest) return;
      if (fromCache || data.cached || (typeof navigator !== "undefined" && navigator.onLine === false)) {
        if (requestId === activeRequest) pendingChinese = "";
        setGrammarStatus("使用本机已保存的法语译文。", "info");
        return;
      }
      // Do not block the visible result on a second third-party grammar request.
      if (requestId === activeRequest) {
        pendingChinese = "";
        setGrammarStatus("在线法语译文已生成；已跳过额外语法校对以减少等待。", "info");
      }
    } catch (_) {
      if (requestId !== activeRequest) return;
      pendingChinese = "";
      if (localPreviewChinese === chinese && spelling.value.trim()) {
        const offline = typeof navigator !== "undefined" && navigator.onLine === false;
        setGrammarStatus(offline
          ? "当前离线，保留本地词库结果；未收录的表达需要联网翻译。"
          : "在线翻译暂不可用，暂时保留本地词库结果。", "error");
        return;
      }
      setGrammarStatus("法语翻译暂不可用，请稍后重试。", "error");
      setMeta("");
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
    const input = $("inputText");
    const spelling = $("dwssFrenchSpelling");
    const chinese = String(input && input.value || "").trim();
    if (!chinese) {
      pendingChinese = "";
      activeRequest += 1;
      lastChinese = "";
      lastMachineFrench = "";
      localPreviewChinese = "";
      localPreviewCompleteChinese = "";
      if (spelling) spelling.value = "";
      setFrenchResult("");
      setMeta("");
      setGrammarStatus("");
      const tools = window.DWSSFrenchTools;
      if (tools && typeof tools.renderSingleGloss === "function") tools.renderSingleGloss("", "");
    } else if (chinese !== lastChinese) {
      activeRequest += 1;
      pendingChinese = "";
      lastChinese = chinese;
      lastMachineFrench = "";
      localPreviewCompleteChinese = "";
      userEditedCombined = false;
      const hasLocalPreview = showInstantLocalDraft(chinese);
      if (localPreviewCompleteChinese !== chinese) {
        const cached = translationCache.get(chinese);
        if (cached && cached.translatedText) {
          showCachedTranslation(chinese, cached);
        } else if (!hasLocalPreview) {
          localPreviewChinese = "";
          if (spelling) spelling.value = "";
          setFrenchResult("");
          const tools = window.DWSSFrenchTools;
          if (tools && typeof tools.renderSingleGloss === "function") tools.renderSingleGloss(chinese, "");
          setGrammarStatus("正在本地查找法语词库；未收录内容联网后补全。", "info");
        }
      }
      if (localPreviewCompleteChinese === chinese) return;
    }
    translateTimer = window.setTimeout(() => translateCurrentChinese(), delay == null ? 60 : delay);
  }
  async function autoCheckFrenchGrammar(french, requestId) {
    const original = String(french || "").trim();
    if (!original) return original;
    try {
      const result = await apiCall({ action: "check", text: original });
      if (requestId !== activeRequest) return original;
      return String(result.correctedText || original).trim() || original;
    } catch (_) {
      return original;
    }
  }
  function mirrorSwahiliResultStyle() {
    const source = $("resultReading");
    const target = $("resultFrenchReading");
    if (!source || !target) return;
    const empty = target.classList.contains("empty");
    target.className = source.className;
    target.classList.toggle("empty", empty);
    target.rows = source.rows || target.rows || 4;
    target.cols = source.cols || target.cols || 20;
    if (typeof window.getComputedStyle !== "function") return;
    const computed = window.getComputedStyle(source);
    const props = [
      "width","min-height","height","box-sizing","padding","border","border-radius",
      "background-color","color","font-family","font-size","font-weight","line-height",
      "letter-spacing","text-align","resize","box-shadow","outline","margin",
      "white-space","overflow-wrap"
    ];
    for (const prop of props) {
      const value = computed.getPropertyValue(prop);
      if (value) target.style.setProperty(prop, value, computed.getPropertyPriority(prop));
    }
  }
  function addGrammarControls() {
    const output = $("resultFrenchReading");
    if (!output || !output.parentElement) return;
    mirrorSwahiliResultStyle();
    output.readOnly = false;
    output.disabled = false;
    output.placeholder = "输入中文后翻译结果中文谐音会显示在这里";
    const sourceBlock = $("dwssFrenchSpellingBlock");
    if (sourceBlock) {
      sourceBlock.hidden = true;
      sourceBlock.style.setProperty("display", "none", "important");
    }
    const meta = $("dwssFrenchIpaMeta");
    if (meta) {
      meta.textContent = "";
      meta.hidden = true;
      meta.style.setProperty("display", "none", "important");
    }
    const correctionPanel = $("dwssFrenchCorrectionPanel");
    if (correctionPanel) {
      correctionPanel.hidden = true;
      correctionPanel.style.setProperty("display", "none", "important");
    }
    if (!$("dwssFrenchAutomaticGrammarNotice")) {
      const note = document.createElement("small");
      note.id = "dwssFrenchAutomaticGrammarNotice";
      note.textContent = "法语优先使用本机词库；未收录内容联网后调用机器翻译服务。";
      note.style.cssText = "display:block;margin:5px 2px 0;font-size:10px;line-height:1.4;color:#8995a5";
      output.insertAdjacentElement("afterend", note);
    }
  }
  function bind() {
    addGrammarControls();
    restorePersistentTranslations();
    const input = $("inputText");
    const spelling = $("dwssFrenchSpelling");
    if (!input || !spelling) return;
    input.addEventListener("compositionstart", () => { composing = true; });
    input.addEventListener("compositionend", () => { composing = false; scheduleTranslation(50); });
    input.addEventListener("input", () => { if (!composing) scheduleTranslation(60); });
    const frenchMode = $("dwssMainFrMode");
    if (frenchMode) frenchMode.addEventListener("click", () => scheduleTranslation(60));
    const swMode = $("dwssMainSwMode");
    if (swMode) swMode.addEventListener("click", () => { window.clearTimeout(translateTimer); pendingChinese = ""; activeRequest += 1; });
    const translateButton = $("translateBtn");
    if (translateButton) translateButton.addEventListener("click", () => scheduleTranslation(60));
    const clearButton = $("clearBtn");
    if (clearButton) clearButton.addEventListener("click", () => scheduleTranslation(60));
    spelling.addEventListener("input", () => {
      if (!isFrenchMode()) return;
      const french = String(spelling.value || "").trim();
      setGrammarStatus("");
      pendingChinese = "";
      lastMachineFrench = french;
      const requestId = ++activeRequest;
      if (french) {
        window.setTimeout(() => renderPronunciation(french, requestId), 260);
      } else {
        setFrenchResult("");
        setMeta("");
      }
    });
    const combinedOutput = $("resultFrenchReading");
    if (combinedOutput) {
      combinedOutput.addEventListener("input", () => {
        if (writingCombinedOutput) return;
        userEditedCombined = true;
        combinedOutput.classList.toggle("empty", !String(combinedOutput.value || "").trim());
        const parsed = parseCombinedResult(combinedOutput.value);
        const french = String(parsed.french || "").trim();
        if (!french || french === String(spelling.value || "").trim()) return;
        spelling.value = french;
        lastMachineFrench = french;
        pendingChinese = "";
        const requestId = ++activeRequest;
        window.clearTimeout(combinedEditTimer);
        combinedEditTimer = window.setTimeout(() => {
          renderPronunciation(french, requestId).catch(() => {});
        }, 420);
      });

    }
    if (isFrenchMode()) scheduleTranslation(50);
  }
  window.DWSSFrenchMachineTranslationController = Object.freeze({
    translateCurrentChinese,
    scheduleTranslation,
    restorePersistentTranslations,
    isFrenchMode
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once: true });
  else bind();
})(window, document);
