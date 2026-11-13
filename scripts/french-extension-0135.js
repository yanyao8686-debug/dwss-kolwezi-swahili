(function (window, document) {
  "use strict";

  const GLOSS_URL = "./french-gloss-index.tsv.gz";
  const META_URL = "./french-pronunciation-index.json";
  const SHARD_BASE = "./french-pronunciation-shards/";
  const SEPARATOR = "¦";
  let loadPromise = null;
  let firstKeys = [];
  let firstKeySet = new Set();
  let shardCache = new Map();
  const MAX_SHARD_CACHE = 12;
  let meaningRows = [];
  let meaningByWord = new Map();
  let frenchWordReadingByWord = new Map();
  let activeMeaningIndex = new Map();
  let activeRowsSignature = "";
  let activeMainMode = "sw";
  let mainModeGeneration = 0;
  let activeQueryMode = "sw";
  let mainTimer = null;
  let queryTimer = null;
  let lastMainMatches = [];
  const FRENCH_NEAR_INITIAL_GROUPS = [["b", "p"], ["d", "t"], ["g", "k"]];

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

  const CHINESE_NUMBER_DIGITS = Object.freeze({"零":0,"〇":0,"○":0,"一":1,"二":2,"两":2,"三":3,"四":4,"五":5,"六":6,"七":7,"八":8,"九":9,"壹":1,"贰":2,"叁":3,"肆":4,"伍":5,"陆":6,"柒":7,"捌":8,"玖":9});
  const CHINESE_NUMBER_SMALL_UNITS = Object.freeze({"十":10,"拾":10,"百":100,"佰":100,"千":1000,"仟":1000});
  const CHINESE_NUMBER_BIG_UNITS = Object.freeze({"万":10000,"萬":10000,"亿":100000000,"億":100000000});
  const CHINESE_NUMBER_CHARS = "负正零〇○一二两三四五六七八九十百千万亿点壹贰叁肆伍陆柒捌玖拾佰仟萬億";
  const FRENCH_NUMBER_READINGS = Object.freeze({
    zero:"泽赫欧",un:"恩",deux:"德",trois:"特赫瓦",quatre:"卡特赫",cinq:"桑克",six:"西斯",sept:"赛特",huit:"于伊特",neuf:"诺厄夫",dix:"迪斯",
    onze:"翁兹",douze:"杜兹",treize:"特赫艾兹",quatorze:"卡托赫兹",quinze:"坎兹",seize:"赛兹",vingt:"万",vingts:"万",trente:"特赫昂特",
    quarante:"卡赫昂特",cinquante:"桑康特",soixante:"苏瓦桑特",cent:"桑",cents:"桑",mille:"米勒",million:"米里翁",millions:"米里翁",
    milliard:"米里亚赫",milliards:"米里亚赫",et:"诶",moins:"姆万",virgule:"维赫居勒"
  });
  function parseChineseInteger(raw) {
    const chars=Array.from(String(raw||""));
    if(!chars.length)return null;
    if(chars.every(c=>Object.prototype.hasOwnProperty.call(CHINESE_NUMBER_DIGITS,c))){
      const n=Number(chars.map(c=>CHINESE_NUMBER_DIGITS[c]).join(""));
      return Number.isSafeInteger(n)?n:null;
    }
    let total=0,section=0,current=0,recognized=false;
    for(const c of chars){
      if(Object.prototype.hasOwnProperty.call(CHINESE_NUMBER_DIGITS,c)){current=CHINESE_NUMBER_DIGITS[c];recognized=true;}
      else if(Object.prototype.hasOwnProperty.call(CHINESE_NUMBER_SMALL_UNITS,c)){
        const u=CHINESE_NUMBER_SMALL_UNITS[c];section+=(current||(u===10?1:0))*u;current=0;recognized=true;
      }else if(Object.prototype.hasOwnProperty.call(CHINESE_NUMBER_BIG_UNITS,c)){
        const u=CHINESE_NUMBER_BIG_UNITS[c];section+=current;total+=(section||1)*u;section=0;current=0;recognized=true;
      }else return null;
    }
    const n=total+section+current;
    return recognized&&Number.isSafeInteger(n)?n:null;
  }
  function parseNumberLiteral(value) {
    const source=String(value==null?"":value).trim();
    if(!source)return null;
    const a=source.match(/^([+-]?)(\d+(?:,\d{3})*)(?:([.,])(\d+))?$/);
    if(a){
      const integer=Number(a[2].replace(/,/g,""));
      if(!Number.isSafeInteger(integer)||integer>999999999999)return null;
      return {negative:a[1]==="-",integer,fraction:a[4]||""};
    }
    let s=source,negative=false;
    if(s[0]==="负"){negative=true;s=s.slice(1);}else if(s[0]==="正")s=s.slice(1);
    if(!s||Array.from(s).some(c=>!CHINESE_NUMBER_CHARS.includes(c)))return null;
    const p=s.split("点");
    if(p.length>2||!p[0])return null;
    const integer=parseChineseInteger(p[0]);
    if(integer==null||integer>999999999999)return null;
    let fraction="";
    if(p.length===2){
      if(!p[1])return null;
      const ds=Array.from(p[1]).map(c=>Object.prototype.hasOwnProperty.call(CHINESE_NUMBER_DIGITS,c)?String(CHINESE_NUMBER_DIGITS[c]):"");
      if(ds.some(d=>!d))return null;
      fraction=ds.join("");
    }
    return {negative,integer,fraction};
  }
  function parseNumberAt(text, start) {
    const rest=String(text||"").slice(start);
    const a=rest.match(/^[+-]?\d+(?:,\d{3})*(?:[.,]\d+)?/);
    if(a){const p=parseNumberLiteral(a[0]);if(p)return {length:a[0].length,parts:p,raw:a[0]};}
    const c=rest.match(/^[负正]?[零〇○一二两三四五六七八九十百千万亿点壹贰叁肆伍陆柒捌玖拾佰仟萬億]+/);
    if(c){const p=parseNumberLiteral(c[0]);if(p)return {length:c[0].length,parts:p,raw:c[0]};}
    return null;
  }
  const FRENCH_SMALL_NUMBERS=["zéro","un","deux","trois","quatre","cinq","six","sept","huit","neuf","dix","onze","douze","treize","quatorze","quinze","seize"];
  const FRENCH_TENS={20:"vingt",30:"trente",40:"quarante",50:"cinquante",60:"soixante"};
  function frenchBelowHundred(n){
    if(n<=16)return FRENCH_SMALL_NUMBERS[n];
    if(n<20)return "dix-"+FRENCH_SMALL_NUMBERS[n-10];
    if(n<70){const t=Math.floor(n/10)*10,u=n%10;if(!u)return FRENCH_TENS[t];return FRENCH_TENS[t]+(u===1?" et un":"-"+FRENCH_SMALL_NUMBERS[u]);}
    if(n<80){const r=n-60;return r===11?"soixante et onze":"soixante-"+frenchBelowHundred(r);}
    if(n===80)return "quatre-vingts";
    return "quatre-vingt-"+frenchBelowHundred(n-80);
  }
  function frenchBelowThousand(n){
    if(n<100)return frenchBelowHundred(n);
    const h=Math.floor(n/100),r=n%100,head=h===1?"cent":frenchBelowHundred(h)+" cent";
    if(!r)return h>1?head+"s":head;
    return head+" "+frenchBelowHundred(r);
  }
  function frenchIntegerToWords(n){
    n=Number(n);if(!Number.isSafeInteger(n)||n<0||n>999999999999)return "";
    if(n<1000)return frenchBelowThousand(n);
    if(n>=1000000000){const g=Math.floor(n/1e9),r=n%1e9,h=frenchIntegerToWords(g)+(g===1?" milliard":" milliards");return r?h+" "+frenchIntegerToWords(r):h;}
    if(n>=1000000){const g=Math.floor(n/1e6),r=n%1e6,h=frenchIntegerToWords(g)+(g===1?" million":" millions");return r?h+" "+frenchIntegerToWords(r):h;}
    const g=Math.floor(n/1000),r=n%1000,h=g===1?"mille":frenchIntegerToWords(g)+" mille";
    return r?h+" "+frenchIntegerToWords(r):h;
  }
  function numberPartsToFrench(p){
    if(!p)return "";
    let w=frenchIntegerToWords(p.integer);
    if(p.fraction)w+=" virgule "+Array.from(p.fraction).map(d=>FRENCH_SMALL_NUMBERS[Number(d)]).join(" ");
    if(p.negative&&(p.integer!==0||p.fraction))w="moins "+w;
    return w.trim();
  }
  function frenchNumberWordKey(v){return String(v||"").normalize("NFKD").replace(/\p{M}/gu,"").toLowerCase().replace(/[^a-z]/g,"");}
  function getFrenchNumberWordReading(v){return FRENCH_NUMBER_READINGS[frenchNumberWordKey(v)]||"";}
  function frenchNumberPhraseReading(v){return Array.from(String(v||"").matchAll(/[\p{L}]+/gu),m=>m[0]).map(getFrenchNumberWordReading).filter(Boolean).join(" ");}
  function numberToFrench(v){return numberPartsToFrench(parseNumberLiteral(v));}
  function isNumericExpression(v){return !!parseNumberLiteral(String(v==null?"":v).trim());}
  function expandFrenchNumerals(value){return String(value==null?"":value).replace(/[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:[.,]\d+)?/g,m=>numberToFrench(m)||m);}

  const chineseMatcherCache = new WeakMap();
  function translateChinese(raw, meaningIndex) {
    const text = String(raw == null ? "" : raw);
    let byFirst = chineseMatcherCache.get(meaningIndex);
    if (!byFirst) {
      byFirst = new Map();
      for (const key of meaningIndex.keys()) {
        if (!key) continue;
        const first = key[0];
        if (!byFirst.has(first)) byFirst.set(first, []);
        byFirst.get(first).push(key);
      }
      for (const keys of byFirst.values()) keys.sort((a, b) => b.length - a.length);
      chineseMatcherCache.set(meaningIndex, byFirst);
    }
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
          const recordReading = getWordChineseReading(record);
          sounds.push(recordReading || "【法语读音待补】");
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
      const numeric = parseNumberAt(normalizedText, i);
      if (numeric) {
        const frenchNumber = numberPartsToFrench(numeric.parts);
        const numberReading = frenchNumberPhraseReading(frenchNumber);
        if (frenchNumber && numberReading) {
          const record = { word:frenchNumber, reading:numberReading, ipa:"", meanings:[numeric.raw], source:"法语数字自动转换" };
          sounds.push(numberReading); words.push(frenchNumber);
          glossSegments.push({ type:"match", zh:numeric.raw, record });
          i += numeric.length; continue;
        }
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
  function getWordChineseReading(record) {
    const item = record && typeof record === "object" ? record : {};
    const supplied = String(item.reading || "").trim();
    if (supplied && !/^(?:谐音待补|音标待补|读音待补)$/u.test(supplied)) return supplied;
    const ipa = String(item.ipa || "").trim();
    if (ipa) return ipaToChinese(ipa);
    return getFrenchNumberWordReading(item.word);
  }

  function tokenizeFrenchPhrase(value) {
    const source = String(value || "");
    const regex = /[\p{L}]+(?:['’][\p{L}]+)*/gu;
    const matches = Array.from(source.matchAll(regex));
    let cursor = 0;
    return matches.map((match, index) => {
      const start = Number(match.index || 0);
      const nextStart = index + 1 < matches.length
        ? Number(matches[index + 1].index || source.length)
        : source.length;
      const prefix = source.slice(cursor, start).replace(/\s+/g, "");
      const suffix = source.slice(start + match[0].length, nextStart).replace(/\s+/g, "");
      cursor = nextStart;
      return { word: match[0], display: prefix + match[0] + suffix, start, end: start + match[0].length };
    });
  }

  function replaceFrenchPhraseWords(phrase, replacements) {
    const source = String(phrase || "");
    const tokens = tokenizeFrenchPhrase(source);
    const values = Array.isArray(replacements) ? replacements : [];
    if (tokens.length !== values.length) {
      throw new Error("法语单词数量已变化，请重新生成逐词释义后再保存。");
    }
    let cursor = 0;
    let result = "";
    tokens.forEach((token, index) => {
      result += source.slice(cursor, token.start);
      result += String(values[index] == null ? "" : values[index]);
      cursor = token.end;
    });
    result += source.slice(cursor);
    return result;
  }

  function buildFrenchWordReadingLookup(sourceRows) {
    const map = new Map();
    for (const record of Array.isArray(sourceRows) ? sourceRows : []) {
      const word = String(record && record.word || "").trim();
      const tokens = tokenizeFrenchPhrase(word);
      if (tokens.length !== 1 || normalizeFrenchGlossKey(tokens[0].word) !== normalizeFrenchGlossKey(word)) continue;
      const key = normalizeFrenchGlossKey(tokens[0].word);
      const reading = getWordChineseReading(record);
      if (!key || !reading) continue;
      const previous = map.get(key);
      if (!previous || (!String(previous.reading || "").trim() && String(record.reading || "").trim())) map.set(key, record);
    }
    for (const [word, reading] of Object.entries(FRENCH_NUMBER_READINGS)) {
      const key = normalizeFrenchGlossKey(word);
      if (key && !map.has(key)) map.set(key, { word, ipa:"", reading, meanings:[], source:"内置法语数字读音" });
    }
    return map;
  }

  function buildFrenchPhraseFallback(segments) {
    const map = new Map();
    for (const part of Array.isArray(segments) ? segments : []) {
      const record = part && part.type === "match" ? part.record : null;
      if (!record) continue;
      const tokens = tokenizeFrenchPhrase(record.word);
      const readings = String(record.reading || "").trim().split(/\s+/).filter(Boolean);
      if (!tokens.length || tokens.length !== readings.length) continue;
      tokens.forEach((token, index) => {
        const key = normalizeFrenchGlossKey(token.word);
        if (key && !map.has(key)) map.set(key, { word: token.word, reading: readings[index], ipa: "" });
      });
    }
    return map;
  }

  function buildFrenchWordPairs(phrase, wordLookup, glossSegments, enrichedWordReadings) {
    const tokens = tokenizeFrenchPhrase(phrase);
    const fallback = buildFrenchPhraseFallback(glossSegments);
    const lookup = wordLookup && typeof wordLookup.get === "function" ? wordLookup : new Map();
    const enriched = enrichedWordReadings && typeof enrichedWordReadings.get === "function"
      ? enrichedWordReadings : null;
    return tokens.map(token => {
      const key = normalizeFrenchGlossKey(token.word);
      const enrichedRecord = enriched ? enriched.get(key) : null;
      const enrichedReading = enrichedRecord ? getWordChineseReading(enrichedRecord) : "";
      const record = enrichedReading ? enrichedRecord : (lookup.get(key) || fallback.get(key) || null);
      const reading = record ? getWordChineseReading(record) : getFrenchNumberWordReading(token.word);
      return {
        word: token.display, token: token.word, reading: reading || "谐音待补",
        start: token.start, end: token.end
      };
    });
  }

  function renderFrenchSingleGloss(raw, frenchOriginal, enrichedWordReadings) {
    const label = $("singleReadingGlossLabel") || document.querySelector(".dwss-secondary-title");
    const host = $("segmentList");
    const text = String(raw || "").trim();
    const original = String(frenchOriginal || "").trim();
    if (label) label.textContent = "单个法语读法释义：";
    if (!host) return;
    const parent = host.closest(".dwss-secondary-details");
    if (parent) parent.style.display = "block";
    host.classList.remove("dwss-french-word-grid");
    if (!text && !original) {
      host.dataset.frenchSourcePhrase = "";
      host.innerHTML = '<div class="nores">输入中文后显示单个法语读法释义。</div>';
      return;
    }
    const result = text ? translateChinese(text, activeMeaningIndex) : { words: "", glossSegments: [] };
    const phrase = original || result.words;
    const pairs = buildFrenchWordPairs(phrase, frenchWordReadingByWord, result.glossSegments, enrichedWordReadings);
    if (!pairs.length) {
      host.dataset.frenchSourcePhrase = phrase;
      host.innerHTML = '<div class="nores">暂未找到法语单词。</div>';
      return;
    }
    const samePhrase = String(host.dataset.frenchSourcePhrase || "") === phrase;
    const preserved = new Map();
    if (samePhrase) {
      host.querySelectorAll(".dwss-french-word-pair").forEach(row => {
        const index = Number(row.dataset.wordIndex);
        const wordInput = row.querySelector(".dwss-french-word-original");
        if (!wordInput) return;
        const originalWord = String(wordInput.dataset.originalWord || "");
        const word = String(wordInput.value || "");
        if (word !== originalWord) preserved.set(index, { originalWord, word });
      });
    }
    host.dataset.frenchSourcePhrase = phrase;
    const hasFinalReadings = !!(enrichedWordReadings && typeof enrichedWordReadings.get === "function");
    const isOnline = typeof navigator === "undefined" || navigator.onLine !== false;
    host.innerHTML = pairs.map((pair, index) => {
      const token = String(pair.token || pair.word || "").trim();
      const rawReading = String(pair.reading || "").trim();
      const reading = rawReading === "谐音待补"
        ? (!hasFinalReadings && isOnline ? "匹配中…" : (!isOnline ? "离线未缓存" : "未找到读音"))
        : rawReading;
      const previous = preserved.get(index);
      const keepPrevious = !!previous &&
        normalizeFrenchGlossKey(previous.originalWord) === normalizeFrenchGlossKey(token);
      const wordValue = keepPrevious ? previous.word : token;
      return '<div class="seg dwss-french-word-pair" data-word-index="' + index + '">' +
        '<div class="zh"><input class="dwss-french-word-edit dwss-french-word-original" type="text" maxlength="100" size="' + Math.max(5, Math.min(20, token.length + 2)) + '" ' +
        'data-original-word="' + esc(token) + '" value="' + esc(wordValue) + '" aria-label="法语单词' + (index + 1) + '" autocomplete="off"></div>' +
        '<div class="rd">法语：' +
        '<span class="dwss-french-word-pronunciation" aria-label="法语单词' + (index + 1) + '的中文谐音">' + esc(reading) + '</span></div>' +
        '</div>';
    }).join("");
    host.insertAdjacentHTML("afterbegin", '<div class="dwss-french-edit-hint">法语单词可直接修改；中文谐音请在上方结果框修改。</div>');
  }

  function normalizeFrenchGlossKey(value) {
    return String(value || "").normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .replace(/œ/gi, "oe").replace(/æ/gi, "ae")
      .toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function buildFrenchGlossLookup(sourceRows) {
    const map = new Map();
    for (const row of Array.isArray(sourceRows) ? sourceRows : []) {
      const key = normalizeFrenchGlossKey(row && row.word);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      const list = map.get(key);
      const meanings = Array.isArray(row.meanings) ? row.meanings.filter(Boolean) : [];
      for (const meaning of meanings) if (!list.includes(meaning)) list.push(meaning);
    }
    return map;
  }

  function findFrenchGloss(word) {
    const exact = meaningByWord.get(normalizeFrenchGlossKey(word));
    return exact && exact.length ? exact : [];
  }

  window.DWSSFrenchMeaningTools = Object.freeze({
    normalizeWord: normalizeFrenchGlossKey,
    buildLookup: buildFrenchGlossLookup
  });

  function translateOfflineChinese(raw) {
    const text = String(raw || "");
    refreshActiveMeaningIndex();
    if ((!activeMeaningIndex || !activeMeaningIndex.size) && !isNumericExpression(text)) return null;
    return translateChinese(text, activeMeaningIndex || new Map());
  }
  async function prepareOfflineChinese(raw) {
    await loadLexicon();
    return translateChinese(String(raw || ""), activeMeaningIndex);
  }
  async function getPhraseWordPairs(phrase) {
    await loadLexicon();
    refreshActiveMeaningIndex();
    return buildFrenchWordPairs(phrase, frenchWordReadingByWord, []);
  }
  window.DWSSFrenchTools = Object.freeze({
    ipaToChinese, normalizeChinese, translateChinese, translateOfflineChinese, prepareOfflineChinese,
    buildMeaningIndex: createMeaningIndex,
    getWordChineseReading, tokenizeFrenchPhrase, buildFrenchWordReadingLookup,
    buildFrenchWordPairs, getPhraseWordPairs, numberToFrench, isNumericExpression, expandFrenchNumerals,
    renderSingleGloss: renderFrenchSingleGloss, replaceFrenchPhraseWords
  });
  window.DWSSFrenchQueryTools = Object.freeze({
    syllableDistance: frenchSyllableDistance,
    nearFirstKeys,
    search: searchFrenchCandidates
  });
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
    const add = (wordValue, chineseValue, readingValue, source) => {
      const word = String(wordValue || "").trim();
      const zh = String(chineseValue || "").trim();
      const reading = String(readingValue || "").trim();
      if (!word || !zh || !reading) return;
      const key = normalizeChinese(zh) + "|" + word.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ word, ipa: "", reading, meanings: [zh], source });
    };

    // Pending offline corrections win immediately. Published corrections are newest-first,
    // so a later shared correction replaces an older pronunciation on every device.
    const shared = window.DWSSSharedLexicon;
    if (shared && typeof shared.getTerms === "function") {
      const all = (shared.getTerms() || []).filter(item => item && item.source_language === "fr");
      const pending = all.filter(item => item.__pending);
      const published = all.filter(item => !item.__pending).sort((a, b) =>
        String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")));
      for (const item of pending.concat(published)) {
        add(item.french_text, item.chinese_text,
          item.french_pronunciation_cn || item.frenchReadingZh,
          item.__pending ? "待同步法语修正" : "云端共享修正");
      }
    }

    const api = window.KolweziSwahili;
    if (api && typeof api.getCustom === "function") {
      for (const item of api.getCustom()) {
        if (!item || !item.zh || !item.french) continue;
        const word = String(item.french).trim();
        const suppliedReading = String(item.frenchReadingZh || "").trim();
        const generatedReading = suppliedReading ||
          (typeof api.frenchReading === "function" ? String(api.frenchReading(word) || "").trim() : "");
        add(word, item.zh, generatedReading, "本机用户修正");
      }
    }
    return out;
  }

  function createMeaningIndex(customRows) {
    const map = new Map();
    const custom = Array.isArray(customRows) ? customRows : activeRows();
    let customOrder = 0;
    for (const item of custom) {
      const prioritizedItem = Object.assign({}, item, { __dwssPriorityOrder: customOrder++ });
      for (const meaning of item.meanings || []) {
        const key = normalizeChinese(meaning);
        if (!key) continue;
        if (!map.has(key)) map.set(key, []);
        // activeRows() is newest-first; keep that order even when the older
        // French word happens to sort shorter or alphabetically earlier.
        map.get(key).push(prioritizedItem);
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
        if (ap === 0 && bp === 0) {
          return Number(a.__dwssPriorityOrder || 0) - Number(b.__dwssPriorityOrder || 0);
        }
        const aw = String(a.word || "");
        const bw = String(b.word || "");
        return aw.length - bw.length || aw.localeCompare(bw);
      });
    }
    return map;
  }

  function currentActiveRowsSignature(rows) {
    return JSON.stringify((Array.isArray(rows) ? rows : []).map(item => [
      normalizeChinese(item.meanings && item.meanings[0]),
      normalizeFrenchGlossKey(item.word),
      String(item.reading || "").trim(),
      String(item.ipa || "").trim()
    ]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
  }

  function refreshActiveMeaningIndex() {
    if (!meaningRows.length) return;
    const rows = activeRows();
    const signature = currentActiveRowsSignature(rows);
    if (signature === activeRowsSignature) return;
    activeRowsSignature = signature;
    activeMeaningIndex = createMeaningIndex(rows);
    // Put personal and locally queued/shared French corrections before base dictionary rows.
    frenchWordReadingByWord = buildFrenchWordReadingLookup([...rows, ...meaningRows]);
  }

  async function decompressGzip(response, label) {
    if (!response.ok) throw new Error(label + "加载失败（HTTP " + response.status + "）。");
    if (typeof DecompressionStream === "undefined") throw new Error("当前浏览器不支持离线词库解压，请更新安卓 WebView 或浏览器。");
    return new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).text();
  }

  async function loadLexicon() {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      const [metaResponse, glossResponse] = await Promise.all([
        fetch(META_URL, { cache: "no-cache" }),
        fetch(GLOSS_URL, { cache: "no-cache" })
      ]);
      if (!metaResponse.ok) throw new Error("法语发音索引加载失败（HTTP " + metaResponse.status + "）。");
      const meta = await metaResponse.json();
      const decompressed = await decompressGzip(glossResponse, "法语中译词典");
      const lines = decompressed.split(/\r?\n/);
      meaningRows = [];
      for (const line of lines) {
        if (!line) continue;
        const fields = line.split("\t");
        if (fields.length < 5 || !fields[1] || !fields[4]) continue;
        const meanings = (fields[4] || "").split("¦").map(x => x.trim()).filter(Boolean);
        if (!meanings.length) continue;
        meaningRows.push({
          word: fields[1],
          ipa: cleanIpa(fields[2]),
          reading: fields[3],
          meanings,
          confidence: fields[5] || "I",
          source: fields[6] || "FreeDict 法中释义 + LeXiK/IPA 发音"
        });
      }
      firstKeys = Array.isArray(meta.firstKeys) ? meta.firstKeys : [];
      firstKeySet = new Set(firstKeys);
      if (firstKeys.length < 100 || meaningRows.length < 9000 || Number(meta.formsWithIpa || 0) < 2000000) {
        throw new Error("法语分片词库或中译词典数量异常，已停止使用不完整词库。");
      }
      meaningByWord = buildFrenchGlossLookup(meaningRows);
      const userRows = activeRows();
      activeRowsSignature = currentActiveRowsSignature(userRows);
      frenchWordReadingByWord = buildFrenchWordReadingLookup([...userRows, ...meaningRows]);
      activeMeaningIndex = createMeaningIndex(userRows);
      return {
        forms: meta.formsWithIpa,
        glossed: meaningRows.length,
        shards: firstKeys.length,
        confidence: meta.confidenceCounts || {}
      };
    })().catch(error => {
      loadPromise = null;
      throw error;
    });
    return loadPromise;
  }

  async function loadPronunciationShard(first) {
    if (!firstKeySet.has(first)) return [];
    if (shardCache.has(first)) {
      const cached = shardCache.get(first);
      shardCache.delete(first);
      shardCache.set(first, cached);
      return cached;
    }
    const response = await fetch(SHARD_BASE + encodeURIComponent(first) + ".tsv.gz");
    const decompressed = await decompressGzip(response, "法语发音分片 " + first);
    const parsed = decompressed.split(/\r?\n/).filter(Boolean);
    shardCache.set(first, parsed);
    while (shardCache.size > MAX_SHARD_CACHE) {
      shardCache.delete(shardCache.keys().next().value);
    }
    return parsed;
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
      output.placeholder = "输入中文后翻译结果中文谐音会显示在这里";
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
    const modeGeneration = ++mainModeGeneration;
    const isCurrentFrenchMode = () => modeGeneration === mainModeGeneration && activeMainMode === "fr";
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
        // A delayed French dictionary load must never repaint the shared result
        // card after the user has switched back to Swahili.
        if (!isCurrentFrenchMode()) return;
        renderMainFrench();
        renderFrenchSingleGloss(currentChinese);
      };
      loadLexicon().then(refreshFrenchMode).catch(error => {
        if (!isCurrentFrenchMode()) return;
        $("resultFrenchReading").value = "";
        $("resultFrenchReading").placeholder = "法语词库暂时无法加载";
        $("dwssFrenchIpaMeta").textContent = error.message || String(error);
        renderFrenchSingleGloss(currentChinese);
      });
      refreshFrenchMode();
      const machine = window.DWSSFrenchMachineTranslationController;
      if (machine && typeof machine.scheduleTranslation === "function") machine.scheduleTranslation(50);
    } else {
      // Cancel delayed French input renders as soon as Swahili is selected.
      window.clearTimeout(mainTimer);
      mainTimer = null;
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

  function setupFrenchPronunciationEditor() {
    const output = $("resultFrenchReading");
    const glossHost = $("segmentList");
    if (!output || !output.parentElement || !glossHost || $("dwssFrenchPronunciationEditor")) return;

    // The main result is the only editable Chinese-homophone field.
    // The word gloss edits French spelling only; one save button below it
    // submits both the corrected phrase and the main result's homophone.
    output.readOnly = false;
    output.disabled = false;

    const style = document.createElement("style");
    style.textContent = [
      "#dwssFrenchPronunciationEditor{margin:8px 0 0!important;padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important}",
      "#dwssFrenchPronunciationEditor[hidden],#dwssFrenchPronunciationStatus[hidden]{display:none!important}",
      "#dwssFrenchPronunciationEditor .translation-correction-actions{justify-content:flex-start!important;margin:0!important;padding:0!important}",
      "#dwssFrenchPronunciationEditor #dwssFrenchPronunciationSave{min-height:40px!important;margin:0!important}"
    ].join("\n");
    document.head.appendChild(style);

    const wrap = document.createElement("div");
    wrap.id = "dwssFrenchPronunciationEditor";
    wrap.className = "translation-correction-panel";
    wrap.innerHTML =
      '<div class="translation-correction-actions">' +
      '<button id="dwssFrenchPronunciationSave" class="primary mini" type="button">保存并同步给所有用户</button>' +
      '</div>' +
      '<div id="dwssFrenchPronunciationStatus" class="translation-correction-status" role="status" aria-live="polite" hidden></div>';
    glossHost.insertAdjacentElement("afterend", wrap);

    const input = $("inputText");
    const spelling = $("dwssFrenchSpelling");
    const saveButton = $("dwssFrenchPronunciationSave");
    const status = $("dwssFrenchPronunciationStatus");
    let saving = false;
    let lastDraftSignature = "";

    const isFrenchMode = () => {
      const mode = $("dwssMainFrMode");
      return !output.hidden && (!mode || mode.classList.contains("active"));
    };
    const readWordRows = () => {
      if (!glossHost) return [];
      return Array.from(glossHost.querySelectorAll(".dwss-french-word-pair")).map(row => {
        const wordInput = row.querySelector(".dwss-french-word-original");
        if (!wordInput) return null;
        return {
          row,
          wordInput,
          word: String(wordInput.value || "").trim(),
          originalWord: String(wordInput.dataset.originalWord || "")
        };
      }).filter(Boolean);
    };
    const isPlaceholderReading = value => {
      const text = String(value || "").trim();
      return !text || ["谐音待补", "匹配中…", "离线未缓存", "未找到读音", "〔发音待补〕"].includes(text) ||
        /〔[^〕]*(?:待补|待核)[^〕]*〕/u.test(text);
    };
    const currentValues = () => {
      const chinese = String(input && input.value || "").trim();
      const readingFromResult = String(output.value || "").trim();
      const codec = window.DWSSFrenchCombinedResult;
      const parsed = codec && typeof codec.parse === "function"
        ? codec.parse(readingFromResult) : { french: "", reading: readingFromResult };
      const outputFrenchDraft = !!(parsed && parsed.french && !String(parsed.reading || "").trim());
      const baseFrench = String(
        parsed && parsed.french || (spelling && spelling.value) || ""
      ).trim();
      const rows = readWordRows();
      const tools = window.DWSSFrenchTools;
      const tokens = tools && typeof tools.tokenizeFrenchPhrase === "function"
        ? tools.tokenizeFrenchPhrase(baseFrench) : [];
      const sameSource = !outputFrenchDraft && !!baseFrench && !!glossHost &&
        String(glossHost.dataset.frenchSourcePhrase || "") === baseFrench &&
        tokens.length > 0 && tokens.length === rows.length;
      const rowsEdited = sameSource && rows.some(row => row.word !== row.originalWord);
      let french = baseFrench;
      const reading = outputFrenchDraft
        ? ""
        : String(parsed && parsed.reading || readingFromResult).trim();
      if (rowsEdited && tools && typeof tools.replaceFrenchPhraseWords === "function") {
        french = tools.replaceFrenchPhraseWords(baseFrench, rows.map(row => row.word));
      }
      return { chinese, french, reading, baseFrench, rows, rowsEdited, outputFrenchDraft };
    };
    const setStatus = (message, kind) => {
      status.textContent = message || "";
      status.className = "translation-correction-status" + (kind ? " " + kind : "");
      status.hidden = !String(message || "").trim();
    };
    const refresh = () => {
      const values = currentValues();
      const placeholder = isPlaceholderReading(values.reading);
      const valid = isFrenchMode() && !!values.chinese && !!values.french &&
        (values.outputFrenchDraft || (!!values.reading && !placeholder));
      const signature = JSON.stringify([values.chinese, values.french, values.reading]);
      if (!saving && lastDraftSignature && signature !== lastDraftSignature) setStatus("");
      lastDraftSignature = signature;
      wrap.hidden = !valid;
      saveButton.disabled = saving || !valid;
    };

    saveButton.addEventListener("click", async () => {
      if (saving) return;
      if (!isFrenchMode()) return;
      let values = currentValues();
      if (!values.chinese || !values.french) {
        setStatus("请先输入中文并等待法语翻译结果生成。", "error");
        return;
      }

      const tools = window.DWSSFrenchTools;
      if (values.rowsEdited) {
        for (const row of values.rows) {
          if (!row.word || row.word.length > 100 || /[\r\n]/.test(row.word)) {
            setStatus("法语单词不能为空，且每个单词最多 100 个字符。", "error");
            row.wordInput.focus();
            return;
          }
        }
        values = currentValues();
      }

      if (!values.outputFrenchDraft &&
          (!values.reading || values.reading.length > 500 || isPlaceholderReading(values.reading))) {
        setStatus("请填写有效的法语中文谐音，最多 500 个字符。", "error");
        return;
      }
      const api = window.DWSSSharedLexicon;
      if (!api || typeof api.submitFrenchPronunciationCorrection !== "function") {
        setStatus("共享同步模块尚未就绪，请联网刷新后重试。", "error");
        return;
      }

      saving = true;
      saveButton.disabled = true;
      saveButton.textContent = "正在保存…";
      setStatus("正在保存本机修改并加入共享同步队列…");
      try {
        if (values.outputFrenchDraft) {
          const machine = window.DWSSFrenchMachineTranslationController;
          if (!machine || typeof machine.getReadingForFrenchDraft !== "function") {
            throw new Error("法语读音生成模块尚未就绪，请刷新后重试。");
          }
          spelling.value = values.french;
          setStatus("正在根据修改后的法语原文生成中文近似音…");
          const generated = await machine.getReadingForFrenchDraft(values.french);
          const generatedReading = String(generated && generated.reading || "").trim();
          const missing = Array.isArray(generated && generated.missing) ? generated.missing : [];
          if (!generatedReading) {
            output.value = "〔发音待补〕";
            output.classList.remove("empty");
            output.removeAttribute("data-dwss-french-draft");
            output.dispatchEvent(new Event("input", { bubbles: true }));
            setStatus("已识别修改后的法语原文，但暂时没有找到可用读音。请在结果框填写你确认的整句中文近似音后，再次保存。程序不会猜测发音。", "warning");
            return;
          }
          if (missing.length || /〔[^〕]*(?:待补|待核)[^〕]*〕/u.test(generatedReading)) {
            const partialReading = /〔[^〕]*(?:待补|待核)[^〕]*〕/u.test(generatedReading)
              ? generatedReading.replace(/〔[^〕]*(?:待补|待核)[^〕]*〕/gu, "〔发音待补〕")
              : generatedReading + " 〔发音待补〕";
            output.value = partialReading;
            output.classList.remove("empty");
            output.removeAttribute("data-dwss-french-draft");
            output.dispatchEvent(new Event("input", { bubbles: true }));
            setStatus("已识别修改后的法语原文，并保留已找到的读音。请将结果框中的〔发音待补〕替换为你确认的中文近似音，再次保存。程序不会猜测缺失读音。", "warning");
            return;
          }
          values.reading = generatedReading;
        }
        if (!values.reading || values.reading.length > 500 || isPlaceholderReading(values.reading)) {
          setStatus("请填写有效的法语中文谐音，最多 500 个字符。", "error");
          return;
        }
        const result = await api.submitFrenchPronunciationCorrection({
          chinese_text: values.chinese,
          french_text: values.french,
          french_pronunciation_cn: values.reading
        });
        const current = currentValues();
        const sameContext = current.chinese === values.chinese && current.french === values.french;
        if (sameContext && (values.rowsEdited || values.outputFrenchDraft)) {
          // Commit the successful row edits as the new baseline so the same
          // phrase can be corrected again without requiring a re-translation.
          spelling.value = values.french;
          output.value = values.reading;
          output.classList.toggle("empty", !values.reading);
          output.removeAttribute("data-dwss-french-draft");
          if (glossHost) glossHost.dataset.frenchSourcePhrase = values.french;
          readWordRows().forEach(row => {
            row.wordInput.dataset.originalWord = row.word;
          });
          if (tools && typeof tools.renderSingleGloss === "function") {
            tools.renderSingleGloss(values.chinese, values.french);
          }
          output.dispatchEvent(new Event("dwss:french-result-updated"));
        }
        if (sameContext) {
          if (result && result.synced) {
            setStatus("保存成功，已同步到云端共享词库，所有用户都能使用这条法语修正。");
          } else {
            setStatus("已保存在本机；联网后会自动同步给所有用户。", "warning");
          }
        }
      } catch (error) {
        setStatus("保存失败：" + String(error && error.message || error) + "。已修改的法语单词和主结果框内容仍保留。", "error");
      } finally {
        saving = false;
        saveButton.disabled = false;
        saveButton.textContent = "保存并同步给所有用户";
        refresh();
      }
    });

    if (input) input.addEventListener("input", refresh);
    if (spelling) spelling.addEventListener("input", refresh);
    if (glossHost) glossHost.addEventListener("input", refresh);
    output.addEventListener("input", refresh);
    output.addEventListener("dwss:french-result-updated", refresh);
    output.addEventListener("dwss:french-draft-pending", refresh);
    window.addEventListener("dwss:shared-terms-updated", refresh);
    const swMode = $("dwssMainSwMode"), frMode = $("dwssMainFrMode");
    if (swMode) swMode.addEventListener("click", () => window.setTimeout(refresh, 0));
    if (frMode) frMode.addEventListener("click", () => window.setTimeout(refresh, 0));
    refresh();
    window.setTimeout(refresh, 600);
  }


  function splitPinyinInitial(value) {
    const syllable = String(value || "").toLowerCase();
    const initials = ["zh", "ch", "sh", "b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h", "j", "q", "x", "r", "z", "c", "s", "y", "w"];
    const initial = initials.find(item => syllable.startsWith(item)) || "";
    return { initial, final: syllable.slice(initial.length) };
  }

  function frenchSyllableDistance(leftValue, rightValue, engine) {
    const left = String(leftValue || "").toLowerCase();
    const right = String(rightValue || "").toLowerCase();
    if (left === right) return 0;
    if (!engine || typeof engine.syllableDistance !== "function") return 1;
    const baseDistance = engine.syllableDistance(left, right);
    const a = splitPinyinInitial(left);
    const b = splitPinyinInitial(right);
    const sharedPlaceGroup = FRENCH_NEAR_INITIAL_GROUPS.some(group =>
      group.includes(a.initial) && group.includes(b.initial)
    );
    if (!sharedPlaceGroup) return baseDistance;

    // Re-use the pronunciation engine's final-sound distance while softening
    // only close consonants (b/p, d/t, g/k). Unrelated initials stay strict.
    const finalDistance = Math.max(0, Math.min(1, (baseDistance - 0.92 * 0.43) / 0.57));
    return Math.min(baseDistance, 0.18 * 0.43 + finalDistance * 0.57);
  }

  function nearFirstKeys(first, engine, availableKeys) {
    const keys = [];
    const pool = availableKeys || firstKeys;
    for (const key of pool) {
      const distance = frenchSyllableDistance(first, key, engine);
      if (distance <= 0.38) keys.push({ key, distance });
    }
    keys.sort((a, b) => a.distance - b.distance || a.key.localeCompare(b.key));
    // Always include exact and close first-syllable buckets; exact no longer
    // prevents nearby sounds from being considered.
    return keys.slice(0, 6).map(item => item.key);
  }

  function searchFrenchCandidates(query, entries, engine, limit) {
    const querySyllables = engine.toSyllables(query, true) || [];
    if (!querySyllables.length || querySyllables.length > 30) return [];
    const maxResults = Math.max(1, Math.min(30, Number(limit) || 20));
    const maxSyllableDistance = 0.38;
    const minimumScore = 0.84;
    const unique = new Map();

    for (const item of Array.isArray(entries) ? entries : []) {
      let best = null;
      for (const variant of Array.isArray(item.variants) ? item.variants : []) {
        const reading = String(variant.reading || "").trim();
        if (!reading) continue;
        const candidateSyllables = engine.toSyllables(reading, false) || [];
        if (candidateSyllables.length !== querySyllables.length) continue;
        let total = 0;
        let worst = 0;
        let valid = true;
        for (let i = 0; i < querySyllables.length; i += 1) {
          const distance = frenchSyllableDistance(querySyllables[i], candidateSyllables[i], engine);
          total += distance;
          worst = Math.max(worst, distance);
          if (distance > maxSyllableDistance) { valid = false; break; }
        }
        if (!valid) continue;
        const score = 1 - total / querySyllables.length;
        if (!best || score > best.score) {
          best = { score, reading, variant, pinyin: candidateSyllables.join(" ") };
        }
      }
      if (!best || best.score < minimumScore) continue;
      const zh = String(item.zh || "");
      const result = {
        zh,
        category: String(item.category || "法语"),
        score: best.score,
        matchedReading: best.reading,
        matchedPinyin: best.pinyin,
        variant: best.variant,
        latin: best.variant.latin || "",
        source: best.variant.source || "法语词库"
      };
      const key = zh.normalize("NFKC").replace(/\s+/g, "").toLowerCase() + "\u0000" + best.pinyin;
      const previous = unique.get(key);
      if (!previous || result.score > previous.score) unique.set(key, result);
    }
    return Array.from(unique.values())
      .sort((a, b) => b.score - a.score || a.zh.localeCompare(b.zh, "fr"))
      .slice(0, maxResults);
  }

  function rowsForShards(shards, cap) {
    const candidates = [];
    const seenWords = new Set();
    for (const lines of shards) {
      for (const line of lines) {
        if (candidates.length >= cap) return candidates;
        const fields = line.split("\t");
        if (fields.length < 5 || !fields[0] || (!fields[2] && !fields[1])) continue;
        const word = fields[0].trim();
        const key = normalizeFrenchGlossKey(word);
        if (!key || seenWords.has(key)) continue;
        seenWords.add(key);
        const confidence = fields[3] || "";
        const kind = fields[4] || "词形";
        const ipa = cleanIpa(fields[1]);
        const storedReading = String(fields[2] || "").trim();
        const reading = storedReading && !/^(?:谐音待补|音标待补|读音待补)$/u.test(storedReading)
          ? storedReading : ipaToChinese(ipa);
        if (!reading) continue;
        candidates.push({
          zh: word,
          category: "法语" + kind,
          variants: [{
            reading,
            latin: ipa,
            source: confidence === "W" ? "IPA 自动拟音 · 待人工核对" : "LeXiK · " + confidence,
            kind,
            status: "canonical",
            confidence
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
    const matchingFirstKeys = nearFirstKeys(first, engine, firstKeys);
    const shardLines = await Promise.all(matchingFirstKeys.map(loadPronunciationShard));
    const candidates = rowsForShards(shardLines, 24000);
    candidates.push(...customQueryCandidates());
    const results = searchFrenchCandidates(query, candidates, engine, 20);
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
        // User corrections and shared additions take precedence over the base glossary.
        const custom = activeRows().find(x =>
          normalizeFrenchGlossKey(x.word) === normalizeFrenchGlossKey(result.zh)
        );
        if (custom && custom.meanings && custom.meanings.length) return custom.meanings.join("；");
        const found = findFrenchGloss(result.zh);
        if (found.length) return found.slice(0, 4).join("；");
        return "该法语词形暂未收录中文释义（法中词典没有对应词条）";
      })();
      const ipa = variant.latin ? "/" + variant.latin + "/" : "音标待补";
      const reading = variant.reading || result.matchedReading || "";
      return '<article class="pronunciation-hit"><div class="pronunciation-hit-main">' +
        '<div class="pronunciation-hit-zh">法语：' + esc(result.zh) + '<span class="pronunciation-match-chip">' + label + '</span></div>' +
        '<div class="pronunciation-hit-reading">中文近似发音：' + esc(reading) + '</div>' +
        '<div class="pronunciation-hit-meta">IPA 音标：' + esc(ipa) + '</div>' +
        '<div class="pronunciation-hit-meta pronunciation-hit-meaning"><strong>中文释义：</strong>' + esc(meanings) + '</div>' +
        '<div class="pronunciation-hit-meta">匹配读音：' + esc(result.matchedReading || reading) + '</div>' +
        '</div></article>';
    }).join("") || '<div class="nores">没有找到足够接近的法语读音。可换一个同音或近音的中文字符再试；自动拟音只作参考。</div>';
  }

  window.DWSSRenderFrenchPronunciationQuery = renderFrenchQuery;

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

  function restoreSelectedModesAfterCoreReady() {
    // boot.js asynchronously decompresses the Swahili dictionary and injects
    // app.js after parser-deferred scripts have already executed. The extension
    // must reconcile both views only after the real core renderers are available.
    if (!window.KolweziSwahili ||
        typeof window.DWSSRenderTranslation !== "function" ||
        typeof window.DWSSRenderPronunciationLookup !== "function") return false;

    // Preserve the user's current selection; do not force French back to Swahili
    // if the user changed language while the dictionary was still loading.
    setMainMode(activeMainMode);
    setQueryMode(activeQueryMode);

    const query = $("pronunciationSearch");
    if (activeQueryMode === "sw" && query && String(query.value || "").trim()) {
      window.DWSSRenderPronunciationLookup();
    }
    return true;
  }

  function bind() {
    const frenchQueryInstruction = document.querySelector("#dwssFrenchQueryPanel .pronunciation-lookup-instruction");
    if (frenchQueryInstruction) {
      frenchQueryInstruction.textContent = "输入听到却不懂意思的法语中文谐音时，即便是同音不同字的中文，系统也会自动查询近似的读音来匹配对应发音的法语";
    }
    $("dwssMainSwMode").addEventListener("click", () => setMainMode("sw"));
    $("dwssMainFrMode").addEventListener("click", () => setMainMode("fr"));
    setupFrenchPronunciationEditor();
    $("dwssPronSwMode").addEventListener("click", () => setQueryMode("sw"));
    $("dwssPronFrMode").addEventListener("click", () => setQueryMode("fr"));

    // boot.js can complete before or after this deferred script binds.
    // The event covers the async path; the immediate check covers the fast-cache path.
    window.addEventListener("dwss:app-ready", restoreSelectedModesAfterCoreReady, { once: true });
    restoreSelectedModesAfterCoreReady();
    const scheduleMain = () => {
      if (activeMainMode !== "fr") return;
      const modeGeneration = mainModeGeneration;
      const isCurrentFrenchMode = () => modeGeneration === mainModeGeneration && activeMainMode === "fr";
      window.clearTimeout(mainTimer);
      mainTimer = window.setTimeout(() => {
        if (!isCurrentFrenchMode()) return;
        const currentChinese = String($("inputText") && $("inputText").value || "").trim();
        const refreshFrenchMode = () => {
          if (!isCurrentFrenchMode()) return;
          renderMainFrench();
          const currentFrench = String($("dwssFrenchSpelling") && $("dwssFrenchSpelling").value || "").trim();
          renderFrenchSingleGloss(currentChinese, currentFrench);
        };
        if (!rows.length) loadLexicon().then(refreshFrenchMode).catch(error => {
          if (!isCurrentFrenchMode()) return;
          $("dwssFrenchIpaMeta").textContent = error.message || String(error);
          renderFrenchSingleGloss(currentChinese);
        });
        else refreshFrenchMode();
      }, 40);
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
      refreshActiveMeaningIndex();
      if (activeMainMode === "fr") {
        renderMainFrench();
        const machine = window.DWSSFrenchMachineTranslationController;
        if (machine && typeof machine.refreshAfterSharedCorrection === "function") {
          machine.refreshAfterSharedCorrection();
        } else if (machine && typeof machine.scheduleTranslation === "function") {
          machine.scheduleTranslation(60);
        }
      }
      if (activeQueryMode === "fr" && $("pronunciationFrenchSearch").value.trim()) renderFrenchQuery().catch(() => {});
    };
    window.addEventListener("dwss:shared-terms-updated", refresh);
    window.addEventListener("dwss:personal-term-added", refresh);

    // Apply the default/current language selection immediately. If the async
    // Swahili core is not ready yet, restoreSelectedModesAfterCoreReady will
    // render the preserved inputs when app.js emits dwss:app-ready.
    setMainMode(activeMainMode);
    setQueryMode(activeQueryMode);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once: true });
  else bind();
})(window, document);
