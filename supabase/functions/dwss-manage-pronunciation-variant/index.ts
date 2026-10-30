import { createClient } from "npm:@supabase/supabase-js@2";

const ORIGIN = "https://yanyao8686-debug.github.io";
const ALLOWED = new Set([ORIGIN, "https://localhost"]);
const HEADERS = {
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400", "Vary": "Origin"
};
const limits = new Map<string,{n:number;t:number}>();
let db:any=null;
function cors(origin:string){return {...HEADERS,"Access-Control-Allow-Origin":ALLOWED.has(origin)?origin:ORIGIN};}
function reply(body:unknown,status:number,origin:string){return new Response(JSON.stringify(body),{status,headers:{...cors(origin),"Content-Type":"application/json","Cache-Control":"no-store"}});}
function getDb(){
 if(db)return db;
 const url=Deno.env.get("SUPABASE_URL")||"",bag=Deno.env.get("SUPABASE_SECRET_KEYS")||"{}";
 let secrets:Record<string,string>={};try{secrets=JSON.parse(bag);}catch(_){}
 const key=secrets.default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!url||!key)throw new Error("Server database credentials unavailable");
 db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});return db;
}
function rateLimit(ip:string){const now=Date.now(),old=limits.get(ip);if(!old||now-old.t>600000){limits.set(ip,{n:1,t:now});return true;}if(old.n>=60)return false;old.n++;return true;}
function validUuid(v:string){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);}
function normalize(value:string){return value.normalize("NFKC").replace(/[\s　，。！？；：、,.!?;:（）()“”"']/g,"").toLowerCase();}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin")||ORIGIN,respond=(body:unknown,status=200)=>reply(body,status,origin);
 if(!ALLOWED.has(origin))return respond({ok:false,code:"ORIGIN",error:"Origin not allowed"},403);
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors(origin)});
 if(req.method!=="POST")return respond({ok:false,code:"METHOD",error:"Method not allowed"},405);
 const ip=(req.headers.get("cf-connecting-ip")||req.headers.get("x-forwarded-for")||"unknown").split(",")[0].trim().slice(0,80);
 if(!rateLimit(ip))return respond({ok:false,code:"RATE_LIMIT",error:"操作过于频繁，请稍后重试。"},429);
 try{
  const raw=await req.text();if(raw.length>20000)return respond({ok:false,code:"TOO_LARGE",error:"请求内容过长。"},413);
  const body=JSON.parse(raw),action=String(body?.action||""),id=String(body?.id||""),expected=Number(body?.expected_revision);
  const client=getDb();
  if(action==="withdrawn"){
   const chinese=String(body?.chinese_text||"").trim(),normalized=normalize(chinese);
   const sourceKind=String(body?.source_kind||"translation");
   if(!chinese||!normalized||normalized.length>2000)return respond({ok:false,code:"INVALID_CHINESE",error:"中文内容不正确。"},400);
   if(sourceKind!=="dictionary"&&sourceKind!=="translation")return respond({ok:false,code:"INVALID_SOURCE_KIND",error:"发音来源类型无效。"},400);
   const {data,error}=await client.from("shared_pronunciation_variants").select("*")
    .eq("normalized_chinese",normalized).eq("source_kind",sourceKind).eq("status","rejected").order("updated_at",{ascending:false}).limit(50);
   if(error)throw error;
   return respond({ok:true,variants:data||[]});
  }
  if(!validUuid(id))return respond({ok:false,code:"INVALID_ID",error:"发音记录编号无效。"},400);
  if(!Number.isSafeInteger(expected)||expected<1)return respond({ok:false,code:"INVALID_REVISION",error:"缺少有效版本号，请刷新后重试。"},400);
  if(action==="history"){
   const {data,error}=await client.from("shared_pronunciation_variant_history").select("id,variant_id,action,previous_data,new_data,revision,changed_at")
    .eq("variant_id",id).order("revision",{ascending:false}).limit(30);
   if(error)throw error;return respond({ok:true,history:data||[]});
  }
  if(action==="update"){
   const pronunciation=String(body?.pronunciation_cn||"").trim(),pinyin=String(body?.pinyin_key||"").trim().toLowerCase().replace(/\s+/g," ");
   if(!pronunciation||pronunciation.length>2000||/[\u0000-\u001f\u007f]/.test(pronunciation))return respond({ok:false,code:"INVALID_READING",error:"中文谐音必须填写，长度为 1–2000 字。"},400);
   if(!pinyin||pinyin.length>16000||!/^[a-züv]+(?: [a-züv]+)*$/.test(pinyin))return respond({ok:false,code:"INVALID_PINYIN",error:"读音拼音格式无效，请检查汉字后重试。"},400);
   const {data,error}=await client.rpc("dwss_update_pronunciation_variant",{
    p_id:id,p_expected_revision:expected,p_pronunciation_cn:pronunciation,p_pinyin_key:pinyin
   });
   if(error){
    if(error.code==="40001"||String(error.message||"").includes("REVISION_CONFLICT"))return respond({ok:false,code:"REVISION_CONFLICT",error:"这条读音刚被其他用户修改。请刷新并核对最新读音后再保存。"},409);
    if(String(error.message||"").includes("VARIANT_NOT_FOUND"))return respond({ok:false,code:"VARIANT_NOT_FOUND",error:"这条读音已不存在，请刷新读音列表。"},404);
    console.error("[DWSS] pronunciation cluster update RPC failed:",error);
    return respond({ok:false,code:"UPDATE_FAILED",error:"保存或合并读音失败，原记录没有被确认覆盖。"},500);
   }
   if(!data||data.ok!==true||!data.variant)return respond({ok:false,code:"UPDATE_FAILED",error:"服务器没有返回更新后的读音。"},503);
   return respond({ok:true,variant:data.variant,merged:!!data.merged,retired_variant_id:data.retired_variant_id||null});
  }
  if(action==="withdraw"||action==="unwithdraw"){
   const patch=action==="withdraw"
    ?{status:"rejected",reviewed_at:null,reviewed_by:null,review_note:"用户撤回修正",revision:expected+1,updated_at:new Date().toISOString()}
    :{status:"pending",reviewed_at:null,reviewed_by:null,review_note:"恢复已撤回的读音",revision:expected+1,updated_at:new Date().toISOString()};
   let query=client.from("shared_pronunciation_variants").update(patch).eq("id",id).eq("revision",expected);
   query=action==="withdraw"?query.neq("status","rejected"):query.eq("status","rejected");
   const {data,error}=await query.select("*").maybeSingle();
   if(error)throw error;if(!data)return respond({ok:false,code:"REVISION_CONFLICT",error:"这条读音已被其他用户修改、撤回或恢复。请刷新后重试。"},409);
   return respond({ok:true,variant:data});
  }
  if(action==="restore"){
   const historyId=String(body?.history_id||"");if(!validUuid(historyId))return respond({ok:false,code:"INVALID_HISTORY_ID",error:"历史版本编号无效。"},400);
   const {data:history,error:historyError}=await client.from("shared_pronunciation_variant_history").select("id,variant_id,previous_data")
    .eq("id",historyId).eq("variant_id",id).maybeSingle();
   if(historyError)throw historyError;if(!history)return respond({ok:false,code:"HISTORY_NOT_FOUND",error:"找不到要恢复的历史版本。"},404);
   const previous=history.previous_data||{};
   const {data,error}=await client.from("shared_pronunciation_variants").update({
    pronunciation_cn:String(previous.pronunciation_cn||""),pinyin_key:previous.pinyin_key||null,
    pronunciation_aliases:Array.isArray(previous.pronunciation_aliases)?previous.pronunciation_aliases:[],
    source_submission_ids:Array.isArray(previous.source_submission_ids)?previous.source_submission_ids:[],
    status:"pending",reviewed_at:null,reviewed_by:null,review_note:"恢复历史版本",
    revision:expected+1,updated_at:new Date().toISOString()
   }).eq("id",id).eq("revision",expected).select("*").maybeSingle();
   if(error)throw error;if(!data)return respond({ok:false,code:"REVISION_CONFLICT",error:"这条读音刚刚发生变化。请刷新后重新选择历史版本。"},409);
   return respond({ok:true,variant:data});
  }
  return respond({ok:false,code:"INVALID_ACTION",error:"不支持的操作。"},400);
 }catch(error){console.error("[DWSS] manage pronunciation variant failed:",error);return respond({ok:false,code:"SERVER_ERROR",error:"云端暂时无法处理，请稍后重试。"},503);}
});