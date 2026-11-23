"use server";
/**
 * Website settings (owners and managers). RLS on shop_sites and the branding bucket enforces
 * who may change what; these checks are for clear messages.
 */
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireShop } from "@/lib/session";
import { isValidSlug } from "@/lib/site-host";
import { toE164 } from "@/lib/phone";
import { PRICE_MODES } from "@/lib/public-price";
import type { MessageKey } from "@/i18n";

export type WebsiteResult = { ok?: boolean; error?: MessageKey; field?: string } | null;

const text = (max: number) => z.string().trim().max(max);
const Input = z.object({
  slug: z.string().trim().toLowerCase(),
  published: z.boolean(),
  price_mode: z.enum(PRICE_MODES),
  whatsapp: text(30),
  address: text(200),
  maps_url: text(500),
  hours: text(200),
  instagram: text(40),
  about_en: text(600),
  about_ar: text(600),
  about_hi: text(600),
  about_ml: text(600),
});

export async function saveWebsite(_prev: WebsiteResult, form: FormData): Promise<WebsiteResult> {
  const { supabase, current, isAdmin } = await requireShop();
  if (!isAdmin) return { error: "common.notAllowed" };
  const get = (k: string) => String(form.get(k) ?? "");
  const parsed = Input.safeParse({
    slug: get("slug"), published: form.get("published") === "on", price_mode: get("price_mode"),
    whatsapp: get("whatsapp"), address: get("address"), maps_url: get("maps_url"), hours: get("hours"), instagram: get("instagram"),
    about_en: get("about_en"), about_ar: get("about_ar"), about_hi: get("about_hi"), about_ml: get("about_ml"),
  });
  if (!parsed.success) return { error: "website.errInvalid" };
  const f = parsed.data;
  if (!isValidSlug(f.slug)) return { error: "website.errSlug", field: "slug" };
  const whatsapp = f.whatsapp ? toE164(f.whatsapp) : null;
  if (f.whatsapp && !whatsapp) return { error: "website.errWhatsApp", field: "whatsapp" };
  if (f.maps_url && !/^https:\/\/\S+$/.test(f.maps_url)) return { error: "website.errMaps", field: "maps_url" };
  const instagram = f.instagram.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, "");
  if (instagram && !/^[A-Za-z0-9._]{1,30}$/.test(instagram)) return { error: "website.errInstagram", field: "instagram" };
  const about = Object.fromEntries(
    (["en", "ar", "hi", "ml"] as const).flatMap((l) => (f[`about_${l}`] ? [[l, f[`about_${l}`]]] : [])),
  );
  const row = {
    slug: f.slug, published: f.published, price_mode: f.price_mode, whatsapp,
    address: f.address || null, maps_url: f.maps_url || null, hours: f.hours || null, instagram: instagram || null, about,
  };
  const { data: existing } = await supabase.from("shop_sites").select("shop_id").eq("shop_id", current.shop_id).maybeSingle();
  const { error } = existing
    ? await supabase.from("shop_sites").update(row).eq("shop_id", current.shop_id)
    : await supabase.from("shop_sites").insert({ shop_id: current.shop_id, ...row });
  if (error) {
    if (error.code === "23505") return { error: "website.errSlugTaken", field: "slug" };
    if (error.code === "42501") return { error: "common.notAllowed" };
    return { error: "common.error" };
  }
  revalidatePath("/website");
  revalidatePath("/shop");
  return { ok: true };
}

const LOGO_TYPES: Record<string, string> = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg" };

/** The shop's logo: a small square image made on the phone (see LogoForm). */
export async function uploadLogo(form: FormData): Promise<{ ok: true } | { error: MessageKey }> {
  const { supabase, current, isAdmin } = await requireShop();
  if (!isAdmin) return { error: "common.notAllowed" };
  const file = form.get("logo");
  if (!(file instanceof File) || !LOGO_TYPES[file.type] || file.size === 0 || file.size > 2 * 1024 * 1024) return { error: "website.errLogo" };
  const path = `${current.shop_id}/logo-${randomUUID()}.${LOGO_TYPES[file.type]}`;
  const up = await supabase.storage.from("branding").upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) return { error: "website.errLogo" };
  const { data: shop } = await supabase.from("shops").select("logo_path").eq("id", current.shop_id).single<{ logo_path: string | null }>();
  const { error } = await supabase.from("shops").update({ logo_path: path }).eq("id", current.shop_id);
  if (error) {
    await supabase.storage.from("branding").remove([path]);
    return { error: "common.error" };
  }
  if (shop?.logo_path) await supabase.storage.from("branding").remove([shop.logo_path]);
  revalidatePath("/website");
  return { ok: true };
}

export async function removeLogo(): Promise<{ ok: true } | { error: MessageKey }> {
  const { supabase, current, isAdmin } = await requireShop();
  if (!isAdmin) return { error: "common.notAllowed" };
  const { data: shop } = await supabase.from("shops").select("logo_path").eq("id", current.shop_id).single<{ logo_path: string | null }>();
  const { error } = await supabase.from("shops").update({ logo_path: null }).eq("id", current.shop_id);
  if (error) return { error: "common.error" };
  if (shop?.logo_path) await supabase.storage.from("branding").remove([shop.logo_path]);
  revalidatePath("/website");
  return { ok: true };
}

/** Show or hide pieces on the website (one or many, from the catalogue or a piece page). */
export async function setOnWebsite(ids: string[], on: boolean): Promise<{ ok: true; count: number } | { error: MessageKey }> {
  const { supabase, current, isAdmin } = await requireShop();
  if (!isAdmin) return { error: "common.notAllowed" };
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500 || !ids.every((x) => z.uuid().safeParse(x).success)) return { error: "common.error" };
  const { data, error } = await supabase.rpc("set_on_website", { p_shop: current.shop_id, p_pieces: ids, p_on: !!on });
  if (error) return { error: error.code === "42501" ? "common.notAllowed" : "common.error" };
  revalidatePath("/");
  for (const id of ids.slice(0, 20)) revalidatePath(`/p/${id}`);
  return { ok: true, count: Number(data ?? 0) };
}
