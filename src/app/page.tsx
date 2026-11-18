import Link from "next/link";
import { requireShop } from "@/lib/session";
import { getShopPricing } from "@/lib/shop-data";
import { priceOf } from "@/lib/pricing";
import { formatAED, formatGrams } from "@/lib/format";
import { getT } from "@/i18n/server";
import type { MessageKey } from "@/i18n";
import { AppHeader } from "@/components/AppHeader";
import { btnPrimary, card } from "@/components/ui";

type Row = {
  id: string;
  sku: string;
  name: string;
  category: string;
  karat: number;
  gross_g: number;
  stone_g: number;
  making_per_g: number;
  making_flat: number | null;
  extras_aed: number;
  status: "in_stock" | "reserved" | "sold";
  piece_media: { type: string; thumb_path: string | null }[];
};

// Interim list so captured pieces can be checked. Step 5 replaces it with the full catalogue grid.
export default async function HomePage() {
  const { supabase, memberships, current } = await requireShop();
  const { t } = await getT();
  const { rates, vatEnabled } = await getShopPricing(current.shop_id);
  const { data, count } = await supabase
    .from("pieces")
    .select("id, sku, name, category, karat, gross_g, stone_g, making_per_g, making_flat, extras_aed, status, piece_media(type, thumb_path)", { count: "exact" })
    .eq("shop_id", current.shop_id)
    .order("created_at", { ascending: false })
    .limit(30)
    .returns<Row[]>();
  const pieces = data ?? [];

  const thumbs = pieces.map((p) => p.piece_media.find((m) => m.type === "photo")?.thumb_path ?? null);
  const paths = thumbs.filter((x): x is string => !!x);
  const signed = paths.length ? (await supabase.storage.from("media").createSignedUrls(paths, 3600)).data ?? [] : [];
  const urlOf = new Map(signed.map((s) => [s.path, s.signedUrl]));

  return (
    <>
      <AppHeader memberships={memberships} current={current} />
      <main className="mx-auto max-w-5xl space-y-4 px-4 py-4">
        <Link href="/add" className={btnPrimary + " min-h-14 w-full text-lg"}>
          <span aria-hidden="true">＋</span> {t("home.addPiece")}
        </Link>
        <section className={card} aria-labelledby="latest-h">
          <div className="flex items-baseline justify-between gap-3">
            <h1 id="latest-h" className="text-xl font-semibold">{t("home.latest")}</h1>
            <p className="num text-sm text-muted">{t("home.pieces", { count: count ?? 0 })}</p>
          </div>
          {pieces.length === 0 ? (
            <p className="mt-3 text-muted">{t("home.empty")}</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {pieces.map((p, i) => {
                const pr = priceOf(p, rates, vatEnabled);
                const url = thumbs[i] ? urlOf.get(thumbs[i]!) : null;
                return (
                  <li key={p.id} className="flex items-center gap-3 py-3">
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt="" width={64} height={64} loading="lazy" className="size-16 shrink-0 rounded-xl border border-line object-cover" />
                    ) : (
                      <div className="flex size-16 shrink-0 items-center justify-center rounded-xl border border-dashed border-line p-1 text-center text-xs text-muted">
                        {t("home.photoPending")}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{p.name}</p>
                      <p className="text-sm text-muted">
                        <span dir="ltr" className="num">{p.sku}</span> · {t(`categories.${p.category}` as MessageKey)} ·{" "}
                        <span dir="ltr" className="num">{p.karat}K {formatGrams(p.gross_g)}</span>
                        {p.status !== "in_stock" && <> · {t(`status.${p.status}`)}</>}
                      </p>
                    </div>
                    <p dir="ltr" className="num shrink-0 font-semibold">{pr.ok ? formatAED(pr.price.totalWhole) : "—"}</p>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-sm text-muted">{t("home.comingSoon")}</p>
        </section>
      </main>
    </>
  );
}
