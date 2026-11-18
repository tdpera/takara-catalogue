"use server";
import { supabaseServer } from "@/lib/supabase/server";
import { formatPhone, toE164 } from "@/lib/phone";
import type { MessageKey } from "@/i18n";

type Channel = "whatsapp" | "sms";
export type SendResult = { phone: string; display: string; channel: Channel } | { error: MessageKey };
export type VerifyResult = { ok: true } | { error: MessageKey };

function errorKey(err: { status?: number; code?: string }, stage: "send" | "verify"): MessageKey {
  if (err.status === 429 || err.code?.startsWith("over_")) return "login.tooMany";
  if (stage === "verify") return "login.invalidCode";
  if (err.code === "validation_failed") return "login.invalidPhone";
  // The SMS/WhatsApp provider refused (bad provider settings, unverified trial number, …).
  if (err.code === "sms_send_failed") return "login.sendFailed";
  return "common.error";
}

export async function sendCode(rawPhone: string, channel: Channel): Promise<SendResult> {
  const phone = toE164(rawPhone);
  if (!phone) return { error: "login.invalidPhone" };
  const ch: Channel = channel === "sms" ? "sms" : "whatsapp";
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithOtp({ phone, options: { channel: ch } });
  if (error) return { error: errorKey(error, "send") };
  return { phone, display: formatPhone(phone), channel: ch };
}

export async function verifyCode(phone: string, code: string): Promise<VerifyResult> {
  const token = code.replace(/\D/g, "");
  if (token.length !== 6 || !toE164(phone)) return { error: "login.invalidCode" };
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
  if (error) return { error: errorKey(error, "verify") };
  // Join any shop that invited this number.
  await supabase.rpc("accept_invites");
  return { ok: true };
}
