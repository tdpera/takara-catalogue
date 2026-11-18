import Link from "next/link";
import { getT } from "@/i18n/server";
import { btnPrimary } from "./ui";
import { Logo } from "./icons";

/** Shared "not found" page body: the app's mark, a heading and a way back. */
export async function NotFoundPanel({ message }: { message?: string }) {
  const { t } = await getT();
  return (
    <main id="main" className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <Logo size={48} className="opacity-80" />
      <h1 className="font-display text-[2rem] leading-tight">{message ?? t("common.notFound")}</h1>
      <Link href="/" className={btnPrimary}>{t("share.toCatalogue")}</Link>
    </main>
  );
}
