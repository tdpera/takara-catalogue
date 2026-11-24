/**
 * Step 1 acceptance test: two shops must never see or change each other's data, and
 * the roles inside a shop behave as specified. Runs against the local Supabase stack
 * through the public API, exactly as the app does.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, createUser, deleteUsers, ok, type TestUser, createShop } from "./helpers";

let ownerA: TestUser, managerA: TestUser, salesA1: TestUser, salesA2: TestUser, ownerB: TestUser, salesB: TestUser;
let shopA: string, shopB: string;
let pieceA: string, pieceA2: string, pieceB: string;
let clientA1: string, clientB: string;
let shareA1: string;
const mediaPathA = () => `${shopA}/${pieceA}/photo.jpg`;

const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" });

async function addPiece(u: TestUser, shop: string, name: string, extra: Record<string, unknown> = {}) {
  return ok(
    await u.db
      .from("pieces")
      .insert({ shop_id: shop, name, category: "Bangle", karat: 22, gross_g: 24.5, making_per_g: 18, created_by: u.id, ...extra })
      .select("id, sku")
      .single(),
  ) as { id: string; sku: string };
}

async function joinAs(owner: TestUser, shop: string, user: TestUser, role: "manager" | "salesperson") {
  ok(await owner.db.rpc("invite_member", { p_shop: shop, p_phone: user.phone, p_role: role }));
  expect(ok(await user.db.rpc("accept_invites"))).toBe(1);
}

beforeAll(async () => {
  [ownerA, managerA, salesA1, salesA2, ownerB, salesB] = await Promise.all(Array.from({ length: 6 }, createUser));

  shopA = await createShop(ownerA, "Al Fahidi Jewellers");
  shopB = await createShop(ownerB, "Meena Gold");
  await joinAs(ownerA, shopA, managerA, "manager");
  await joinAs(ownerA, shopA, salesA1, "salesperson");
  await joinAs(ownerA, shopA, salesA2, "salesperson");
  await joinAs(ownerB, shopB, salesB, "salesperson");

  ok(await ownerA.db.from("gold_rates").insert([
    { shop_id: shopA, karat: 24, aed_per_g: 472.5, set_by: ownerA.id },
    { shop_id: shopA, karat: 22, aed_per_g: 437.5, set_by: ownerA.id },
  ]));
  ok(await ownerB.db.from("gold_rates").insert({ shop_id: shopB, karat: 22, aed_per_g: 440, set_by: ownerB.id }));

  pieceA = (await addPiece(salesA1, shopA, "Filigree bangle")).id;
  pieceA2 = (await addPiece(salesA2, shopA, "Rope chain")).id;
  pieceB = (await addPiece(salesB, shopB, "Meena Ring")).id;

  ok(await salesA1.db.storage.from("media").upload(mediaPathA(), jpeg));
  ok(await salesA1.db.from("piece_media").insert({
    piece_id: pieceA, shop_id: shopA, type: "photo", storage_path: mediaPathA(), created_by: salesA1.id,
  }));

  clientA1 = (ok(await salesA1.db.from("clients").insert({ shop_id: shopA, salesperson_id: salesA1.id, name: "Fatima", phone: "+971501112233", language: "ar" }).select("id").single()) as { id: string }).id;
  clientB = (ok(await salesB.db.from("clients").insert({ shop_id: shopB, salesperson_id: salesB.id, name: "Priya" }).select("id").single()) as { id: string }).id;

  shareA1 = (ok(await salesA1.db.from("shares").insert({ shop_id: shopA, salesperson_id: salesA1.id, client_id: clientA1, piece_ids: [pieceA, pieceA2] }).select("id").single()) as { id: string }).id;
  ok(await adminClient().from("share_views").insert({ share_id: shareA1 }));
  ok(await salesA1.db.from("events").insert({ shop_id: shopA, user_id: salesA1.id, name: "piece_added", props: { piece_id: pieceA } }));
}, 60_000);

afterAll(async () => {
  const admin = adminClient();
  if (shopA || shopB) {
    await admin.storage.from("media").remove([mediaPathA()]);
    await admin.from("shops").delete().in("id", [shopA, shopB].filter(Boolean));
  }
  await deleteUsers([ownerA, managerA, salesA1, salesA2, ownerB, salesB].filter(Boolean));
});

describe("shop isolation", () => {
  const shopTables = ["shops", "shop_members", "gold_rates", "current_gold_rates", "pieces", "piece_media", "clients", "shares", "events"] as const;

  it.each(shopTables)("shop B owner reads none of shop A's %s", async (table) => {
    const col = table === "shops" ? "id" : "shop_id";
    const rows = ok(await ownerB.db.from(table).select("*").eq(col, shopA)) as unknown[];
    expect(rows).toEqual([]);
  });

  it("shop B owner reads only shop B rows with no filter at all", async () => {
    for (const table of shopTables) {
      const col = table === "shops" ? "id" : "shop_id";
      const rows = ok(await ownerB.db.from(table).select(col)) as Record<string, string>[];
      expect(rows.every((r) => r[col] === shopB), table).toBe(true);
    }
    expect(ok(await ownerB.db.from("share_views").select("id"))).toEqual([]);
  });

  it("shop B can't see shop A members' profiles or invites", async () => {
    expect(ok(await ownerB.db.from("profiles").select("user_id").in("user_id", [ownerA.id, salesA1.id]))).toEqual([]);
    expect(ok(await ownerB.db.from("shop_invites").select("id").eq("shop_id", shopA))).toEqual([]);
  });

  it("shop B can't read or write shop A's files", async () => {
    const dl = await ownerB.db.storage.from("media").download(mediaPathA());
    expect(dl.data).toBeNull();
    expect(ok(await ownerB.db.storage.from("media").list(`${shopA}/${pieceA}`))).toEqual([]);
    const up = await ownerB.db.storage.from("media").upload(`${shopA}/${pieceA}/intruder.jpg`, jpeg);
    expect(up.error).not.toBeNull();
  });

  it("shop B can't write into shop A", async () => {
    const piece = await ownerB.db.from("pieces").insert({ shop_id: shopA, name: "x", category: "Ring", karat: 22, gross_g: 1, created_by: ownerB.id });
    expect(piece.error).not.toBeNull();

    const rate = await ownerB.db.from("gold_rates").insert({ shop_id: shopA, karat: 24, aed_per_g: 1, set_by: ownerB.id });
    expect(rate.error).not.toBeNull();

    const upd = ok(await ownerB.db.from("pieces").update({ name: "hacked" }).eq("id", pieceA).select("id"));
    expect(upd).toEqual([]);
    const del = ok(await ownerB.db.from("pieces").delete().eq("id", pieceA).select("id"));
    expect(del).toEqual([]);
    const shop = ok(await ownerB.db.from("shops").update({ name: "hacked" }).eq("id", shopA).select("id"));
    expect(shop).toEqual([]);

    expect((await ownerB.db.rpc("invite_member", { p_shop: shopA, p_phone: "+971509998877", p_role: "owner" })).error).not.toBeNull();
    expect((await ownerB.db.rpc("set_piece_status", { p_piece: pieceA, p_status: "sold" })).error).not.toBeNull();
    expect((await ownerB.db.rpc("remove_member", { p_shop: shopA, p_user: salesA1.id })).error).not.toBeNull();

    const media = await ownerB.db.from("piece_media").insert({ piece_id: pieceA, shop_id: shopA, type: "photo", storage_path: `${shopA}/x.jpg`, created_by: ownerB.id });
    expect(media.error).not.toBeNull();

    const ev = await ownerB.db.from("events").insert({ shop_id: shopA, user_id: ownerB.id, name: "piece_added" });
    expect(ev.error).not.toBeNull();

    // Shop A's piece is untouched.
    const still = ok(await ownerA.db.from("pieces").select("name, status").eq("id", pieceA).single()) as { name: string; status: string };
    expect(still).toEqual({ name: "Filigree bangle", status: "in_stock" });
  });

  it("a share can't include another shop's pieces or another salesperson's client", async () => {
    const crossPiece = await salesB.db.from("shares").insert({ shop_id: shopB, salesperson_id: salesB.id, piece_ids: [pieceB, pieceA] });
    expect(crossPiece.error).not.toBeNull();
    const crossClient = await salesA2.db.from("shares").insert({ shop_id: shopA, salesperson_id: salesA2.id, client_id: clientA1, piece_ids: [pieceA] });
    expect(crossClient.error).not.toBeNull();
    const crossShopClient = await salesB.db.from("shares").insert({ shop_id: shopB, salesperson_id: salesB.id, client_id: clientA1, piece_ids: [pieceB] });
    expect(crossShopClient.error).not.toBeNull();
  });

  it("anonymous visitors read nothing", async () => {
    const anon = anonClient();
    for (const table of [...shopTables, "profiles", "shop_invites", "share_views"]) {
      const res = await anon.from(table).select("*").limit(1);
      expect(res.data ?? [], table).toEqual([]);
    }
    expect((await anon.rpc("create_shop", { p_name: "x" })).error).not.toBeNull();
    expect((await anon.storage.from("media").download(mediaPathA())).data).toBeNull();
  });

  it("an accepted invite can't be reused by another number", async () => {
    expect(ok(await ownerB.db.rpc("accept_invites"))).toBe(0);
    const members = ok(await ownerA.db.from("shop_members").select("user_id").eq("shop_id", shopA)) as { user_id: string }[];
    expect(members.map((m) => m.user_id)).not.toContain(ownerB.id);
  });
});

describe("privacy inside a shop", () => {
  it("clients and shares are visible only to their salesperson, not teammates or the owner", async () => {
    for (const u of [salesA2, managerA, ownerA]) {
      expect(ok(await u.db.from("clients").select("id").eq("id", clientA1))).toEqual([]);
      expect(ok(await u.db.from("shares").select("id").eq("id", shareA1))).toEqual([]);
      expect(ok(await u.db.from("share_views").select("id").eq("share_id", shareA1))).toEqual([]);
    }
    expect(ok(await salesA1.db.from("clients").select("id").eq("id", clientA1))).toHaveLength(1);
    expect(ok(await salesA1.db.from("share_views").select("id").eq("share_id", shareA1))).toHaveLength(1);
    expect(clientB).toBeTruthy();
  });

  it("teammates can't edit or delete someone else's client", async () => {
    expect(ok(await salesA2.db.from("clients").update({ name: "x" }).eq("id", clientA1).select("id"))).toEqual([]);
    expect(ok(await ownerA.db.from("clients").delete().eq("id", clientA1).select("id"))).toEqual([]);
  });

  it("everyone in the shop sees every piece", async () => {
    for (const u of [ownerA, managerA, salesA1, salesA2]) {
      const rows = ok(await u.db.from("pieces").select("id").eq("shop_id", shopA)) as unknown[];
      expect(rows).toHaveLength(2);
    }
  });
});

describe("roles", () => {
  it("salespeople can't set rates or shop settings; managers and owners can", async () => {
    expect((await salesA1.db.from("gold_rates").insert({ shop_id: shopA, karat: 21, aed_per_g: 419.5, set_by: salesA1.id })).error).not.toBeNull();
    expect(ok(await salesA1.db.from("shops").update({ vat_enabled: false }).eq("id", shopA).select("id"))).toEqual([]);
    ok(await managerA.db.from("gold_rates").insert({ shop_id: shopA, karat: 21, aed_per_g: 419.5, set_by: managerA.id }));
    expect(ok(await managerA.db.from("shops").update({ default_making_per_g: 20 }).eq("id", shopA).select("id"))).toHaveLength(1);
  });

  it("rates can't be back-dated, edited or deleted, and the newest one is current", async () => {
    // set_by must be the caller.
    expect((await managerA.db.from("gold_rates").insert({ shop_id: shopA, karat: 18, aed_per_g: 300, set_by: ownerA.id })).error).not.toBeNull();
    expect((await ownerA.db.from("gold_rates").update({ aed_per_g: 1 }).eq("shop_id", shopA)).error).not.toBeNull();
    expect((await ownerA.db.from("gold_rates").delete().eq("shop_id", shopA)).error).not.toBeNull();

    ok(await ownerA.db.from("gold_rates").insert({ shop_id: shopA, karat: 22, aed_per_g: 438.25, set_by: ownerA.id }));
    const cur = ok(await salesA2.db.from("current_gold_rates").select("karat, aed_per_g").eq("shop_id", shopA).order("karat", { ascending: false })) as { karat: number; aed_per_g: number }[];
    expect(cur).toEqual([{ karat: 24, aed_per_g: 472.5 }, { karat: 22, aed_per_g: 438.25 }, { karat: 21, aed_per_g: 419.5 }]);
  });

  it("salespeople edit their own pieces but only change status on others'", async () => {
    expect(ok(await salesA1.db.from("pieces").update({ name: "Filigree bangle, pair" }).eq("id", pieceA).select("id"))).toHaveLength(1);
    expect(ok(await salesA1.db.from("pieces").update({ name: "x" }).eq("id", pieceA2).select("id"))).toEqual([]);
    ok(await salesA1.db.rpc("set_piece_status", { p_piece: pieceA2, p_status: "reserved" }));
    const p = ok(await salesA2.db.from("pieces").select("status").eq("id", pieceA2).single()) as { status: string };
    expect(p.status).toBe("reserved");
    // managers can edit anyone's piece
    expect(ok(await managerA.db.from("pieces").update({ extras_aed: 50 }).eq("id", pieceA2).select("id"))).toHaveLength(1);
  });

  it("only owners and managers delete pieces", async () => {
    const tmp = await addPiece(salesA1, shopA, "Temp ring");
    expect(ok(await salesA1.db.from("pieces").delete().eq("id", tmp.id).select("id"))).toEqual([]);
    expect(ok(await managerA.db.from("pieces").delete().eq("id", tmp.id).select("id"))).toHaveLength(1);
  });

  it("SKU, shop and creator can't be changed", async () => {
    expect((await ownerA.db.from("pieces").update({ sku: "X-1" }).eq("id", pieceA)).error).not.toBeNull();
    expect((await ownerA.db.from("pieces").update({ shop_id: shopB }).eq("id", pieceA)).error).not.toBeNull();
  });

  it("managers invite salespeople but not managers or owners", async () => {
    expect((await managerA.db.rpc("invite_member", { p_shop: shopA, p_phone: "+971507776655", p_role: "manager" })).error).not.toBeNull();
    ok(await managerA.db.rpc("invite_member", { p_shop: shopA, p_phone: "+971507776655", p_role: "salesperson" }));
    expect((await salesA1.db.rpc("invite_member", { p_shop: shopA, p_phone: "+971507776644", p_role: "salesperson" })).error).not.toBeNull();
    // salespeople can't see the invite list
    expect(ok(await salesA1.db.from("shop_invites").select("id").eq("shop_id", shopA))).toEqual([]);
    expect(ok(await managerA.db.from("shop_invites").select("id").eq("shop_id", shopA))).not.toEqual([]);
  });

  it("only owners change roles, and a shop always keeps an owner", async () => {
    expect((await managerA.db.rpc("set_member_role", { p_shop: shopA, p_user: salesA2.id, p_role: "manager" })).error).not.toBeNull();
    expect((await ownerA.db.rpc("set_member_role", { p_shop: shopA, p_user: ownerA.id, p_role: "manager" })).error).not.toBeNull();
    expect((await ownerA.db.rpc("remove_member", { p_shop: shopA, p_user: ownerA.id })).error).not.toBeNull();
    expect((await managerA.db.rpc("remove_member", { p_shop: shopA, p_user: ownerA.id })).error).not.toBeNull();
  });

  it("only owners and managers see analytics", async () => {
    expect(ok(await salesA1.db.from("events").select("id").eq("shop_id", shopA))).toEqual([]);
    expect(ok(await managerA.db.from("events").select("id").eq("shop_id", shopA))).toHaveLength(1);
    expect((await salesA1.db.from("events").insert({ shop_id: shopA, user_id: salesA1.id, name: "share_viewed" })).error).not.toBeNull();
  });
});

describe("data rules", () => {
  it("SKUs are sequential per shop", async () => {
    const a = ok(await ownerA.db.from("pieces").select("sku").eq("shop_id", shopA).order("created_at")) as { sku: string }[];
    expect(a[0].sku).toBe("ALF-0001");
    expect(a[1].sku).toBe("ALF-0002");
    const b = ok(await ownerB.db.from("pieces").select("sku").eq("shop_id", shopB)) as { sku: string }[];
    expect(b[0].sku).toBe("MEE-0001");
  });

  it("rejects stone weight equal to or above gross weight", async () => {
    const res = await salesA1.db.from("pieces").insert({ shop_id: shopA, name: "Bad", category: "Ring", karat: 18, gross_g: 5, stone_g: 5, created_by: salesA1.id });
    expect(res.error?.message).toMatch(/pieces_stone_lt_gross/);
  });

  it("new shops default to VAT on and AED", async () => {
    const s = ok(await ownerB.db.from("shops").select("vat_enabled, currency").eq("id", shopB).single());
    expect(s).toEqual({ vat_enabled: true, currency: "AED" });
  });

  it("share links get a long random token and a 7-day expiry", async () => {
    const s = ok(await salesA1.db.from("shares").select("public_token, created_at, expires_at").eq("id", shareA1).single()) as { public_token: string; created_at: string; expires_at: string };
    expect(s.public_token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const days = (Date.parse(s.expires_at) - Date.parse(s.created_at)) / 86_400_000;
    expect(days).toBeCloseTo(7, 3);
  });
});
