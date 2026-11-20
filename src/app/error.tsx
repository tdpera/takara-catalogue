"use client";
/** Something failed while loading a page (often a dropped connection): say so and offer a retry. */
import Link from "next/link";
import { useEffect } from "react";
import { useT } from "@/i18n/client";
import { btn, btnPrimary } from "@/components/ui";
import { Logo } from "@/components/icons";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useT();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <Logo size={48} draw />
      <h1 className="font-display text-[1.6rem] leading-tight">{t("common.error")}</h1>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className={btnPrimary} onClick={reset}>{t("common.retry")}</button>
        <Link href="/" className={btn}>{t("share.toCatalogue")}</Link>
      </div>
    </main>
  );
}
