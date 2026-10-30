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

let db: any = null;
let termsPromise: Promise<Set<string>> | null = null;
const counters = new Map<string, { n: number; t: number }>();

function corsHeaders(origin: string) {
  return { ...HEADERS, "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : ORIGIN };
}
function reply(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}
function normalize(value: string) {
  return value.normalize("NFKC")
    .replace(/[\s　]+/g, "")
    .replace(/[，。！？；：、,.!?;:（）()“”"']/g, "")
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
  if (!termsPromise) {
    termsPromise = (async () => {
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
  return await termsPromise;
}
async function isKnownTerm(chinese: string, normalized: string) {
  if ((await builtinTerms()).has(normalized)) return true;
  const { data, error } = await getDb().from("shared_terms")
    .select("chinese_text").eq("source_language", "sw").eq("chinese_text", chinese).limit(1);
  if (error) throw new Error("公共词库校验查询失败");
  return Array.isArray(data) && data.some((row: any) => normalize(String(row?.chinese_text || "")) === normalized);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || ORIGIN;
  const respond = (body: unknown, status = 200) => reply(body, status, origin);
  if (!ALLOWED_ORIGINS.has(origin)) return respond({ ok: false, error: "Origin not allowed" }, 403);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return respond({ ok: false, error: "Method not allowed" }, 405);

  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown")
    .split(",")[0].trim().slice(0, 80);
  if (!rateLimit(ip)) return respond({ ok: false, error: "修改过于频繁，请稍后重试。" }, 429);

  try {
    const raw = await req.text();
    if (raw.length > 16000) return respond({ ok: false, error: "提交内容过长。" }, 413);
    const body = JSON.parse(raw);
    const chinese = String(body?.chinese_text || "").trim();
    const normalized = normalize(chinese);
    const action = String(body?.action || "update");
    const sourceKind = String(body?.source_kind || body?.scope || "dictionary");
    const reading = String(body?.local_pronunciation_cn || "").trim();
    const originalReading = String(body?.original_pronunciation_cn || "").trim();
    const expectedRevision = body?.expected_revision === undefined || body?.expected_revision === null
      ? null : Number(body.expected_revision);

    if (!chinese || chinese.length > 2000 || !normalized || normalized.length > 2000 ||
        /[\u0000-\u001f\u007f]/.test(chinese)) {
      return respond({ ok: false, error: "中文内容不正确或超过 2000 字限制。" }, 400);
    }
    if (action !== "update" && action !== "restore") {
      return respond({ ok: false, error: "不支持的操作。" }, 400);
    }
    if (sourceKind !== "dictionary" && sourceKind !== "translation") {
      return respond({ ok: false, error: "修正类型不正确。" }, 400);
    }
    if (sourceKind === "dictionary" && (chinese.length > 500 || normalized.length > 500)) {
      return respond({ ok: false, error: "词典词条最多 500 个字符；完整短句请从翻译主界面修改。" }, 400);
    }
    if (action === "update" && (!reading || reading.length > 2000 ||
        /[\u0000-\u001f\u007f]/.test(reading))) {
      return respond({ ok: false, error: "中文谐音必须填写，长度为 1–2000 字。" }, 400);
    }
    if (originalReading.length > 2000 || /[\u0000-\u001f\u007f]/.test(originalReading)) {
      return respond({ ok: false, error: "原始读音内容不正确。" }, 400);
    }
    if (expectedRevision !== null &&
        (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)) {
      return respond({ ok: false, error: "修订版本号无效，请刷新后重试。" }, 400);
    }
    if (sourceKind === "translation" && expectedRevision === null) {
      return respond({ ok: false, error: "缺少云端版本号，请先刷新页面重新获取最新读音。" }, 409);
    }

    // Dictionary edits must refer to a real built-in/shared local term. Full-sentence
    // corrections are intentionally allowed because a sentence is assembled from terms
    // and is not necessarily a standalone dictionary headword.
    if (sourceKind === "dictionary" && !await isKnownTerm(chinese, normalized)) {
      return respond({ ok: false, error: "服务端校验未通过：请选择词库中已有的中文词条。" }, 422);
    }

    const { data: result, error } = await getDb().rpc("dwss_apply_pronunciation_override", {
      p_normalized_chinese: normalized,
      p_chinese_text: chinese,
      p_original_pronunciation_cn: originalReading || null,
      p_local_pronunciation_cn: action === "update" ? reading : null,
      p_action: action,
      p_source_kind: sourceKind,
      p_expected_revision: expectedRevision
    });

    if (error) {
      if (error.code === "40001" || String(error.message || "").includes("REVISION_CONFLICT")) {
        return respond({ ok: false, code: "REVISION_CONFLICT", error: "这条中文刚刚已被其他用户修改。为避免覆盖他人的修正，请先刷新页面确认最新读音后再提交。" }, 409);
      }
      console.error("[DWSS] Pronunciation correction RPC failed:", error);
      return respond({ ok: false, error: "云端保存失败，请稍后重试；原有读音没有被删除。" }, 500);
    }

    if (action === "restore") {
      return respond({ ok: true, action: result?.action || "restored", revision: result?.revision || null });
    }

    const { data: override, error: readError } = await getDb()
      .from("dictionary_pronunciation_overrides")
      .select("normalized_chinese,chinese_text,local_pronunciation_cn,original_pronunciation_cn,revision,source_kind,updated_at")
      .eq("normalized_chinese", normalized).single();
    if (readError) {
      console.error("[DWSS] Saved pronunciation could not be re-read:", readError);
      return respond({ ok: false, error: "云端已收到提交，但读取确认结果失败。请刷新页面确认。" }, 503);
    }
    return respond({ ok: true, action: "updated", override });
  } catch (error) {
    console.error("[DWSS] Pronunciation correction request failed:", error);
    return respond({ ok: false, error: "服务器暂时无法处理请求，请联网后重试。" }, 503);
  }
});
