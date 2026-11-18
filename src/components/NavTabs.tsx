"use client";
/**
 * Navigation. Phones get a bottom tab bar (in thumb reach) with a raised gold Add button in the
 * middle; tablets and desktops get links in the header. Hidden on focused task screens that have
 * their own bottom bar (adding and editing a piece).
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { IconCoins, IconGrid, IconPlus, IconSend, IconUsers } from "./icons";

const TABS = [
  { href: "/", key: "nav.catalogue", Icon: IconGrid },
  { href: "/shares", key: "nav.shares", Icon: IconSend },
  { href: "/rates", key: "nav.rates", Icon: IconCoins },
  { href: "/team", key: "nav.team", Icon: IconUsers },
] as const satisfies readonly { href: string; key: MessageKey; Icon: unknown }[];

function isActive(href: string, path: string) {
  if (href === "/") return path === "/" || path.startsWith("/p/");
  if (href === "/shares") return ["/shares", "/share", "/clients"].some((x) => path === x || path.startsWith(x + "/"));
  return path.startsWith(href);
}

/** Header links for wider screens. */
export function NavTabs() {
  const { t } = useT();
  const path = usePathname();
  return (
    <nav aria-label={t("app.name")} className="hidden md:block">
      <ul className="flex items-center gap-1">
        {TABS.map((tab) => {
          const active = isActive(tab.href, path);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-10 items-center rounded-full px-3.5 text-[15px] font-medium transition-colors ${active ? "bg-ink text-paper" : "text-muted hover:bg-raised hover:text-ink"}`}
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

const HIDE_ON = [/^\/add$/, /^\/p\/[^/]+\/edit$/];

/** Bottom tab bar for phones. */
export function BottomNav() {
  const { t } = useT();
  const path = usePathname();
  if (HIDE_ON.some((re) => re.test(path))) return null;
  const item = (tab: (typeof TABS)[number]) => {
    const active = isActive(tab.href, path);
    return (
      <li key={tab.href} className="flex-1">
        <Link
          href={tab.href}
          aria-current={active ? "page" : undefined}
          className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] leading-tight font-medium ${active ? "text-ink" : "text-muted"}`}
        >
          <tab.Icon size={22} className={active ? "stroke-[2.2] text-gold" : ""} />
          <span className="max-w-full truncate px-0.5">{t(tab.key)}</span>
        </Link>
      </li>
    );
  };
  return (
    <nav
      aria-label={t("app.name")}
      className="bottom-nav fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-end px-1">
        {item(TABS[0])}
        {item(TABS[1])}
        <li className="flex flex-1 justify-center">
          <Link
            href="/add"
            className="-mt-5 mb-1 flex size-14 items-center justify-center rounded-full bg-gold-gradient text-[#1c1408] shadow-lift ring-4 ring-paper transition active:scale-95 motion-reduce:transform-none"
          >
            <IconPlus size={26} className="stroke-[2.4]" />
            <span className="sr-only">{t("home.addPiece")}</span>
          </Link>
        </li>
        {item(TABS[2])}
        {item(TABS[3])}
      </ul>
    </nav>
  );
}
