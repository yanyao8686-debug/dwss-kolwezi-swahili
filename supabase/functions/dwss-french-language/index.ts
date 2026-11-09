import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SITE_ORIGIN = "https://yanyao8686-debug.github.io";
const ALLOWED_ORIGINS = new Set([
  SITE_ORIGIN,
  "https://localhost",
  "http://localhost",
  "capacitor://localhost",
]);
const TRANSLATION_NODES = [
  "https://translate.fedilab.app",
  "https://translate.cutie.dating",
  "https://translate.argosopentech.com",
];
const HEADERS = {
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
};
const counters = new Map<string, { count: number; resetAt: number }>();
const cache = new Map<string, { translatedText: string; provider: string; at: number }>();

function cors(origin: string) {
  return { ...HEADERS, "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : SITE_ORIGIN };
}
function reply(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
function getClientIp(req: Request) {
  return (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown")
    .split(",")[0].trim().slice(0, 80);
}
function rateLimit(ip: string, action: string, limit: number) {
  const key = action + ":" + ip;
  const now = Date.now();
  const previous = counters.get(key);
  if (!previous || now >= previous.resetAt) {
    counters.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (previous.count >= limit) return false;
  previous.count += 1;
  if (counters.size > 3000) {
    for (const [k, v] of counters) if (now >= v.resetAt) counters.delete(k);
  }
  return true;
}
function expectedPublishableKey() {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
    return String(keys.default || "");
  } catch {
    return "";
  }
}
function hasChinese(value: string) {
  return /[\u3400-\u9fff]/.test(value);
}
function isUsableTranslation(original: string, translated: string) {
  const value = translated.trim();
  if (!value || value.length > 8000 || value === original.trim()) return false;
  const han = (value.match(/[\u3400-\u9fff]/g) || []).length;
  return han <= Math.max(2, Math.floor(value.length * 0.45));
}
async function requestLibreTranslate(node: string, text: string, source: string, target: string) {
  const response = await fetch(node + "/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ q: text, source, target, format: "text" }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error("HTTP " + response.status + " for " + source + "→" + target);
  const data = await response.json();
  const translatedText = String(data?.translatedText || "").trim();
  if (!translatedText || translatedText.length > 8_000 || translatedText === text.trim()) {
    throw new Error("Invalid or unchanged " + source + "→" + target + " translation");
  }
  return translatedText;
}
function extractTranslation(data: any): string {
  if (typeof data?.responseData?.translatedText === "string") return data.responseData.translatedText.trim();
  if (Array.isArray(data?.sentences)) return data.sentences.map((item: any) => String(item?.trans || "")).join("").trim();
  if (Array.isArray(data)) {
    const first = data[0];
    if (Array.isArray(first)) {
      if (typeof first[0] === "string") return first[0].trim();
      return first.map((item: any) => Array.isArray(item) ? String(item[0] || "") : String(item?.trans || "")).join("").trim();
    }
  }
  return "";
}
async function translateWithMyMemory(text: string) {
  // MyMemory's documented anonymous quota is 5,000 UTF-8 characters/day;
  // its public GET endpoint accepts at most 500 bytes per segment.
  const byteLength = new TextEncoder().encode(text).length;
  if (byteLength > 480) throw new Error("MyMemory segment exceeds its 500-byte limit");
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", text);
  url.searchParams.set("langpair", "zh-CN|fr-FR");
  url.searchParams.set("mt", "1");
  const response = await fetch(url, {
    method: "GET",
    headers: { "Accept": "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("MyMemory HTTP " + response.status);
  const data = await response.json();
  const status = Number(data?.responseStatus || 0);
  if (status !== 200) throw new Error("MyMemory responseStatus " + status + ": " + String(data?.responseDetails || ""));
  const translatedText = extractTranslation(data);
  if (!isUsableTranslation(text, translatedText)) throw new Error("MyMemory returned an unusable translation");
  return {
    translatedText,
    provider: "MyMemory machine translation (no API key; anonymous daily quota applies)",
  };
}
async function translateWithGoogleWeb(text: string) {
  // This is Google's public web translation endpoint, not the paid Cloud Translation API.
  // It has no API key, but is unofficial for third-party integrations and may be rate-limited.
  const url = new URL("https://translate.googleapis.com/translate_a/t");
  url.searchParams.set("client", "dict-chrome-ex");
  url.searchParams.set("sl", "zh-CN");
  url.searchParams.set("tl", "fr");
  url.searchParams.set("q", text);
  const response = await fetch(url, {
    method: "GET",
    headers: { "Accept": "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("Google web translate HTTP " + response.status);
  const data = await response.json();
  const translatedText = extractTranslation(data);
  if (!isUsableTranslation(text, translatedText)) throw new Error("Google web endpoint returned an unusable translation");
  return {
    translatedText,
    provider: "Google Translate public web endpoint (no API key; unofficial integration)",
  };
}
async function translateWithLibreTranslate(text: string) {
  const node = TRANSLATION_NODES[0];
  // Prefer a direct Chinese→French model. If the instance lacks it, pivot through English.
  try {
    const direct = await translateWithNode(node, text);
    return {
      translatedText: direct.translatedText,
      provider: "LibreTranslate / Argos (" + new URL(node).host + "; zh→fr)",
    };
  } catch (_) {
    const english = await requestLibreTranslate(node, text, "zh", "en");
    const french = await requestLibreTranslate(node, english, "en", "fr");
    if (!isUsableTranslation(text, french)) throw new Error("LibreTranslate English-pivot result is not usable");
    return {
      translatedText: french,
      provider: "LibreTranslate / Argos (" + new URL(node).host + "; zh→en→fr)",
    };
  }
}
async function translateWithNode(node: string, text: string) {
  const translatedText = await requestLibreTranslate(node, text, "zh", "fr");
  if (!isUsableTranslation(text, translatedText)) throw new Error("LibreTranslate returned an unusable translation");
  return { translatedText, route: "zh→fr" };
}
async function translate(text: string) {
  const cacheKey = text.normalize("NFKC").trim();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < 30 * 60_000) {
    return { translatedText: cached.translatedText, provider: cached.provider, cached: true };
  }

  // Race the two quickest no-key services instead of waiting for one provider
  // to time out before trying the next. LibreTranslate remains the fallback.
  const failures: string[] = [];
  let result: { translatedText: string; provider: string } | null = null;
  try {
    result = await Promise.any([
      translateWithGoogleWeb(text),
      translateWithMyMemory(text),
    ]);
  } catch (error) {
    const reasons = error instanceof AggregateError ? error.errors : [error];
    for (const reason of reasons) failures.push(String(reason?.message || reason));
  }

  if (!result) {
    try {
      result = await translateWithLibreTranslate(text);
    } catch (error) {
      failures.push(String(error?.message || error));
    }
  }

  if (!result) {
    console.warn("[DWSS] All no-key French translation providers failed:", failures.join(" | "));
    throw new Error("免密法语翻译服务暂不可用，请稍后重试；当前没有生成未经核验的拼词译文");
  }

  cache.set(cacheKey, { translatedText: result.translatedText, provider: result.provider, at: Date.now() });
  if (cache.size > 500) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  return { translatedText: result.translatedText, provider: result.provider, cached: false };
}

async function checkFrenchGrammar(text: string) {
  const form = new URLSearchParams();
  form.set("text", text);
  form.set("language", "fr-FR");
  form.set("enabledOnly", "false");
  const response = await fetch("https://api.languagetool.org/v2/check", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "Accept": "application/json" },
    body: form.toString(),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error("LanguageTool HTTP " + response.status);
  const data = await response.json();
  const matches = Array.isArray(data?.matches) ? data.matches : [];
  const sorted = matches
    .filter((match: any) => Number.isInteger(match.offset) && Number.isInteger(match.length) && match.offset >= 0 && match.length >= 0)
    .sort((a: any, b: any) => b.offset - a.offset);
  let correctedText = text;
  const applied: Array<{ from: string; to: string; message: string; ruleId: string }> = [];
  let lastStart = Number.POSITIVE_INFINITY;
  for (const match of sorted) {
    if (match.offset + match.length > lastStart) continue;
    const suggestions = Array.isArray(match.replacements)
      ? [...new Set(match.replacements.map((item: any) => String(item?.value || "")).filter(Boolean))]
      : [];
    if (!suggestions.length) continue;
    const from = correctedText.slice(match.offset, match.offset + match.length);
    const to = suggestions[0];
    if (!from || from === to) continue;
    correctedText = correctedText.slice(0, match.offset) + to + correctedText.slice(match.offset + match.length);
    applied.push({
      from,
      to,
      message: String(match.message || ""),
      ruleId: String(match.rule?.id || ""),
    });
    lastStart = match.offset;
  }
  return {
    correctedText,
    totalIssues: matches.length,
    appliedCorrections: applied.reverse(),
    matches: matches.slice(0, 15).map((match: any) => ({
      message: String(match.message || ""),
      shortMessage: String(match.shortMessage || ""),
      context: String(match.context?.text || ""),
      offset: Number(match.offset || 0),
      length: Number(match.length || 0),
      suggestions: Array.isArray(match.replacements)
        ? match.replacements.slice(0, 4).map((item: any) => String(item?.value || "")).filter(Boolean)
        : [],
      ruleId: String(match.rule?.id || ""),
      category: String(match.rule?.category?.name || ""),
    })),
    languageToolVersion: String(data?.software?.version || ""),
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || SITE_ORIGIN;
  const respond = (body: unknown, status = 200) => reply(body, status, origin);
  if (!ALLOWED_ORIGINS.has(origin)) return respond({ ok: false, code: "ORIGIN", error: "Origin not allowed" }, 403);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return respond({ ok: false, code: "METHOD", error: "Method not allowed" }, 405);

  const expectedKey = expectedPublishableKey();
  const suppliedKey = req.headers.get("apikey") || "";
  if (!expectedKey || suppliedKey !== expectedKey) {
    return respond({ ok: false, code: "API_KEY", error: "应用接口凭证无效，请刷新应用后重试。" }, 401);
  }
  const ip = getClientIp(req);
  try {
    const raw = await req.text();
    if (raw.length > 16_000) return respond({ ok: false, code: "TOO_LARGE", error: "请求内容过长。" }, 413);
    const body = JSON.parse(raw);
    const action = String(body?.action || "translate");
    const text = String(body?.text || "").trim();
    const maxLength = action === "check" ? 2_000 : 2_000;
    if (!text || text.length > maxLength || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
      return respond({ ok: false, code: "INVALID_TEXT", error: "中文或法语内容为空、过长或含有非法控制字符。" }, 400);
    }
    if (action === "translate") {
      if (!rateLimit(ip, "translate", 12)) return respond({ ok: false, code: "RATE_LIMIT", error: "翻译请求过于频繁，请稍后再试。" }, 429);
      const result = await translate(text);
      return respond({
        ok: true,
        action,
        sourceLanguage: "zh",
        targetLanguage: "fr",
        translatedText: result.translatedText,
        provider: result.provider,
        cached: result.cached,
        grammarStatus: "not_checked",
      });
    }
    if (action === "check") {
      if (!rateLimit(ip, "grammar", 8)) return respond({ ok: false, code: "RATE_LIMIT", error: "语法校对请求过于频繁，请稍后再试。" }, 429);
      try {
        const result = await checkFrenchGrammar(text);
        return respond({ ok: true, action, ...result, checker: "LanguageTool public proofreading API" });
      } catch (error) {
        console.warn("[DWSS] LanguageTool manual proofreading request failed:", String(error?.message || error));
        return respond({ ok: false, code: "GRAMMAR_UNAVAILABLE", error: "法语语法校对服务暂时不可用；当前法语原文不会被更改。" }, 503);
      }
    }
    return respond({ ok: false, code: "INVALID_ACTION", error: "不支持的操作。" }, 400);
  } catch (error) {
    console.error("[DWSS] French language request failed:", String(error?.message || error));
    return respond({ ok: false, code: "SERVER_ERROR", error: "法语服务暂时不可用，请稍后重试。" }, 503);
  }
});
