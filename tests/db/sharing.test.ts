/**
 * Step 6: what a share link reveals, and how views are counted. The public page has no login,
 * so it may only see a valid share's pieces through get_share(token).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, createUser, deleteUsers, ok, type TestUser } from "./helpers";

let owner: TestUser, sales: TestUser, other: TestUser;
let shop: string, otherShop: string;
let p1: string, p2: string, p3: string;
let clientId: string;

async function share(u: TestUser, pieces: string[], extra: Record<string, unknown> = {}) {
  return ok(
    await u.db.from("shares").insert({ shop_id: shop, salesperson_id: u.id, piece_ids: pieces, message: "Hello", ...extra }).select("id, public_token").single(),
  ) as { id: string; public_token: string };
}
async function addPiece(u: TestUser, s: string, name: string) {
  return (ok(await u.db.from("pieces").insert({ shop_id: s, name, category: "Ring", karat: 22, gross_g: 5, created_by: u.id }).select("id").single()) as { id: string }).id;
}

beforeAll(async () => {
  [owner, sales, other] = await Promise.all(Array.from({ length: 3 }, createUser));
  shop = ok(await owner.db.rpc("create_shop", { p_name: "Share Shop" })) as string;
  otherShop = ok(await other.db.rpc("create_shop", { p_name: "Other Shop" })) as string;
  ok(await owner.db.rpc("invite_member", { p_shop: shop, p_phone: sales.phone, p_role: "salesperson" }));
  ok(await sales.db.rpc("accept_invites"));
  ok(await owner.db.from("gold_rates").insert({ shop_id: shop, karat: 22, aed_per_g: 437.5, set_by: owner.id }));
  p1 = await addPiece(sales, shop, "First ring");
  p2 = await addPiece(sales, shop, "Second ring");
  p3 = await addPiece(other, otherShop, "Not yours");
  clientId = (ok(await sales.db.from("clients").insert({
    shop_id: shop, salesperson_id: sales.id, name: "Fatima Al Mansoori", phone: "+971501234567", language: "ar", preferences: "Likes light daily wear",
  }).select("id").single()) as { id: string }).id;
});

afterAll(async () => {
  await deleteUsers([owner, sales, other]);
});

describe("get_share (the server, for the public tray page)", () => {
  it("visitors can't call it directly: it returns making charges for pricing", async () => {
    const s = await share(sales, [p1]);
    expect((await anonClient().rpc("get_share", { p_token: s.public_token })).error).not.toBeNull();
    expect((await sales.db.rpc("get_share", { p_token: s.public_token })).error).not.toBeNull();
  });

  it("shows a valid share's pieces, in the chosen order, in the client's language", async () => {
    const s = await share(sales, [p2, p1], { client_id: clientId });
    const data = ok(await adminClient().rpc("get_share", { p_token: s.public_token })) as Record<string, unknown> & { pieces: { name: string }[] };
    expect(data.status).toBe("ok");
    expect(data.shop).toBe("Share Shop");
    expect(data.language).toBe("ar");
    expect(data.pieces.map((p) => p.name)).toEqual(["Second ring", "First ring"]);
    expect((data.rates as unknown[]).length).toBe(1);
  });

  it("reveals nothing about the client, the salesperson or the message", async () => {
    const s = await share(sales, [p1], { client_id: clientId });
    const json = JSON.stringify(ok(await adminClient().rpc("get_share", { p_token: s.public_token })));
    for (const secret of ["Fatima", "+971501234567", "Likes light", sales.id, clientId, "Hello", s.id]) expect(json).not.toContain(secret);
  });

  it("returns nothing for unknown tokens and only 'expired' for revoked or expired links", async () => {
    expect(ok(await adminClient().rpc("get_share", { p_token: "x".repeat(22) }))).toBeNull();
    expect(ok(await adminClient().rpc("get_share", { p_token: "short" }))).toBeNull();
    const a = await share(sales, [p1]);
    ok(await sales.db.from("shares").update({ revoked_at: new Date().toISOString() }).eq("id", a.id));
    expect(ok(await adminClient().rpc("get_share", { p_token: a.public_token }))).toEqual({ status: "expired", shop: "Share Shop" });
    const b = await share(sales, [p1]);
    ok(await adminClient().from("shares").update({ created_at: new Date(Date.now() - 2 * 86400_000).toISOString(), expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", b.id));
    expect(ok(await adminClient().rpc("get_share", { p_token: b.public_token }))).toEqual({ status: "expired", shop: "Share Shop" });
  });

  it("expires after 7 days by default", async () => {
    const s = await share(sales, [p1]);
    const row = ok(await sales.db.from("shares").select("expires_at, created_at").eq("id", s.id).single()) as { expires_at: string; created_at: string };
    expect(new Date(row.expires_at).getTime() - new Date(row.created_at).getTime()).toBe(7 * 24 * 3600 * 1000);
  });

  it("can't include another shop's pieces or another salesperson's client", async () => {
    const r1 = await sales.db.from("shares").insert({ shop_id: shop, salesperson_id: sales.id, piece_ids: [p1, p3] });
    expect(r1.error?.code).toBe("42501");
    const r2 = await owner.db.from("shares").insert({ shop_id: shop, salesperson_id: owner.id, piece_ids: [p1], client_id: clientId });
    expect(r2.error?.code).toBe("42501");
  });

  it("keeps shares private to their salesperson, and away from anonymous users", async () => {
    const s = await share(sales, [p1]);
    expect(ok(await owner.db.from("shares").select("id").eq("id", s.id))).toHaveLength(0);
    // Anonymous users have no access to the tables at all (an error, or at best nothing).
    for (const table of ["shares", "share_views", "clients"]) {
      const r = await anonClient().from(table).select("id");
      expect(r.error !== null || (r.data ?? []).length === 0).toBe(true);
    }
  });
});

describe("record_share_view", () => {
  it("counts a client's first visit, not repeats within 30 minutes", async () => {
    const s = await share(sales, [p1]);
    const anon = anonClient();
    expect(ok(await anon.rpc("record_share_view", { p_token: s.public_token, p_visitor: "visitor-a" }))).toBe(true);
    expect(ok(await anon.rpc("record_share_view", { p_token: s.public_token, p_visitor: "visitor-a" }))).toBe(false);
    expect(ok(await anon.rpc("record_share_view", { p_token: s.public_token, p_visitor: "visitor-b" }))).toBe(true);
    const views = ok(await sales.db.from("share_views").select("visitor_hash").eq("share_id", s.id)) as unknown[];
    expect(views).toHaveLength(2);
    const ev = ok(await adminClient().from("events").select("user_id, props").eq("name", "share_viewed").eq("shop_id", shop)) as { user_id: string | null; props: { share_id: string } }[];
    expect(ev.filter((e) => e.props.share_id === s.id)).toEqual([
      { user_id: null, props: { share_id: s.id } },
      { user_id: null, props: { share_id: s.id } },
    ]);
  });

  it("ignores the salesperson opening their own link", async () => {
    const s = await share(sales, [p1]);
    expect(ok(await sales.db.rpc("record_share_view", { p_token: s.public_token, p_visitor: "me" }))).toBe(false);
  });

  it("ignores revoked links and nonsense", async () => {
    const s = await share(sales, [p1]);
    ok(await sales.db.from("shares").update({ revoked_at: new Date().toISOString() }).eq("id", s.id));
    expect(ok(await anonClient().rpc("record_share_view", { p_token: s.public_token, p_visitor: "v" }))).toBe(false);
    expect(ok(await anonClient().rpc("record_share_view", { p_token: "nope", p_visitor: "v" }))).toBe(false);
  });

  it("can't be faked by inserting views directly", async () => {
    const s = await share(sales, [p1]);
    expect((await anonClient().from("share_views").insert({ share_id: s.id })).error).not.toBeNull();
    expect((await sales.db.from("share_views").insert({ share_id: s.id })).error).not.toBeNull();
  });
});

describe("AI request kinds", () => {
  it("counts messages separately from fills, against the same limits", async () => {
    const id = ok(await sales.db.rpc("claim_ai_request", { p_shop: shop, p_piece: null, p_kind: "message" })) as string;
    const row = ok(await sales.db.from("ai_requests").select("kind").eq("id", id).single()) as { kind: string };
    expect(row.kind).toBe("message");
    expect((await sales.db.rpc("claim_ai_request", { p_shop: shop, p_piece: null, p_kind: "essay" })).error?.code).toBe("22023");
    const fill = ok(await sales.db.rpc("claim_ai_request", { p_shop: shop, p_piece: null })) as string;
    expect((ok(await sales.db.from("ai_requests").select("kind").eq("id", fill).single()) as { kind: string }).kind).toBe("fill");
  });
});
