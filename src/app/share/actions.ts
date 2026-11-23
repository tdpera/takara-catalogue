"use server";
/**
 * Share composer actions. They run as the signed-in salesperson (RLS applies), and never send
 * anything to a client: they create a link or a text that the salesperson sends themselves.
 */
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { toE164 } from "@/lib/phone";
import { loadShareItems, type ClientRow } from "@/lib/share-data";
import { buildMessage, checkAiPart, firstName, type MsgLang } from "@/lib/share-message";
import { writeMessageParts } from "@/lib/ai/claude";
import { getShopPricing } from "@/lib/shop-data";

type Fail = { ok: false; error: string; retryAfterS?: number };

async function session() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  return data.user ? { supabase, user: data.user } : null;
}

async function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

// ------------------------------------------------------------------ create a share link

const CreateInput = z.object({
  shopId: z.uuid(),
  pieceIds: z.array(z.uuid()).min(1).max(24),
  clientId: z.uuid().nullable(),
  message: z.string().max(4000),
  aiMessage: z.boolean(),
  days: z.union([z.literal(1), z.literal(7), z.literal(30)]).default(7),
});

export async function createShare(raw: unknown): Promise<{ ok: true; id: string; url: string; expiresAt: string } | Fail> {
  const parsed = CreateInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const s = await session();
  if (!s) return { ok: false, error: "auth" };
  const { shopId, pieceIds, clientId, message, aiMessage, days } = parsed.data;
  const expiresAt = new Date(Date.now() + days * 86400_000).toISOString();
  const ins = await s.supabase
    .from("shares")
    .insert({ shop_id: shopId, salesperson_id: s.user.id, piece_ids: pieceIds, client_id: clientId, message: message.trim() || null, expires_at: expiresAt })
    .select("id, public_token, expires_at")
    .single();
  if (ins.error) return { ok: false, error: ins.error.code === "42501" ? "not_allowed" : "failed" };
  await s.supabase.from("events").insert({
    shop_id: shopId,
    user_id: s.user.id,
    name: "share_created",
    props: { share_id: ins.data.id, pieces: pieceIds.length, has_client: !!clientId, ai_message: aiMessage, days },
  });
  revalidatePath("/trays");
  return { ok: true, id: ins.data.id, url: `${await siteUrl()}/s/${ins.data.public_token}`, expiresAt: ins.data.expires_at };
}

// ------------------------------------------------------------------ write with AI

const AiInput = z.object({ shopId: z.uuid(), pieceIds: z.array(z.uuid()).min(1).max(24), clientId: z.uuid().nullable() });

/**
 * Personal message in the client's language. Claude writes only the greeting and the closing;
 * the piece lines and price note are inserted here from the server's own prices.
 */
export async function writeWithAi(raw: unknown): Promise<{ ok: true; message: string; lang: MsgLang } | Fail> {
  const parsed = AiInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const s = await session();
  if (!s) return { ok: false, error: "auth" };
  const { shopId, pieceIds, clientId } = parsed.data;

  const [items, client, shop, pricing] = await Promise.all([
    loadShareItems(shopId, pieceIds, false),
    clientId
      ? s.supabase.from("clients").select("id, name, phone, language, preferences").eq("id", clientId).maybeSingle<ClientRow>()
      : Promise.resolve({ data: null, error: null }),
    s.supabase.from("shops").select("name").eq("id", shopId).maybeSingle<{ name: string }>(),
    getShopPricing(shopId),
  ]);
  if (items.length === 0 || !shop.data) return { ok: false, error: "invalid" };
  if (clientId && !client.data) return { ok: false, error: "invalid" };
  const lang: MsgLang = client.data?.language ?? "en";

  const claim = await s.supabase.rpc("claim_ai_request", { p_shop: shopId, p_piece: null, p_kind: "message" });
  if (claim.error) {
    if (claim.error.message === "ai_rate_user") return { ok: false, error: "rate_limited", retryAfterS: Number(claim.error.hint) || 60 };
    if (claim.error.message === "ai_rate_shop") return { ok: false, error: "quota" };
    return { ok: false, error: claim.error.code === "42501" ? "forbidden" : "busy" };
  }
  const started = Date.now();
  const input = {
    lang,
    clientFirstName: firstName(client.data?.name) || null,
    clientNotes: client.data?.preferences ?? null,
    pieces: items.map((i) => ({ name: i.name, category: i.category })),
  };
  // One retry if the text breaks a rule (for example, it contains a number).
  let run = await writeMessageParts(input);
  let intro: string | null = null, closing: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt === 1) run = await writeMessageParts(input);
    if (!run.ok) break;
    intro = checkAiPart(lang, run.intro);
    closing = checkAiPart(lang, run.closing);
    if (intro && closing) break;
  }
  const good = run.ok && intro && closing;
  await s.supabase.rpc("finish_ai_request", {
    p_id: claim.data,
    p_status: good ? "ok" : run.ok ? "invalid_output" : run.error === "not_configured" ? "error" : run.error,
    p_model: run.model ?? null,
    p_input_tokens: run.inputTokens ?? null,
    p_output_tokens: run.outputTokens ?? null,
    p_duration_ms: Date.now() - started,
    p_result: good ? { kind: "message", lang } : null,
  });
  if (!run.ok) return { ok: false, error: run.error, retryAfterS: run.retryAfterS };
  if (!good) return { ok: false, error: "invalid_output" };
  return { ok: true, lang, message: buildMessage({ intro: intro!, closing: closing!, lines: items, vat: pricing.vatEnabled, shop: shop.data.name, lang }) };
}

// ------------------------------------------------------------------ clients

const ClientInput = z.object({
  id: z.uuid().nullable(),
  shopId: z.uuid(),
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(30),
  language: z.enum(["en", "ar", "hi", "ml"]),
  preferences: z.string().trim().max(1000),
});

export async function saveClient(raw: unknown): Promise<{ ok: true; client: ClientRow } | Fail> {
  const parsed = ClientInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const c = parsed.data;
  const phone = c.phone ? toE164(c.phone) : null;
  if (c.phone && !phone) return { ok: false, error: "phone" };
  const s = await session();
  if (!s) return { ok: false, error: "auth" };
  const row = { name: c.name, phone, language: c.language, preferences: c.preferences || null };
  const res = c.id
    ? await s.supabase.from("clients").update(row).eq("id", c.id).select("id, name, phone, language, preferences").single<ClientRow>()
    : await s.supabase.from("clients").insert({ ...row, shop_id: c.shopId, salesperson_id: s.user.id }).select("id, name, phone, language, preferences").single<ClientRow>();
  if (res.error) return { ok: false, error: res.error.code === "42501" ? "not_allowed" : "failed" };
  revalidatePath("/clients");
  return { ok: true, client: res.data };
}

export async function deleteClient(id: string): Promise<{ ok: true } | Fail> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "invalid" };
  const s = await session();
  if (!s) return { ok: false, error: "auth" };
  const { data, error } = await s.supabase.from("clients").delete().eq("id", id).select("id");
  if (error || !data?.length) return { ok: false, error: "failed" };
  revalidatePath("/clients");
  return { ok: true };
}

// ------------------------------------------------------------------ manage shares

export async function revokeShare(id: string): Promise<{ ok: true } | Fail> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "invalid" };
  const s = await session();
  if (!s) return { ok: false, error: "auth" };
  const { data, error } = await s.supabase.from("shares").update({ revoked_at: new Date().toISOString() }).eq("id", id).is("revoked_at", null).select("id");
  if (error || !data?.length) return { ok: false, error: "failed" };
  revalidatePath("/trays");
  return { ok: true };
}
