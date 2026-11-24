/**
 * "Needs attention" on the Takara dashboard: what's going wrong in each shop, worst first.
 * Worked out from the counts admin_shops / admin_shop return (no customer details).
 */
import { rateAgeDays } from "./rates";

export type ShopHealth = { choices_waiting: number; ai_errors_7d: number; no_photo: number };
export type ShopStatus = "pending" | "active" | "suspended";

/** The fields of an admin_shops / admin_shop row this needs. */
export type ShopIssueInput = {
  status: ShopStatus;
  is_demo: boolean;
  last_activity: string | null;
  rates_set_at: string | null;
  site: { published: boolean } | null;
  health: ShopHealth;
};

export type IssueKind = "choices" | "ai" | "photos" | "rates" | "quiet" | "nosite";
/** 3: customers are waiting; 2: something is broken or out of date; 1: worth a call; 0: a note. */
export type Issue = { kind: IssueKind; level: 0 | 1 | 2 | 3; count: number };

const DAY = 86400_000;

/** A shop's issues, worst first. Only open shops have any: one waiting or suspended has nothing to fix. */
export function shopIssues(s: ShopIssueInput, now: Date = new Date()): Issue[] {
  if (s.status !== "active") return [];
  const out: Issue[] = [];
  const h = s.health;
  if (h.choices_waiting > 0) out.push({ kind: "choices", level: 3, count: h.choices_waiting });
  if (h.ai_errors_7d > 0) out.push({ kind: "ai", level: 2, count: h.ai_errors_7d });
  if (h.no_photo > 0) out.push({ kind: "photos", level: 2, count: h.no_photo });
  const rateDays = s.rates_set_at ? rateAgeDays(s.rates_set_at, now) : -1;
  if (rateDays < 0 || rateDays >= 3) out.push({ kind: "rates", level: 2, count: rateDays });
  const quietDays = s.last_activity ? Math.floor((now.getTime() - Date.parse(s.last_activity)) / DAY) : -1;
  if (quietDays < 0 || quietDays >= 7) out.push({ kind: "quiet", level: 1, count: quietDays });
  if (!s.site?.published) out.push({ kind: "nosite", level: 0, count: 0 });
  return out.sort((a, b) => b.level - a.level || b.count - a.count);
}

/**
 * Every real shop's issues in one list, worst first: the example (demo) shop is left out, and so
 * are notes (level 0), which stay on the shop's own row.
 */
export function needsAttention<T extends ShopIssueInput & { id: string; name: string }>(shops: T[], now: Date = new Date()) {
  return shops
    .filter((s) => !s.is_demo)
    .flatMap((s) => shopIssues(s, now).filter((i) => i.level > 0).map((issue) => ({ shop: s, issue })))
    .sort((a, b) => b.issue.level - a.issue.level || b.issue.count - a.issue.count || a.shop.name.localeCompare(b.shop.name));
}
