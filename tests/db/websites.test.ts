/**
 * Shop websites, trays, sold attribution, reports and the Takara dashboard: who may call what.
 * Website functions return making charges (for pricing on the server), so only the service role
 * may call them; reports are for owners and Takara admins; shops never see each other.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, createUser, deleteUsers, ok, type TestUser } from "./helpers";

let owner: TestUser, sales: TestUser, other: TestUser, takara: TestUser;
let shop: string, otherShop: string;
let p1: string, p2: string, hidden: string, otherPiece: string;
const slug = "test-" + Math.random().toString(36).slice(2, 8);

async function addPiece(u: TestUser, s: string, name: string) {
  return (ok(await u.db.from("pieces").insert({ shop_id: s, name, category: "Ring", karat: 22, gross_g: 5, making_per_g: 17, created_by: u.id }).select("id").single()) as { id: string }).id;
}

beforeAll(async () => {
  [owner, sales, other, takara] = await Promise.all(Array.from({ length: 4 }, createUser));
  shop = ok(await owner.db.rpc("create_shop", { p_name: "Web Shop" })) as string;
  otherShop = ok(await other.db.rpc("create_shop", { p_name: "Other Web Shop" })) as string;
  ok(await owner.db.rpc("invite_member", { p_shop: shop, p_phone: sales.phone, p_role: "salesperson" }));
  ok(await sales.db.rpc("accept_invites"));
  ok(await owner.db.from("gold_rates").insert({ shop_id: shop, karat: 22, aed_per_g: 437.5, set_by: owner.id }));
  p1 = await addPiece(sales, shop, "First ring");
  p2 = await addPiece(sales, shop, "Second ring");
  hidden = await addPiece(owner, shop, "Hidden ring");
  otherPiece = await addPiece(other, otherShop, "Not yours");
  ok(await owner.db.from("shop_sites").insert({ shop_id: shop, slug, published: true }));
  ok(await owner.db.rpc("set_on_website", { p_shop: shop, p_pieces: [hidden], p_on: false }));
  ok(await adminClient().from("platform_admins").insert({ user_id: takara.id }));
});

afterAll(async () => {
  await deleteUsers([owner, sales, other, takara]);
});

describe("website settings", () => {
  it("owners and managers set up the website; salespeople can read but not change it", async () => {
    await sales.db.from("shop_sites").update({ published: false }).eq("shop_id", shop);
    const row = ok(await sales.db.from("shop_sites").select("published").eq("shop_id", shop).single()) as { published: boolean };
    expect(row.published).toBe(true);
    const { error: insErr } = await other.db.from("shop_sites").insert({ shop_id: shop, slug: slug + "x" });
    expect(insErr).not.toBeNull();
  });
  it("reserved and malformed addresses are refused", async () => {
    for (const bad of ["admin", "ab", "-abc", "Abc"]) {
      const { error } = await other.db.from("shop_sites").insert({ shop_id: otherShop, slug: bad });
      expect(error, bad).not.toBeNull();
    }
  });
  it("only owners and managers hide pieces from the website, only in their shop", async () => {
    expect((await sales.db.rpc("set_on_website", { p_shop: shop, p_pieces: [p1], p_on: false })).error).not.toBeNull();
    expect(ok(await owner.db.rpc("set_on_website", { p_shop: shop, p_pieces: [otherPiece], p_on: false }))).toBe(0);
  });
});

describe("website functions (server only)", () => {
  it("visitors and signed-in users can't call them: they return making charges", async () => {
    expect((await anonClient().rpc("get_site", { p_slug: slug })).error).not.toBeNull();
    expect((await anonClient().rpc("list_site_pieces", { p_slug: slug })).error).not.toBeNull();
    expect((await owner.db.rpc("list_site_pieces", { p_slug: slug })).error).not.toBeNull();
    expect((await anonClient().rpc("create_tray", { p_slug: slug, p_piece_ids: [p1], p_channel: "in_store", p_visitor: "x" })).error).not.toBeNull();
  });
  it("the server sees only published sites and pieces on show", async () => {
    const list = ok(await adminClient().rpc("list_site_pieces", { p_slug: slug })) as { total: number; pieces: { name: string }[] };
    expect(list.pieces.map((p) => p.name).sort()).toEqual(["First ring", "Second ring"]);
    expect(ok(await adminClient().rpc("site_media_bucket", { p_slug: slug, p_path: "x/y/z.jpg" }))).toBeNull();
    ok(await owner.db.from("shop_sites").update({ published: false }).eq("shop_id", shop));
    expect(ok(await adminClient().rpc("get_site", { p_slug: slug }))).toBeNull();
    ok(await owner.db.from("shop_sites").update({ published: true }).eq("shop_id", shop));
  });
});

describe("trays", () => {
  let code: string;
  it("keeps the customer's order, drops hidden, sold and other shops' pieces", async () => {
    code = ok(await adminClient().rpc("create_tray", { p_slug: slug, p_piece_ids: [p2, hidden, otherPiece, p1, p2], p_channel: "in_store", p_visitor: "v1" })) as string;
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
    const tray = ok(await owner.db.from("site_trays").select("piece_ids, channel").eq("code", code).single()) as { piece_ids: string[]; channel: string };
    expect(tray.piece_ids).toEqual([p2, p1]);
    expect(tray.channel).toBe("in_store");
  });
  it("the same customer sending the same tray again keeps the code", async () => {
    expect(ok(await adminClient().rpc("create_tray", { p_slug: slug, p_piece_ids: [p1, p2], p_channel: "whatsapp", p_visitor: "v1" }))).toBe(code);
  });
  it("staff open it by code (any case, spaces ignored); other shops can't", async () => {
    expect(ok(await sales.db.rpc("open_tray", { p_shop: shop, p_code: ` ${code.slice(0, 3).toLowerCase()} ${code.slice(3)} ` }))).toBeTruthy();
    expect((await other.db.rpc("open_tray", { p_shop: shop, p_code: code })).error).not.toBeNull();
    expect((ok(await other.db.from("site_trays").select("id").eq("shop_id", shop)) as unknown[]).length).toBe(0);
  });
  it("selling from the tray records how it was found and its value; un-selling clears it", async () => {
    const trayId = (ok(await owner.db.from("site_trays").select("id").eq("code", code).single()) as { id: string }).id;
    ok(await sales.db.rpc("set_piece_status", { p_piece: p1, p_status: "sold", p_sold_value: 2500, p_tray: trayId }));
    const sold = ok(await owner.db.from("pieces").select("status, sold_via, sold_value_aed, sold_at").eq("id", p1).single()) as Record<string, unknown>;
    expect(sold).toMatchObject({ status: "sold", sold_via: "tray", sold_value_aed: 2500 });
    expect(sold.sold_at).not.toBeNull();
    ok(await sales.db.rpc("set_piece_status", { p_piece: p1, p_status: "in_stock" }));
    expect(ok(await owner.db.from("pieces").select("sold_via, sold_at").eq("id", p1).single())).toEqual({ sold_via: null, sold_at: null });
    expect((await sales.db.rpc("set_piece_status", { p_piece: p2, p_status: "sold", p_tray: "00000000-0000-4000-8000-000000000000" })).error).not.toBeNull();
  });
});

describe("events, reports and the Takara dashboard", () => {
  it("the app can't log sales or trays itself", async () => {
    const { error } = await owner.db.from("events").insert({ shop_id: shop, user_id: owner.id, name: "piece_sold", props: {} });
    expect(error).not.toBeNull();
  });
  it("owners see their monthly report; salespeople and other shops don't", async () => {
    const r = ok(await owner.db.rpc("shop_report", { p_shop: shop })) as { current: { trays: number }; site: { slug: string } };
    expect(r.current.trays).toBe(1);
    expect(r.site.slug).toBe(slug);
    expect((await sales.db.rpc("shop_report", { p_shop: shop })).error).not.toBeNull();
    expect((await other.db.rpc("shop_report", { p_shop: shop })).error).not.toBeNull();
  });
  it("only Takara admins open the dashboard, and it carries no client details", async () => {
    expect((await owner.db.rpc("admin_shops")).error).not.toBeNull();
    expect(ok(await owner.db.rpc("is_platform_admin"))).toBe(false);
    expect(ok(await takara.db.rpc("is_platform_admin"))).toBe(true);
    const shops = ok(await takara.db.rpc("admin_shops")) as { id: string }[];
    expect(shops.some((s) => s.id === shop)).toBe(true);
    ok(await sales.db.from("clients").insert({ shop_id: shop, salesperson_id: sales.id, name: "Mariam Client", phone: "+971509998877", language: "en" }));
    const detail = JSON.stringify(ok(await takara.db.rpc("admin_shop", { p_shop: shop })));
    expect(detail).not.toContain("Mariam");
    expect(detail).not.toContain("509998877");
    expect((ok(await takara.db.from("platform_admins").select("user_id")) as unknown[]).length).toBe(0); // no direct reads
  });
});
