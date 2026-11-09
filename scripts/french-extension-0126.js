(function (window, document) {
  "use strict";

  const DATA_URL = "./french-ipa-index.tsv.gz";
  const SEPARATOR = "¦";
  let loadPromise = null;
  let rows = [];
  let firstRanges = new Map();
  let meaningRows = [];
  let activeMeaningIndex = new Map();
  let activeMainMode = "sw";
  let activeQueryMode = "sw";
  let mainTimer = null;
  let queryTimer = null;
  let lastMainMatches = [];

  function ipaToChinese(ipa) {
    const vowels = ["ɑ̃","ɛ̃","ɔ̃","œ̃","ɑ","a","e","ɛ","i","o","ɔ","u","y","ø","œ","ə"];
    const onset = {
      b:"波",p:"普",t:"特",d:"德",k:"克",g:"格",f:"夫",v:"维",s:"斯",z:"兹",
      "ʃ":"施","ʒ":"日",m:"姆",n:"呢",l:"勒","ʁ":"赫",j:"耶",w:"乌","ɥ":"于","ɲ":"尼","ŋ":"昂",
      tʁ:"特赫",dʁ:"德赫",tr:"特赫",dr:"德赫",pl:"普勒",bl:"布勒",fl:"弗勒",kl:"克勒",
      gl:"格勒",kr:"克赫",gr:"格赫",fr:"弗赫",vr:"维赫",br:"布赫",pr:"普赫",sp:"斯普",st:"斯特",sk:"斯克"
    };
    const rime = {
      "ɑ̃":"昂","ɛ̃":"安","ɔ̃":"翁","œ̃":"恩","ɑ":"阿",a:"阿",e:"诶","ɛ":"艾",i:"伊",o:"欧","ɔ":"奥",u:"乌",y:"于","ø":"厄","œ":"厄","ə":"呃"
    };
    const coda = {
      "ʁ":"赫","ʃ":"施",s:"斯",z:"兹",t:"特",d:"德",k:"克",g:"格",p:"普",b:"波",m:"姆",n:"恩",l:"勒",f:"夫",v:"维",j:"伊","ɲ":"尼","ŋ":"昂"
    };
    const cv = {
      "bɑ̃":"邦","bɔ̃":"邦",ba:"巴","bɑ":"巴",bo:"波","bɔ":"博",bu:"布",be:"贝","bɛ":"贝","bɛ̃":"班",bi:"比",by:"比",
      "pɑ̃":"庞","pɔ̃":"旁",pa:"帕","pɑ":"帕",po:"坡","pɔ":"泊",pu:"普",pe:"佩","pɛ":"派","pɛ̃":"潘",pi:"皮",py:"匹",
      "tɑ̃":"唐","tɔ̃":"通",ta:"塔","tɑ":"塔",to:"托","tɔ":"托",tu:"图",te:"特","tɛ":"泰","tɛ̃":"滩",ti:"提",ty:"提",
      "dɑ̃":"当","dɔ̃":"东",da:"达","dɑ":"达",do:"多","dɔ":"多",du:"杜",de:"德","dɛ":"代","dɛ̃":"丹",di:"迪",dy:"迪",
      "kɑ̃":"康","kɔ̃":"空",ka:"卡","kɑ":"卡",ko:"科","kɔ":"科",ku:"库",ke:"克","kɛ":"凯","kɛ̃":"开",ki:"基",ky:"基",
      "gɑ̃":"刚","gɔ̃":"公",ga:"嘎","gɑ":"嘎",go:"戈","gɔ":"戈",gu:"古",ge:"格","gɛ":"盖","gɛ̃":"干",gi:"吉",gy:"吉",
      "fɑ̃":"方","fɔ̃":"丰",fa:"法","fɑ":"法",fo:"佛","fɔ":"佛",fu:"夫",fe:"费","fɛ":"费","fɛ̃":"芬",fi:"菲",fy:"菲",
      "vɑ̃":"汪","vɔ̃":"翁",va:"瓦","vɑ":"瓦",vo:"沃","vɔ":"沃",vu:"乌",ve:"维","vɛ":"韦","vɛ̃":"万",vi:"维",vy:"维",
      "sɑ̃":"桑","sɔ̃":"松",sa:"萨","sɑ":"萨",so:"索","sɔ":"索",su:"苏",se:"塞","sɛ":"赛","sɛ̃":"森",si:"西",sy:"西",
      "zɑ̃":"藏","zɔ̃":"宗",za:"扎","zɑ":"扎",zo:"佐","zɔ":"佐",zu:"祖",ze:"泽","zɛ":"宅","zɛ̃":"赞",zi:"兹",zy:"兹",
      "ʃɑ̃":"尚","ʃɔ̃":"尚","ʃa":"沙","ʃɑ":"沙","ʃo":"肖","ʃɔ":"肖","ʃu":"舒","ʃe":"谢","ʃɛ":"谢","ʃɛ̃":"山","ʃi":"西","ʃy":"许",
      "ʒɑ̃":"让","ʒɔ̃":"让","ʒa":"扎","ʒɑ":"扎","ʒo":"热","ʒɔ":"若","ʒu":"茹","ʒe":"热","ʒɛ":"热","ʒɛ̃":"让","ʒi":"日","ʒy":"茹",
      "mɑ̃":"芒","mɔ̃":"蒙",ma:"马","mɑ":"马",mo:"莫","mɔ":"莫",mu:"姆",me:"梅","mɛ":"麦","mɛ̃":"曼",mi:"米",my:"米",
      "nɑ̃":"南","nɔ̃":"农",na:"纳","nɑ":"纳",no:"诺","nɔ":"诺",nu:"努",ne:"内","nɛ":"奈","nɛ̃":"南",ni:"尼",ny:"纽",
      "lɑ̃":"朗","lɔ̃":"隆",la:"拉","lɑ":"拉",lo:"洛","lɔ":"洛",lu:"卢",le:"勒","lɛ":"莱","lɛ̃":"兰",li:"里",ly:"吕",
      "ʁɑ̃":"让","ʁɔ̃":"让","ʁa":"拉","ʁɑ":"拉","ʁo":"若","ʁɔ":"若","ʁu":"赫","ʁe":"热","ʁɛ":"赖","ʁɛ̃":"兰","ʁi":"里","ʁy":"于",
      wa:"瓦","wɑ":"瓦","wɛ":"韦",wi:"威","wɔ":"沃",wo:"沃","ɥi":"于伊","ɥɛ":"于艾",ja:"亚","jɑ":"亚",je:"耶","jɛ":"耶",jo:"约",ju:"优",jy:"于"
    };
    const phonemes = ["tʃ","dʒ","ʁ","ʃ","ʒ","ɲ","ŋ","ɥ","j","w","b","p","t","d","k","g","f","v","s","z","m","n","l","h"];
    function tokenize(s) {
      const out = [];
      let i = 0;
      while (i < s.length) {
        const hit = phonemes.find(p => s.startsWith(p, i));
        if (hit) { out.push(hit); i += hit.length; } else { out.push(s[i]); i += 1; }
      }
      return out;
    }
    const raw = String(ipa || "").trim().replace(/^\/|\/$/g, "").split(/[;,]/)[0]
      .toLowerCase().replace(/[ˈˌːˑ‿]/g, "");
    if (!raw) return "";
    const output = [];
    for (const syllable of raw.split(/[.\s]+/).filter(Boolean)) {
      let nucleus = "";
      let pos = -1;
      for (let i = 0; i < syllable.length; i += 1) {
        const v = vowels.find(x => syllable.startsWith(x, i));
        if (v) { nucleus = v; pos = i; break; }
      }
      if (pos < 0) {
        output.push(tokenize(syllable).map(t => coda[t] || "").join("") || "呃");
        continue;
      }
      const onsetText = syllable.slice(0, pos);
      const codaText = syllable.slice(pos + nucleus.length);
      let rendered = cv[onsetText + nucleus];
      if (!rendered) {
        rendered = onset[onsetText] || tokenize(onsetText).map(t => onset[t] || "").join("");
        rendered += rime[nucleus] || "";
      }
      rendered += tokenize(codaText).map(t => coda[t] || "").join("");
      output.push(rendered || "呃");
    }
    return output.join("");
  }

  function normalizeChinese(value) {
    return String(value == null ? "" : value).replace(/[\s，。！？；：、,.!?;:（）()"'“”‘’《》【】]/g, "").toLowerCase();
  }

  function translateChinese(raw, meaningIndex) {
    const text = String(raw == null ? "" : raw);
    const byFirst = new Map();
    for (const key of meaningIndex.keys()) {
      if (!key) continue;
      const first = key[0];
      if (!byFirst.has(first)) byFirst.set(first, []);
      byFirst.get(first).push(key);
    }
    for (const keys of byFirst.values()) keys.sort((a, b) => b.length - a.length);
    const sounds = [];
    const words = [];
    const ipa = [];
    const misses = [];
    const glossSegments = [];
    const normalizedText = text;
    let i = 0;
    while (i < normalizedText.length) {
      const char = normalizedText[i];
      if (/[\s，。！？；：、,.!?;:（）()]/.test(char)) {
        sounds.push(char);
        i += 1;
        continue;
      }
      const keys = byFirst.get(char) || [];
      const matched = keys.find(key => normalizedText.startsWith(key, i));
      if (matched) {
        const list = meaningIndex.get(matched) || [];
        const record = list[0];
        if (record) {
          sounds.push(record.reading || "【法语读音待补】");
          words.push(record.word);
          if (record.ipa) ipa.push(record.word + " /" + record.ipa + "/");
          glossSegments.push({ type: "match", zh: matched, record });
        } else {
          sounds.push("【法语释义待补：" + matched + "】");
          misses.push(matched);
          glossSegments.push({ type: "missing", zh: matched });
        }
        i += matched.length;
        continue;
      }
      let j = i + 1;
      while (j < normalizedText.length && !/[\s，。！？；：、,.!?;:（）()]/.test(normalizedText[j]) && !(byFirst.get(normalizedText[j]) || []).length) j += 1;
      const unknown = normalizedText.slice(i, j);
      sounds.push("【未收录法语：" + unknown + "】");
      misses.push(unknown);
      glossSegments.push({ type: "missing", zh: unknown });
      i = j;
    }
    return { reading: sounds.join(" "), words: words.join(" "), ipa: ipa.join("；"), misses, glossSegments };
  }
  function renderFrenchSingleGloss(raw) {
    const label = $("singleReadingGlossLabel") || document.querySelector(".dwss-secondary-title");
    const host = $("segmentList");
    const text = String(raw || "").trim();
    if (label) label.textContent = "单个法语读法释义：";
    if (!host) return;
    const parent = host.closest(".dwss-secondary-details");
    if (parent) parent.style.display = "block";
    if (!text) {
      host.innerHTML = '<div class="nores">输入中文后显示对应的法语单词、中文近似音和释义。</div>';
      return;
    }
    const result = translateChinese(text, activeMeaningIndex);
    const matches = [];
    const seen = new Set();
    for (const part of result.glossSegments || []) {
      if (part.type !== "match" || !part.record) continue;
      const key = normalizeChinese(part.zh) + "|" + String(part.record.word || "").toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push(part);
    }
    if (!matches.length) {
      host.innerHTML = '<div class="nores">法语词典暂未找到对应的单词释义；上方仍会显示整句法语翻译和中文近似音。</div>';
      return;
    }
    host.innerHTML = matches.map(part => {
      const record = part.record || {};
      const meanings = Array.isArray(record.meanings) ? record.meanings.slice(0, 4).join("；") : "";
      const ipa = record.ipa ? "/" + record.ipa + "/" : "音标待补";
      return '<div class="seg"><div class="zh">' + esc(part.zh) + '</div><div class="rd">' +
        '<strong>法语：' + esc(record.word || "待补") + '</strong>' +
        '<div class="rd-detail">中文近似音：' + esc(record.reading || "读音待补") + '</div>' +
        '<div class="rd-detail">IPA：' + esc(ipa) + '</div>' +
        '<div class="rd-detail">中文释义：' + esc(meanings || part.zh) + '</div>' +
        '</div></div>';
    }).join("");
  }

  window.DWSSFrenchTools = Object.freeze({ ipaToChinese, normalizeChinese, translateChinese, renderSingleGloss: renderFrenchSingleGloss });
  if (!document || !document.getElementById) return;

  const $ = id => document.getElementById(id);
  const esc = value => String(value == null ? "" : value).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[c]);
  const cleanIpa = value => String(value || "").replace(/^\/|\/$/g, "");
  function notifyStatus(message, type) {
    const el = $("dwssFrenchCorrectionStatus");
    if (el) {
      el.textContent = message;
      el.dataset.status = type || "info";
    }
  }
  function activeRows() {
    const out = [];
    const seen = new Set();
    const api = window.KolweziSwahili;
    if (api && typeof api.getCustom === "function") {
      for (const item of api.getCustom()) {
        if (!item || !item.zh || !item.french || !item.frenchReadingZh) continue;
        const key = normalizeChinese(item.zh) + "|" + String(item.french).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          word: String(item.french).trim(),
          ipa: "",
          reading: String(item.frenchReadingZh).trim(),
          meanings: [String(item.zh).trim()],
          source: "本机用户修正"
        });
      }
    }
    const shared = window.DWSSSharedLexicon;
    if (shared && typeof shared.getTerms === "function") {
      for (const item of shared.getTerms() || []) {
        const word = String(item.french_text || "").trim();
        const zh = String(item.chinese_text || "").trim();
        const reading = String(item.french_pronunciation_cn || "").trim();
        if (!word || !zh || !reading) continue;
        const key = normalizeChinese(zh) + "|" + word.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ word, ipa: "", reading, meanings: [zh], source: item.__pending ? "待同步法语修正" : "云端共享修正" });
      }
    }
    return out;
  }

  function createMeaningIndex() {
    const map = new Map();
    const custom = activeRows();
    for (const item of custom) {
      for (const meaning of item.meanings || []) {
        const key = normalizeChinese(meaning);
        if (!key) continue;
        if (!map.has(key)) map.set(key, []);
        map.get(key).unshift(item);
      }
    }
    for (const row of meaningRows) {
      const meanings = row.meanings || [];
      for (const meaning of meanings) {
        const key = normalizeChinese(meaning);
        if (!key) continue;
        if (!map.has(key)) map.set(key, []);
        const list = map.get(key);
        if (!list.some(x => String(x.word).toLowerCase() === String(row.word).toLowerCase())) list.push(row);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        const ap = a.source && a.source.indexOf("修正") >= 0 ? 0 : 1;
        const bp = b.source && b.source.indexOf("修正") >= 0 ? 0 : 1;
        if (ap !== bp) return ap - bp;
        const aw = String(a.word || "");
        const bw = String(b.word || "");
        return aw.length - bw.length || aw.localeCompare(bw);
      });
    }
    return map;
  }

  async function loadLexicon() {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      const response = await fetch(DATA_URL);
      if (!response.ok) throw new Error("法语词库文件加载失败（HTTP " + response.status + "）。");
      if (typeof DecompressionStream === "undefined") throw new Error("当前浏览器不支持离线词库解压，请更新浏览器或安卓应用内核。");
      const decompressed = await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).text();
      const lines = decompressed.split(/\r?\n/);
      const rangeMap = new Map();
      rows = [];
      meaningRows = [];
      for (const line of lines) {
        if (!line) continue;
        const fields = line.split("\t");
        if (fields.length < 4) continue;
        const pinyin = fields[0];
        const first = pinyin.split(" ")[0];
        if (!first) continue;
        const rowIndex = rows.length;
        rows.push(line);
        const range = rangeMap.get(first);
        if (range) range.end = rowIndex + 1;
        else rangeMap.set(first, { start: rowIndex, end: rowIndex + 1 });
        const meanings = (fields[4] || "").split("¦").map(x => x.trim()).filter(Boolean);
        if (meanings.length) {
          meaningRows.push({
            word: fields[1], ipa: cleanIpa(fields[2]), reading: fields[3],
            meanings, source: "FreeDict 法中词典"
          });
        }
      }
      firstRanges = rangeMap;
      activeMeaningIndex = createMeaningIndex();
      if (rows.length < 200000 || meaningRows.length < 9000) throw new Error("法语词库载入数量异常，已停止使用不完整词库。");
      return { rows: rows.length, glossed: meaningRows.length };
    })().catch(error => {
      loadPromise = null;
      throw error;
    });
    return loadPromise;
  }

  function formatCombinedFrenchResult(french, reading) {
    const helper = window.DWSSFrenchCombinedResult;
    if (helper && typeof helper.format === "function") return helper.format(french, reading);
    return "法语原文：" + String(french || "") + "\n中文近似音：" + String(reading || "");
  }

  function renderMainFrench() {
    // The sentence-level translation runtime is authoritative for the main result.
    // Keep this legacy dictionary renderer only as a fallback when that runtime
    // is absent; otherwise both modules race to overwrite the same result field.
    const machineRuntime = window.DWSSFrenchMachineTranslationController;
    if (machineRuntime && typeof machineRuntime.translateCurrentChinese === "function") return;

    const input = $("inputText");
    const output = $("resultFrenchReading");
    if (!input || !output || activeMainMode !== "fr") return;
    if (!rows.length) {
      output.value = "";
      output.placeholder = "法语词库加载中…";
      return;
    }
    const raw = String(input.value || "").trim();
    const spelling = $("dwssFrenchSpelling");
    if (!raw) {
      output.value = "";
      output.classList.add("empty");
      output.placeholder = "法语原文：\n中文近似音：";
      if (spelling) spelling.value = "";
      const meta = $("dwssFrenchIpaMeta");
      if (meta) meta.textContent = "";
      lastMainMatches = [];
      return;
    }
    const result = translateChinese(raw, activeMeaningIndex);
    output.value = formatCombinedFrenchResult(result.words, result.reading);
    output.classList.toggle("empty", !result.reading);
    if (spelling) spelling.value = result.words;
    const meta = $("dwssFrenchIpaMeta");
    if (meta) meta.textContent = "";
    lastMainMatches = result.words ? result.words.split(/\s+/).filter(Boolean) : [];
    const resultCard = $("resultCard");
    if (resultCard) resultCard.dataset.dwssLang = "fr";
  }

  function setMainMode(mode) {
    activeMainMode = mode === "fr" ? "fr" : "sw";
    const card = $("resultCard");
    const heading = card && card.querySelector(".sectionTitle h2");
    const sw = $("dwssMainSwMode");
    const fr = $("dwssMainFrMode");
    if (card) {
      if (activeMainMode === "fr") card.dataset.dwssLang = "fr";
      else delete card.dataset.dwssLang;
    }
    if (heading) heading.textContent = activeMainMode === "fr" ? "法语翻译中文谐音：" : "斯语翻译中文谐音：";
    if (sw) { sw.classList.toggle("active", activeMainMode === "sw"); sw.setAttribute("aria-pressed", activeMainMode === "sw" ? "true" : "false"); }
    if (fr) { fr.classList.toggle("active", activeMainMode === "fr"); fr.setAttribute("aria-pressed", activeMainMode === "fr" ? "true" : "false"); }
    if (activeMainMode === "fr") {
      $("resultFrenchReading").hidden = false;
      $("dwssFrenchSpellingBlock").hidden = true;
      $("dwssFrenchSpellingBlock").style.setProperty("display", "none", "important");
      const frenchCorrectionPanel = $("dwssFrenchCorrectionPanel");
      if (frenchCorrectionPanel) frenchCorrectionPanel.hidden = true;
      $("translationCorrectionPanel").hidden = true;
      $("resultReading").hidden = true;
      const currentChinese = String($("inputText") && $("inputText").value || "").trim();
      const refreshFrenchMode = () => {
        renderMainFrench();
        renderFrenchSingleGloss(currentChinese);
      };
      loadLexicon().then(refreshFrenchMode).catch(error => {
        $("resultFrenchReading").value = "";
        $("resultFrenchReading").placeholder = "法语词库暂时无法加载";
        $("dwssFrenchIpaMeta").textContent = error.message || String(error);
        renderFrenchSingleGloss(currentChinese);
      });
      refreshFrenchMode();
      const machine = window.DWSSFrenchMachineTranslationController;
      if (machine && typeof machine.scheduleTranslation === "function") machine.scheduleTranslation(80);
    } else {
      $("resultFrenchReading").hidden = true;
      $("dwssFrenchSpellingBlock").hidden = true;
      const frenchCorrectionPanel = $("dwssFrenchCorrectionPanel");
      if (frenchCorrectionPanel) frenchCorrectionPanel.hidden = true;
      $("resultReading").hidden = false;
      $("translationCorrectionPanel").hidden = false;
      const glossLabel = $("singleReadingGlossLabel") || document.querySelector(".dwss-secondary-title");
      if (glossLabel) glossLabel.textContent = "单个斯语读法释义：";
      if (typeof window.DWSSRenderTranslation === "function") window.DWSSRenderTranslation();
    }
  }

  async function saveFrenchCorrection() {
    const raw = String($("inputText") && $("inputText").value || "").trim();
    const combined = String($("resultFrenchReading") && $("resultFrenchReading").value || "").trim();
    const parsed = window.DWSSFrenchCombinedResult && typeof window.DWSSFrenchCombinedResult.parse === "function"
      ? window.DWSSFrenchCombinedResult.parse(combined) : {};
    const french = String(parsed.french || ($("dwssFrenchSpelling") && $("dwssFrenchSpelling").value) || "").trim();
    const reading = String(parsed.reading || (!parsed.french ? combined : "")).trim();
    if (!raw || !french || !reading) {
      notifyStatus("请确认法语原文和中文近似音都已填写。", "error");
      return;
    }
    if (raw.length > 100 || french.length > 200 || reading.length > 200) {
      notifyStatus("共享词条长度有限：中文最多 100 字，法语原文和中文谐音各最多 200 字。请缩短或拆分后再提交。", "error");
      return;
    }
    const api = window.KolweziSwahili;
    if (!api || typeof api.addCustom !== "function") {
      notifyStatus("本机词库接口暂未就绪。请刷新应用后重试。", "error");
      return;
    }
    const button = $("dwssSaveFrenchCorrection");
    button.disabled = true;
    button.textContent = "正在保存并同步…";
    try {
      const result = api.addCustom({
        zh: raw,
        reading: "",
        latin: "",
        french,
        frenchReadingZh: reading,
        category: "日常生活",
        source: "DWSS 法语词典用户修正",
        note: "用户修正法语原文与中文近似音"
      });
      if (!result || !result.ok) {
        notifyStatus(result && result.error ? result.error : "法语修正保存失败，请重试。", "error");
        return;
      }
      const spelling = $("dwssFrenchSpelling");
      if (spelling) spelling.value = french;
      activeMeaningIndex = createMeaningIndex();
      notifyStatus("法语修正已保存到本机，并已进入共享同步队列；联网后同步给所有用户。", "ok");
      renderMainFrench();
    } catch (error) {
      notifyStatus("保存失败：" + String(error && error.message || error), "error");
    } finally {
      button.disabled = false;
      button.textContent = "提交法语修正并同步所有用户";
    }
  }

  function nearFirstKeys(first, engine) {
    if (firstRanges.has(first)) return [first];
    const keys = [];
    for (const key of firstRanges.keys()) {
      const distance = typeof engine.syllableDistance === "function" ? engine.syllableDistance(first, key) : (first === key ? 0 : 9);
      if (distance <= 1) keys.push({ key, distance });
    }
    keys.sort((a, b) => a.distance - b.distance || a.key.localeCompare(b.key));
    return keys.slice(0, 6).map(x => x.key);
  }

  function rowsForFirst(firstKeys, cap) {
    const candidates = [];
    const seenWords = new Set();
    for (const first of firstKeys) {
      const range = firstRanges.get(first);
      if (!range) continue;
      for (let i = range.start; i < range.end && candidates.length < cap; i += 1) {
        const fields = rows[i].split("\t");
        if (fields.length < 4 || !fields[1] || !fields[3]) continue;
        const key = fields[1].toLowerCase();
        if (seenWords.has(key)) continue;
        seenWords.add(key);
        candidates.push({
          zh: fields[1],
          category: "法语",
          variants: [{
            reading: fields[3], latin: cleanIpa(fields[2]),
            source: "法语 IPA 词形库", kind: "法语词形",
            status: "canonical"
          }]
        });
      }
    }
    return candidates;
  }

  function customQueryCandidates() {
    return activeRows().map(item => ({
      zh: item.word,
      category: "法语共享修正",
      variants: [{ reading: item.reading, latin: item.ipa || "", source: item.source || "用户修正", kind: "法语共享修正", status: "confirmed" }]
    }));
  }

  function copyText(value, button) {
    const original = button.textContent;
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(value);
        button.textContent = "已复制";
      } catch (_) {
        const field = document.createElement("textarea");
        field.value = value;
        document.body.appendChild(field);
        field.select();
        const ok = document.execCommand("copy");
        field.remove();
        button.textContent = ok ? "已复制" : "复制失败";
      }
      window.setTimeout(() => { button.textContent = original; }, 1300);
    };
    copy();
  }

  async function renderFrenchQuery() {
    const input = $("pronunciationFrenchSearch");
    const host = $("pronunciationFrenchResults");
    if (!input || !host || activeQueryMode !== "fr") return;
    const query = String(input.value || "").trim();
    if (!query) { host.innerHTML = ""; return; }
    const engine = window.DWSSPronunciationSearch;
    if (!engine || typeof engine.search !== "function" || typeof engine.toSyllables !== "function") {
      host.innerHTML = '<div class="nores">法语发音匹配组件尚未载入，请检查更新后重试。</div>';
      return;
    }
    await loadLexicon();
    const syllables = engine.toSyllables(query, true) || [];
    const first = syllables[0];
    if (!first) { host.innerHTML = '<div class="nores">没有识别到有效的中文近似音，请换一种同音字输入。</div>'; return; }
    const firstKeys = nearFirstKeys(first, engine);
    const candidates = rowsForFirst(firstKeys, 16000);
    candidates.push(...customQueryCandidates());
    const results = engine.search(query, candidates, { limit: 20 });
    const sourceMap = new Map();
    for (const item of candidates) sourceMap.set(String(item.zh).toLowerCase(), item);
    const unique = [];
    const seen = new Set();
    for (const result of results) {
      const key = String(result.zh || "").toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(result);
    }
    host.innerHTML = unique.map(result => {
      const item = sourceMap.get(String(result.zh || "").toLowerCase());
      const variant = item && item.variants && item.variants[0] || {};
      const score = Math.round((result.score || 0) * 100);
      const label = score >= 99 ? "读音一致" : "近似读音 " + score + "%";
      const meanings = (() => {
        const found = meaningRows.find(x => String(x.word).toLowerCase() === String(result.zh).toLowerCase());
        if (found && found.meanings && found.meanings.length) return found.meanings.slice(0, 3).join("；");
        const custom = activeRows().find(x => String(x.word).toLowerCase() === String(result.zh).toLowerCase());
        return custom && custom.meanings ? custom.meanings.join("；") : "暂无中文释义";
      })();
      const ipa = variant.latin ? "/" + variant.latin + "/" : "音标待补";
      const reading = variant.reading || result.matchedReading || "";
      return '<article class="pronunciation-hit"><div class="pronunciation-hit-main">' +
        '<div class="pronunciation-hit-zh">法语：' + esc(result.zh) + '<span class="pronunciation-match-chip">' + label + '</span></div>' +
        '<div class="pronunciation-hit-reading">中文近似发音：' + esc(reading) + '</div>' +
        '<div class="pronunciation-hit-meta">IPA 音标：' + esc(ipa) + '</div>' +
        '<div class="pronunciation-hit-meta">中文释义：' + esc(meanings) + '</div>' +
        '<div class="pronunciation-hit-meta">匹配读音：' + esc(result.matchedReading || reading) + '</div>' +
        '</div><div class="pronunciation-hit-actions">' +
        '<button class="soft mini" type="button" data-copy-french="' + esc(result.zh) + '">复制法语</button>' +
        '<button class="soft mini" type="button" data-copy-french-reading="' + esc(reading) + '">复制谐音</button>' +
        '</div></article>';
    }).join("") || '<div class="nores">没有找到足够接近的法语读音。可换一个同音或近音的中文字符再试；自动拟音只作参考。</div>';
    host.querySelectorAll("[data-copy-french]").forEach(button => button.addEventListener("click", () => copyText(button.dataset.copyFrench || "", button)));
    host.querySelectorAll("[data-copy-french-reading]").forEach(button => button.addEventListener("click", () => copyText(button.dataset.copyFrenchReading || "", button)));
  }

  function setQueryMode(mode) {
    activeQueryMode = mode === "fr" ? "fr" : "sw";
    const fr = activeQueryMode === "fr";
    const swButton = $("dwssPronSwMode");
    const frButton = $("dwssPronFrMode");
    const swInput = $("pronunciationSearch");
    const swResults = $("pronunciationResults");
    const swInstruction = document.querySelector("#pronunciation .pronunciation-lookup-instruction");
    const swMaint = document.querySelector("#pronunciation .pronunciation-maintenance-entry");
    const frPanel = $("dwssFrenchQueryPanel");
    if (swButton) { swButton.classList.toggle("active", !fr); swButton.setAttribute("aria-pressed", fr ? "false" : "true"); }
    if (frButton) { frButton.classList.toggle("active", fr); frButton.setAttribute("aria-pressed", fr ? "true" : "false"); }
    if (swInput) swInput.hidden = fr;
    if (swResults) swResults.hidden = fr;
    if (swInstruction) swInstruction.hidden = fr;
    if (swMaint) swMaint.hidden = fr;
    if (frPanel) frPanel.hidden = !fr;
    if (fr) {
      loadLexicon().then(() => renderFrenchQuery()).catch(error => {
        $("pronunciationFrenchResults").innerHTML = '<div class="nores">' + esc(error.message || String(error)) + '</div>';
      });
    }
  }

  function bind() {
    $("dwssMainSwMode").addEventListener("click", () => setMainMode("sw"));
    $("dwssMainFrMode").addEventListener("click", () => setMainMode("fr"));
    const frenchCorrectionButton = $("dwssSaveFrenchCorrection");
    if (frenchCorrectionButton) frenchCorrectionButton.addEventListener("click", saveFrenchCorrection);
    $("dwssPronSwMode").addEventListener("click", () => setQueryMode("sw"));
    $("dwssPronFrMode").addEventListener("click", () => setQueryMode("fr"));
    const scheduleMain = () => {
      if (activeMainMode !== "fr") return;
      window.clearTimeout(mainTimer);
      mainTimer = window.setTimeout(() => {
        const currentChinese = String($("inputText") && $("inputText").value || "").trim();
        const refreshFrenchMode = () => {
          renderMainFrench();
          renderFrenchSingleGloss(currentChinese);
        };
        if (!rows.length) loadLexicon().then(refreshFrenchMode).catch(error => {
          $("dwssFrenchIpaMeta").textContent = error.message || String(error);
          renderFrenchSingleGloss(currentChinese);
        });
        else refreshFrenchMode();
      }, 180);
    };
    $("inputText").addEventListener("input", scheduleMain);
    $("inputText").addEventListener("compositionend", scheduleMain);
    $("translateBtn").addEventListener("click", () => window.setTimeout(scheduleMain, 20));
    $("clearBtn").addEventListener("click", () => window.setTimeout(scheduleMain, 20));
    $("pronunciationFrenchSearch").addEventListener("input", () => {
      window.clearTimeout(queryTimer);
      queryTimer = window.setTimeout(() => renderFrenchQuery().catch(error => {
        $("pronunciationFrenchResults").innerHTML = '<div class="nores">' + esc(error.message || String(error)) + '</div>';
      }), 180);
    });
    const refresh = () => {
      if (rows.length) activeMeaningIndex = createMeaningIndex();
      if (activeMainMode === "fr") renderMainFrench();
      if (activeQueryMode === "fr" && $("pronunciationFrenchSearch").value.trim()) renderFrenchQuery().catch(() => {});
    };
    window.addEventListener("dwss:shared-terms-updated", refresh);
    window.addEventListener("dwss:personal-term-added", refresh);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once: true });
  else bind();
})(window, document);
