"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/i18n/client";

const TABS = [
  { href: "/", key: "nav.catalogue" },
  { href: "/shares", key: "nav.shares" },
  { href: "/rates", key: "nav.rates" },
  { href: "/team", key: "nav.team" },
] as const;

export function NavTabs() {
  const { t } = useT();
  const path = usePathname();
  return (
    <nav aria-label={t("app.name")} className="mx-auto max-w-5xl px-2">
      <ul className="flex">
        {TABS.map((tab) => {
          const active =
            tab.href === "/"
              ? path === "/" || path.startsWith("/p/") || path === "/add"
              : tab.href === "/shares"
                ? ["/shares", "/share", "/clients"].some((x) => path === x || path.startsWith(x + "/"))
                : path.startsWith(tab.href);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={
                  "flex min-h-12 items-center justify-center border-b-[3px] px-2 text-center font-medium " +
                  (active ? "border-gold text-ink" : "border-transparent text-muted")
                }
              >
                {t(tab.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
