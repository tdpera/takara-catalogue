/**
 * Shops approved by Takara: a new shop waits, its staff can't use it until a Takara admin
 * approves it, and a suspended shop's links and website stop working. Also the health counts
 * behind "Needs attention".
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, createUser, deleteUsers, ok, type TestUser } from "./helpers";

let owner: TestUser, sales: TestUser, takara: TestUser;
let shop: string;
let piece: string;
let token: string;
const slug = "appr-" + Math.random().toString(36).slice(2, 8);

const status = async () => (ok(await adminClient().from("shops").select("status").eq("id", shop).single()) as { status: string }).status;

beforeAll(async () => {
  [owner, sales, takara] = await Promise.all(Array.from({ length: 3 }, createUser));
  ok(await adminClient().from("platform_admins").insert({ user_id: takara.id }));
});

afterAll(async () => {
  await deleteUsers([owner, sales, takara]);
});

describe("a new shop waits for approval", () => {
  it("starts pending, and its owner sees it only on the waiting screen", async () => {
    shop = ok(await owner.db.rpc("create_shop", { p_name: "Waiting Jewellers" })) as string;
    expect(await status()).toBe("pending");
    const mine = ok(await owner.db.rpc("my_shop_requests")) as { id: string; status: string; role: string }[];
    expect(mine).toMatchObject([{ id: shop, status: "pending", role: "owner" }]);
    expect(ok(await owner.db.from("shops").select("id"))).toEqual([]);
    expect(ok(await owner.db.from("shop_members").select("shop_id"))).toEqual([]);
  });
  it("its staff can't add or read anything yet", async () => {
    const ins = await owner.db.from("pieces").insert({ shop_id: shop, name: "Early ring", category: "Ring", karat: 22, gross_g: 5, making_per_g: 17, created_by: owner.id });
    expect(ins.error).not.toBeNull();
    expect((await owner.db.from("gold_rates").insert({ shop_id: shop, karat: 22, aed_per_g: 437.5, set_by: owner.id })).error).not.toBeNull();
    expect((await owner.db.rpc("invite_member", { p_shop: shop, p_phone: sales.phone, p_role: "salesperson" })).error).not.toBeNull();
    expect((await owner.db.storage.from("media").upload(`${shop}/x/a.jpg`, new Blob(["x"]), { contentType: "image/jpeg" })).error).not.toBeNull();
  });
  it("one request at a time", async () => {
    expect((await owner.db.rpc("create_shop", { p_name: "Second try" })).error?.message).toBe("already_waiting");
  });
  it("staff can't approve their own shop", async () => {
    expect((await owner.db.rpc("admin_set_shop_status", { p_shop: shop, p_status: "active" })).error).not.toBeNull();
    await owner.db.from("shops").update({ status: "active" } as never).eq("id", shop);
    expect(await status()).toBe("pending");
  });
});

describe("Takara approves, suspends and reactivates", () => {
  it("the waiting shop shows in Takara's list with its owner's number", async () => {
    const rows = ok(await takara.db.rpc("admin_shops")) as { id: string; status: string; is_demo: boolean; owner: { phone: string } }[];
    const row = rows.find((r) => r.id === shop)!;
    expect(row).toMatchObject({ status: "pending", is_demo: false });
    expect(row.owner.phone.replace(/^\+?/, "+")).toBe(owner.phone);
    const ov = ok(await takara.db.rpc("admin_overview")) as { pending: number };
    expect(ov.pending).toBeGreaterThanOrEqual(1);
  });
  it("approving opens the shop straight away, and is logged", async () => {
    expect(ok(await takara.db.rpc("admin_set_shop_status", { p_shop: shop, p_status: "active" }))).toBe("active");
    expect(ok(await owner.db.from("shops").select("id"))).toEqual([{ id: shop }]);
    expect(ok(await owner.db.rpc("my_shop_requests"))).toEqual([]);
    ok(await owner.db.from("gold_rates").insert({ shop_id: shop, karat: 22, aed_per_g: 437.5, set_by: owner.id }));
    piece = (ok(await owner.db.from("pieces").insert({ shop_id: shop, name: "First ring", category: "Ring", karat: 22, gross_g: 5, making_per_g: 17, created_by: owner.id }).select("id").single()) as { id: string }).id;
    ok(await owner.db.rpc("invite_member", { p_shop: shop, p_phone: sales.phone, p_role: "salesperson" }));
    ok(await sales.db.rpc("accept_invites"));
    const ev = ok(await adminClient().from("events").select("name, user_id, props").eq("shop_id", shop).eq("name", "shop_status")) as { user_id: string; props: { from: string; to: string } }[];
    expect(ev).toMatchObject([{ user_id: takara.id, props: { from: "pending", to: "active" } }]);
    // Something to share, and a website.
    token = (ok(await sales.db.from("shares").insert({ shop_id: shop, salesperson_id: sales.id, piece_ids: [piece] }).select("public_token").single()) as { public_token: string }).public_token;
    ok(await owner.db.from("shop_sites").insert({ shop_id: shop, slug, published: true }));
    ok(await owner.db.rpc("set_on_website", { p_shop: shop, p_pieces: [piece], p_on: true }));
    expect((ok(await adminClient().rpc("get_share", { p_token: token })) as { status: string }).status).toBe("ok");
    expect(ok(await adminClient().rpc("get_site", { p_slug: slug }))).not.toBeNull();
  });
  it("only 'active' and 'suspended' can be set", async () => {
    expect((await takara.db.rpc("admin_set_shop_status", { p_shop: shop, p_status: "pending" })).error).not.toBeNull();
  });
  it("suspending closes the app for its staff, and its tray links and website", async () => {
    ok(await takara.db.rpc("admin_set_shop_status", { p_shop: shop, p_status: "suspended" }));
    expect(ok(await sales.db.from("pieces").select("id"))).toEqual([]);
    expect((ok(await sales.db.rpc("my_shop_requests")) as { status: string; role: string }[])).toMatchObject([{ status: "suspended", role: "salesperson" }]);
    expect(ok(await adminClient().rpc("get_share", { p_token: token }))).toBeNull();
    expect(ok(await adminClient().rpc("create_tray_from_share", { p_token: token, p_piece_ids: [piece], p_channel: "in_store", p_visitor: "v" }))).toBeNull();
    expect(ok(await anonClient().rpc("record_share_view", { p_token: token, p_visitor: "v" }))).toBe(false);
    expect(ok(await adminClient().rpc("get_site", { p_slug: slug }))).toBeNull();
    expect((ok(await adminClient().rpc("list_site_pieces", { p_slug: slug })) as { pieces: unknown[] } | null)?.pieces ?? []).toEqual([]);
    expect(ok(await adminClient().rpc("create_tray", { p_slug: slug, p_piece_ids: [piece], p_channel: "in_store", p_visitor: "v" }))).toBeNull();
  });
  it("reactivating brings everything back", async () => {
    ok(await takara.db.rpc("admin_set_shop_status", { p_shop: shop, p_status: "active" }));
    expect(ok(await sales.db.from("pieces").select("id"))).toEqual([{ id: piece }]);
    expect((ok(await adminClient().rpc("get_share", { p_token: token })) as { status: string }).status).toBe("ok");
    expect(ok(await adminClient().rpc("get_site", { p_slug: slug }))).not.toBeNull();
  });
});

describe("Needs attention", () => {
  it("counts customer choices nobody opened for a day, AI failures and pieces without a photo", async () => {
    const db = adminClient();
    const twoDays = new Date(Date.now() - 2 * 86400_000).toISOString();
    ok(await db.from("site_trays").insert({ shop_id: shop, code: "ZZ" + Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[^A-HJKMNP-Z2-9]/g, "Z"), piece_ids: [piece], channel: "whatsapp", created_at: twoDays }));
    ok(await db.from("ai_requests").insert({ shop_id: shop, user_id: owner.id, status: "error" }));
    ok(await db.from("pieces").insert({ shop_id: shop, name: "Photo never arrived", category: "Ring", karat: 22, gross_g: 5, making_per_g: 17, created_by: owner.id, created_at: twoDays }));
    const row = (ok(await takara.db.rpc("admin_shops")) as { id: string; health: Record<string, number> }[]).find((r) => r.id === shop)!;
    expect(row.health).toEqual({ choices_waiting: 1, ai_errors_7d: 1, no_photo: 1 });
    const detail = ok(await takara.db.rpc("admin_shop", { p_shop: shop })) as { status: string; health: Record<string, number> };
    expect(detail.status).toBe("active");
    expect(detail.health.choices_waiting).toBe(1);
  });
  it("shop staff can't see Takara's lists", async () => {
    expect((await owner.db.rpc("admin_shops")).error).not.toBeNull();
    expect((await owner.db.rpc("admin_overview")).error).not.toBeNull();
  });
});
