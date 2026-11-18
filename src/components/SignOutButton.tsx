"use client";
import { useTransition } from "react";
import { useT } from "@/i18n/client";
import { signOut } from "@/app/actions";
import { allPieces } from "@/lib/outbox/db";
import { btn } from "./ui";

/** Warns about unfinished uploads and clears cached pages before signing out. */
export function SignOutButton({ userId }: { userId: string }) {
  const { t } = useT();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={btn + " w-full"}
      disabled={pending}
      onClick={() =>
        start(async () => {
          let waiting = 0;
          try {
            waiting = (await allPieces()).filter((p) => p.userId === userId).length;
          } catch {}
          if (waiting && !window.confirm(t("queue.signOutPending", { count: waiting }))) return;
          try {
            const keys = await caches.keys();
            await Promise.all(keys.filter((k) => k.startsWith("pages-")).map((k) => caches.delete(k)));
          } catch {}
          await signOut();
        })
      }
    >
      {t("nav.signOut")}
    </button>
  );
}
