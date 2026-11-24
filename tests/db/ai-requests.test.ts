/**
 * Step 4: the AI request log. Claims enforce membership and rate limits; only the claimer can
 * finish a request; nobody can write the table directly; and descriptions from an AI reply
 * reach the piece whichever is saved first, the piece or the reply.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, createUser, deleteUsers, ok, type TestUser, createShop } from "./helpers";

let ownerA: TestUser, salesA: TestUser, ownerB: TestUser;
let shopA: string, shopB: string;

const descriptions = { en: "A polished rope bangle for festive wear.", ar: "سوار لامع للمناسبات." };

async function claim(u: TestUser, shop: string, piece: string | null = randomUUID()) {
  return u.db.rpc("claim_ai_request", { p_shop: shop, p_piece: piece });
}
async function finish(u: TestUser, id: string, status = "ok", result: object | null = { descriptions }) {
  return u.db.rpc("finish_ai_request", {
    p_id: id, p_status: status, p_model: "claude-opus-5-5", p_input_tokens: 1800, p_output_tokens: 400, p_duration_ms: 4200, p_result: result,
  });
}
async function insertPiece(u: TestUser, shop: string, id: string, extra: Record<string, unknown> = {}) {
  return ok(
    await u.db.from("pieces")
      .insert({ id, shop_id: shop, name: "Rope bangle", category: "Bangle", karat: 22, gross_g: 20, created_by: u.id, ...extra })
      .select("descriptions").single(),
  ) as { descriptions: Record<string, string> };
}

beforeAll(async () => {
  [ownerA, salesA, ownerB] = await Promise.all(Array.from({ length: 3 }, createUser));
  shopA = await createShop(ownerA, "AI Shop A");
  shopB = await createShop(ownerB, "AI Shop B");
  ok(await ownerA.db.rpc("invite_member", { p_shop: shopA, p_phone: salesA.phone, p_role: "salesperson" }));
  ok(await salesA.db.rpc("accept_invites"));
});

afterAll(async () => {
  await deleteUsers([ownerA, salesA, ownerB]);
});

describe("claiming", () => {
  it("lets a member claim for their own shop only", async () => {
    expect(typeof ok(await claim(salesA, shopA))).toBe("string");
    const other = await claim(salesA, shopB);
    expect(other.error?.code).toBe("42501");
  });

  it("refuses a piece id that belongs to another shop", async () => {
    const pieceB = randomUUID();
    await insertPiece(ownerB, shopB, pieceB);
    const r = await claim(ownerA, shopA, pieceB);
    expect(r.error?.code).toBe("42501");
  });

  it("limits each person to 12 requests a minute, with a retry hint", async () => {
    const u = await createUser();
    const shop = await createShop(u, "Busy shop");
    for (let i = 0; i < 12; i++) ok(await claim(u, shop));
    const r = await claim(u, shop);
    expect(r.error?.message).toBe("ai_rate_user");
    expect(Number(r.error?.hint)).toBeGreaterThan(0);
    expect(Number(r.error?.hint)).toBeLessThanOrEqual(60);
    await deleteUsers([u]);
  });

  it("limits each shop to 1500 requests a Dubai day", async () => {
    const u = await createUser();
    const shop = await createShop(u, "Quota shop");
    const old = new Date(Date.now() - 5 * 60_000).toISOString(); // outside the per-minute window
    const rows = Array.from({ length: 1500 }, () => ({ shop_id: shop, user_id: u.id, created_at: old }));
    ok(await adminClient().from("ai_requests").insert(rows));
    const r = await claim(u, shop);
    expect(r.error?.message).toBe("ai_rate_shop");
    await deleteUsers([u]);
  });
});

describe("the log itself", () => {
  it("can't be written directly", async () => {
    const ins = await salesA.db.from("ai_requests").insert({ shop_id: shopA, user_id: salesA.id });
    expect(ins.error?.code).toBe("42501");
    const id = ok(await claim(salesA, shopA)) as string;
    const upd = await salesA.db.from("ai_requests").update({ status: "ok" }).eq("id", id).select();
    expect(upd.error?.code ?? (upd.data?.length === 0 ? "none" : "updated")).not.toBe("updated");
  });

  it("is readable by the shop's members and nobody else", async () => {
    const id = ok(await claim(salesA, shopA)) as string;
    const mine = ok(await ownerA.db.from("ai_requests").select("id").eq("id", id));
    expect(mine).toHaveLength(1);
    const theirs = ok(await ownerB.db.from("ai_requests").select("id").eq("id", id));
    expect(theirs).toHaveLength(0);
  });

  it("can only be finished once, by the person who claimed it", async () => {
    const id = ok(await claim(salesA, shopA)) as string;
    expect((await finish(ownerA, id)).error?.code).toBe("42501");
    ok(await finish(salesA, id));
    expect((await finish(salesA, id)).error?.code).toBe("42501");
    const row = ok(await ownerA.db.from("ai_requests").select("status, model, output_tokens").eq("id", id).single());
    expect(row).toEqual({ status: "ok", model: "claude-opus-5-5", output_tokens: 400 });
  });

  it("stores no result for failed requests", async () => {
    const id = ok(await claim(salesA, shopA)) as string;
    ok(await finish(salesA, id, "refused", { descriptions }));
    const row = ok(await salesA.db.from("ai_requests").select("status, result").eq("id", id).single());
    expect(row).toEqual({ status: "refused", result: null });
  });
});

describe("descriptions reach the piece in either order", () => {
  it("reply first, then the piece is saved without descriptions", async () => {
    const piece = randomUUID();
    ok(await finish(salesA, ok(await claim(salesA, shopA, piece)) as string));
    expect((await insertPiece(salesA, shopA, piece)).descriptions).toEqual(descriptions);
  });

  it("piece first, then the reply arrives", async () => {
    const piece = randomUUID();
    const id = ok(await claim(salesA, shopA, piece)) as string;
    await insertPiece(salesA, shopA, piece);
    ok(await finish(salesA, id));
    const row = ok(await salesA.db.from("pieces").select("descriptions").eq("id", piece).single());
    expect(row!.descriptions).toEqual(descriptions);
  });

  it("never overwrites descriptions the salesperson saved", async () => {
    const piece = randomUUID();
    const typed = { en: "Typed by the salesperson." };
    const id = ok(await claim(salesA, shopA, piece)) as string;
    await insertPiece(salesA, shopA, piece, { descriptions: typed });
    ok(await finish(salesA, id));
    const row = ok(await salesA.db.from("pieces").select("descriptions").eq("id", piece).single());
    expect(row!.descriptions).toEqual(typed);

    const piece2 = randomUUID();
    ok(await finish(salesA, ok(await claim(salesA, shopA, piece2)) as string));
    expect((await insertPiece(salesA, shopA, piece2, { descriptions: typed })).descriptions).toEqual(typed);
  });

  it("doesn't let one salesperson's AI reply write to a colleague's piece", async () => {
    const piece = randomUUID();
    await insertPiece(ownerA, shopA, piece); // owner's piece, no descriptions
    // salesA can't claim for it in a way that changes it: claim works (same shop), finish doesn't touch it.
    const id = ok(await claim(salesA, shopA, piece)) as string;
    ok(await finish(salesA, id));
    const row = ok(await ownerA.db.from("pieces").select("descriptions").eq("id", piece).single());
    expect(row!.descriptions).toEqual({});
  });
});
