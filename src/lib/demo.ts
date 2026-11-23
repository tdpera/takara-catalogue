/**
 * The demo account: anyone can sign in with the demo number (a Supabase test number with a
 * fixed code) and open a ready demo shop, for pitching and judging. The sign-in page shows the
 * number and code unless NEXT_PUBLIC_DEMO_LOGIN is "off". The demo account is never a Takara
 * admin and holds no real data; "Load the demo shop" rebuilds its demo shop from scratch.
 */
export const DEMO_PHONE = process.env.NEXT_PUBLIC_DEMO_PHONE || "+971500000001";
export const DEMO_CODE = "123456";
export const demoEnabled = () => process.env.NEXT_PUBLIC_DEMO_LOGIN !== "off";

/** "+971500000001" -> "050 000 0001", as people type UAE numbers. */
export function demoLocal(phone = DEMO_PHONE): string {
  const d = phone.replace(/\D/g, "");
  if (!d.startsWith("971") || d.length !== 12) return phone;
  const n = "0" + d.slice(3);
  return `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
}

export function isDemoPhone(phone: string | null | undefined): boolean {
  if (!demoEnabled() || !phone) return false;
  return phone.replace(/\D/g, "") === DEMO_PHONE.replace(/\D/g, "");
}
