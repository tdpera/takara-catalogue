import Link from "next/link";
import { getT } from "@/i18n/server";
import { btnLink } from "@/components/ui";

export default async function PieceNotFound() {
  const { t } = await getT();
  return (
    <main className="mx-auto max-w-xl space-y-3 px-4 py-12 text-center">
      <p className="text-lg">{t("piece.notFound")}</p>
      <Link href="/" className={btnLink}>{t("piece.back")}</Link>
    </main>
  );
}
