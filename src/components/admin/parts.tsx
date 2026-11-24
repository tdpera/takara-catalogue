import type { Translate } from "@/i18n";
import type { Issue, ShopStatus } from "@/lib/shop-issues";
import { formatPhone } from "@/lib/phone";
import { setShopStatus } from "@/app/admin/actions";
import { btn, btnPrimary } from "@/components/ui";

/** "Waiting", "Suspended" or "Demo" next to a shop's name; nothing for an ordinary open shop. */
export function StatusBadge({ status, isDemo, t }: { status: ShopStatus; isDemo: boolean; t: Translate }) {
  if (isDemo) return <span className="caps rounded-[2px] bg-gold-soft px-1.5 py-0.5 text-[10px] font-semibold text-gold">{t("admin.demo")}</span>;
  if (status === "active") return null;
  return (
    <span className={`caps rounded-[2px] px-1.5 py-0.5 text-[10px] font-semibold ${status === "pending" ? "bg-warn-soft text-warn" : "bg-tile text-danger"}`}>
      {t(status === "pending" ? "admin.status_pending" : "admin.status_suspended")}
    </span>
  );
}

/** One issue in words, e.g. "Gold rates not updated for 4 days". */
export function issueText(i: Issue, t: Translate): string {
  switch (i.kind) {
    case "choices": return t("admin.issue_choices", { count: i.count });
    case "ai": return t("admin.issue_ai", { count: i.count });
    case "photos": return t("admin.issue_photos", { count: i.count });
    case "rates": return i.count < 0 ? t("admin.issue_ratesNever") : t("admin.issue_rates", { count: i.count });
    case "quiet": return i.count < 0 ? t("admin.issue_quietNever") : t("admin.issue_quiet", { count: i.count });
    case "nosite": return t("admin.flag_nosite");
  }
}

/** Short label for the shops table. */
export function IssueChip({ i, t }: { i: Issue; t: Translate }) {
  const label = { choices: "admin.flag_choices", ai: "admin.flag_ai", photos: "admin.flag_photos", rates: "admin.flag_stale", quiet: "admin.flag_quiet", nosite: "admin.flag_nosite" } as const;
  return (
    <li title={issueText(i, t)} className={`caps rounded-[2px] px-1.5 py-0.5 text-[10px] font-semibold ${i.level === 0 ? "bg-tile text-muted" : "bg-warn-soft text-warn"}`}>
      {t(label[i.kind])}
    </li>
  );
}

/** The shop owner's number, opening a WhatsApp chat (Takara writes to them; nothing is sent automatically). */
export function OwnerPhone({ phone }: { phone: string | null }) {
  if (!phone) return null;
  const e164 = "+" + phone.replace(/^\+/, "");
  return <a href={`https://wa.me/${e164.replace(/\D/g, "")}`} target="_blank" rel="noopener" className="font-semibold hover:underline" dir="ltr">{formatPhone(e164)}</a>;
}

/** Approve / Decline for a waiting shop; Suspend / Reactivate for the others. */
export function StatusButtons({ id, name, status, t }: { id: string; name: string; status: ShopStatus; t: Translate }) {
  const button = (to: "active" | "suspended", text: string, aria: string, primary: boolean) => (
    <form action={setShopStatus}>
      <input type="hidden" name="shop" value={id} />
      <input type="hidden" name="status" value={to} />
      <button className={primary ? btnPrimary : btn} aria-label={aria}>{text}</button>
    </form>
  );
  if (status === "pending") {
    return (
      <div className="flex flex-wrap gap-2">
        {button("active", t("admin.approve"), t("admin.approveNamed", { shop: name }), true)}
        {button("suspended", t("admin.decline"), t("admin.declineNamed", { shop: name }), false)}
      </div>
    );
  }
  return status === "active"
    ? button("suspended", t("admin.suspend"), t("admin.suspendNamed", { shop: name }), false)
    : button("active", t("admin.reactivate"), t("admin.reactivateNamed", { shop: name }), true);
}
