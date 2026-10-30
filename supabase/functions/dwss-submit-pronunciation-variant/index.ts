import { createClient } from "npm:@supabase/supabase-js@2";

const ORIGIN = "https://yanyao8686-debug.github.io";
const DICTIONARY_URL = "https://yanyao8686-debug.github.io/dwss-kolwezi-swahili/dictionary.js.gz";
const ALLOWED_ORIGINS = new Set([ORIGIN, "https://localhost"]);
const HEADERS = {
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin"
};
const counters = new Map<string, { n: number; t: number }>();
let db: any = null;
let builtins: Promise<Set<string>> | null = null;

function cors(origin: string) {
  return { ...HEADERS, "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : ORIGIN };
}
function reply(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}
function normalize(value: string) {
  return value.normalize("NFKC")
    .replace(/[\s　，。！？；：、,.!?;:（）()“”"'‘’·—…–－【】]+/g, "")
    .toLowerCase();
}
function getDb() {
  if (db) return db;
  const url = Deno.env.get("SUPABASE_URL") || "";
  const secretBag = Deno.env.get("SUPABASE_SECRET_KEYS") || "{}";
  let secrets: Record<string, string> = {};
  try { secrets = JSON.parse(secretBag); } catch { secrets = {}; }
  const key = secrets.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) throw new Error("Server database credentials unavailable");
  db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return db;
}
function rateLimit(ip: string) {
  const now = Date.now(), old = counters.get(ip);
  if (!old || now - old.t > 600000) {
    counters.set(ip, { n: 1, t: now });
    return true;
  }
  if (old.n >= 80) return false;
  old.n++;
  return true;
}
async function builtinTerms() {
  if (!builtins) {
    builtins = (async () => {
      const response = await fetch(DICTIONARY_URL, { headers: { "Cache-Control": "no-cache" } });
      if (!response.ok) throw new Error("内置词库读取失败");
      const compressed = await response.arrayBuffer();
      const decompressed = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
      const source = await new Response(decompressed).text();
      const prefix = "window.SW_DB = ";
      if (!source.startsWith(prefix)) throw new Error("内置词库格式校验失败");
      const entries = JSON.parse(source.slice(prefix.length).trim().replace(/;$/, ""));
      if (!Array.isArray(entries)) throw new Error("内置词库内容校验失败");
      return new Set<string>(entries.map((entry: any) => normalize(String(entry?.zh || ""))).filter(Boolean));
    })();
  }
  return await builtins;
}
async function isKnownTerm(chinese: string, normalized: string) {
  if ((await builtinTerms()).has(normalized)) return true;
  const { data, error } = await getDb().from("shared_terms")
    .select("chinese_text").eq("source_language", "sw").limit(20000);
  if (error) throw new Error("公共词库校验查询失败");
  return Array.isArray(data) && data.some((row: any) => normalize(String(row?.chinese_text || "")) === normalized);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || ORIGIN;
  const respond = (body: unknown, status = 200) => reply(body, status, origin);
  if (!ALLOWED_ORIGINS.has(origin)) return respond({ ok: false, code: "ORIGIN", error: "Origin not allowed" }, 403);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return respond({ ok: false, code: "METHOD", error: "Method not allowed" }, 405);

  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown")
    .split(",")[0].trim().slice(0, 80);
  if (!rateLimit(ip)) return respond({ ok: false, code: "RATE_LIMIT", error: "提交过于频繁，请稍后重试。" }, 429);

  try {
    const raw = await req.text();
    if (raw.length > 50000) return respond({ ok: false, code: "TOO_LARGE", error: "提交内容过长。" }, 413);
    const body = JSON.parse(raw);
    const chinese = String(body?.chinese_text || "").trim();
    const pronunciation = String(body?.pronunciation_cn || "").trim();
    const normalized = normalize(chinese);
    const pinyinKey = String(body?.pinyin_key || "").trim().toLowerCase().replace(/\s+/g, " ");
    const sourceKind = String(body?.source_kind || "dictionary");
    const isTranslation = sourceKind === "translation";
    const dialect = String(body?.dialect || "加丹加斯瓦希里语（科卢韦齐）").trim();
    const sourceNote = String(body?.source_note || "").trim();
    const clientSubmitId = String(body?.client_submit_id || crypto.randomUUID());

    if ((sourceKind !== "dictionary" && sourceKind !== "translation") ||
        !chinese || chinese.length > (isTranslation ? 2000 : 100) || !normalized ||
        /[\u0000-\u001f\u007f]/.test(chinese)) {
      return respond({ ok: false, code: "INVALID_HEADWORD", error: isTranslation ? "中文内容不正确或超过 2000 字。" : "中文词条不正确或超过 100 字。" }, 400);
    }
    if (!pronunciation || pronunciation.length > (isTranslation ? 2000 : 200) ||
        /[\u0000-\u001f\u007f]/.test(pronunciation)) {
      return respond({ ok: false, code: "INVALID_READING", error: isTranslation ? "中文近似读音必须填写，长度为 1–2000 字。" : "中文近似读音必须填写，长度为 1–200 字。" }, 400);
    }
    if (!pinyinKey || pinyinKey.length > (isTranslation ? 16000 : 400) || !/^[a-züv]+(?: [a-züv]+)*$/.test(pinyinKey)) {
      return respond({ ok: false, code: "INVALID_PINYIN", error: "中文谐音的拼音格式无效，请检查输入后重试。" }, 400);
    }
    if (!dialect || dialect.length > 100 || sourceNote.length > 300 ||
        /[\u0000-\u001f\u007f]/.test(dialect + sourceNote)) {
      return respond({ ok: false, code: "INVALID_META", error: "发音地区或来源说明不正确。" }, 400);
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientSubmitId)) {
      return respond({ ok: false, code: "INVALID_SUBMIT_ID", error: "提交编号无效，请重新提交。" }, 400);
    }

    // Dictionary variants must point to an existing headword. Main translation
    // corrections may be complete sentences, so they are independently indexed.
    if (!isTranslation && !await isKnownTerm(chinese, normalized)) {
      return respond({ ok: false, code: "TERM_NOT_FOUND", error: "原中文词条尚未同步到公共词库。系统已暂存这条发音，等原词条同步后会自动补交。" }, 200);
    }

    const client = getDb();
    const { data: resolved, error } = await client.rpc("dwss_resolve_pronunciation_variant", {
      p_client_submit_id: clientSubmitId,
      p_chinese_text: chinese,
      p_pronunciation_cn: pronunciation,
      p_pinyin_key: pinyinKey,
      p_dialect: dialect,
      p_source_note: sourceNote || null,
      p_source_kind: sourceKind
    });
    if (error) {
      console.error("[DWSS] pronunciation cluster RPC failed:", error);
      throw new Error("保存或合并共享读音失败");
    }
    if (!resolved || resolved.ok !== true || !resolved.variant) {
      throw new Error("服务器没有返回合并后的读音记录");
    }
    return respond({
      ok: true,
      duplicate: !!resolved.duplicate,
      merged: !!resolved.merged,
      variant: resolved.variant
    });
  } catch (error) {
    console.error("[DWSS] pronunciation variant submission failed:", error);
    return respond({ ok: false, code: "SERVER_ERROR", error: "发音变体暂时无法提交，请联网后重试；原有词条不会被修改。" }, 503);
  }
});
