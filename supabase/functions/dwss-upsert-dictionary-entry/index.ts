import { createClient } from "npm:@supabase/supabase-js@2";

const ORIGIN = "https://yanyao8686-debug.github.io";
const ALLOWED_ORIGINS = new Set([ORIGIN, "https://localhost"]);
const PUBLISHABLE_KEY = "sb_publishable_9BB_pwnlj6-gVHPFzpjivA_L7SGU_Bp";
const HEADERS = {
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin"
};
const limits = new Map<string, { count: number; started: number }>();
let db: any = null;
function cors(origin: string) {
  return { ...HEADERS, "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : ORIGIN };
}
function reply(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors(origin), "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}
function normalizeChinese(value: string) {
  return value.normalize("NFKC").replace(/[\s，。！？；：、,.!?;:（）()“”"　]+/gu, "").toLowerCase();
}
function getDb() {
  if (db) return db;
  const url = Deno.env.get("SUPABASE_URL") || "";
  const bag = Deno.env.get("SUPABASE_SECRET_KEYS") || "{}";
  let secrets: Record<string, string> = {};
  try { secrets = JSON.parse(bag); } catch (_) {}
  const key = secrets.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) throw new Error("Server database credentials unavailable");
  db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return db;
}
function rateLimit(ip: string) {
  const now = Date.now(), old = limits.get(ip);
  if (!old || now - old.started > 600000) {
    limits.set(ip, { count: 1, started: now }); return true;
  }
  if (old.count >= 100) return false;
  old.count++; return true;
}
function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || ORIGIN;
  const respond = (body: unknown, status = 200) => reply(body, status, origin);
  if (!ALLOWED_ORIGINS.has(origin)) return respond({ ok: false, error: "Origin not allowed" }, 403);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return respond({ ok: false, error: "Method not allowed" }, 405);
  if (req.headers.get("apikey") !== PUBLISHABLE_KEY) return respond({ ok: false, error: "Invalid application key" }, 401);
  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim().slice(0, 80);
  if (!rateLimit(ip)) return respond({ ok: false, error: "提交过于频繁，请稍后重试。" }, 429);
  try {
    const raw = await req.text();
    if (raw.length > 16000) return respond({ ok: false, error: "提交内容过长。" }, 413);
    const body = JSON.parse(raw);
    const source = String(body?.source_language || "");
    const chinese = String(body?.chinese_text || "").trim();
    const normalized = normalizeChinese(chinese);
    const category = String(body?.category || "未分类").trim() || "未分类";
    const notes = String(body?.notes || "").trim() || null;
    const submitId = String(body?.client_submit_id || "");
    if (!["sw", "fr"].includes(source)) return respond({ ok: false, error: "语言类型无效。" }, 400);
    if (!chinese || chinese.length > 500 || !normalized || normalized.length > 500 || /[\u0000-\u001f\u007f]/.test(chinese)) {
      return respond({ ok: false, error: "中文词条不能为空，且最多 500 个字符。" }, 400);
    }
    if (category.length > 80 || (notes && notes.length > 1000)) return respond({ ok: false, error: "分类或备注长度超限。" }, 400);
    if (!validUuid(submitId)) return respond({ ok: false, error: "提交编号无效，请重新保存。" }, 400);
    let payload: Record<string, unknown>;
    if (source === "sw") {
      const reading = String(body?.local_pronunciation_cn || "").trim();
      const local = String(body?.local_text || "").trim();
      if (!reading || reading.length > 500 || /[\u0000-\u001f\u007f]/.test(reading)) return respond({ ok: false, error: "科卢韦齐斯语中文谐音不能为空，且最多 500 个字符。" }, 400);
      if (local.length > 500 || /[\u0000-\u001f\u007f]/.test(local)) return respond({ ok: false, error: "斯语拼写长度不正确。" }, 400);
      payload = { client_submit_id: submitId, source_language: "sw", normalized_chinese: normalized, chinese_text: chinese,
        local_text: local || null, local_pronunciation_cn: reading, french_text: null, french_pronunciation_cn: null, category, notes };
    } else {
      const french = String(body?.french_text || "").trim();
      const reading = String(body?.french_pronunciation_cn || "").trim();
      if (!french || french.length > 500 || /[\u0000-\u001f\u007f]/.test(french)) return respond({ ok: false, error: "法语原文不能为空，且最多 500 个字符。" }, 400);
      if (!reading || reading.length > 500 || /[\u0000-\u001f\u007f]/.test(reading)) return respond({ ok: false, error: "法语中文谐音不能为空，且最多 500 个字符。" }, 400);
      payload = { client_submit_id: submitId, source_language: "fr", normalized_chinese: normalized, chinese_text: chinese,
        local_text: null, local_pronunciation_cn: null, french_text: french, french_pronunciation_cn: reading, category, notes };
    }
    payload.updated_at = new Date().toISOString();
  const { data, error } = await getDb().from("shared_dictionary_entries")
      .upsert(payload, { onConflict: "source_language,normalized_chinese" }).select("*").single();
    if (error) {
      console.error("[DWSS] Canonical dictionary upsert failed:", error);
      return respond({ ok: false, error: "共享词库保存失败；原有首选词条没有被删除。" }, 503);
    }
    return respond({ ok: true, entry: data, replaced: true });
  } catch (error) {
    console.error("[DWSS] Canonical dictionary submission failed:", error);
    return respond({ ok: false, error: "服务器暂时无法处理，请联网后重试。" }, 503);
  }
});
