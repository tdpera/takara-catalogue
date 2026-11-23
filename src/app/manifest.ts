import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { slugFromHost } from "@/lib/site-host";
import { getSite } from "@/lib/site-data";

export const dynamic = "force-dynamic";

const ICONS: MetadataRoute.Manifest["icons"] = [
  { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
  { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
];

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  // On a shop's own address, "Add to home screen" adds the shop's website, not the Takara app.
  const slug = slugFromHost((await headers()).get("host"), process.env.NEXT_PUBLIC_SITE_DOMAIN);
  const site = slug ? await getSite(slug).catch(() => null) : null;
  if (site) {
    return {
      name: site.name,
      short_name: site.name.slice(0, 24),
      start_url: "/",
      scope: "/",
      display: "browser",
      background_color: "#fbf9f5",
      theme_color: "#fbf9f5",
      icons: site.logo ? [{ src: site.logo, sizes: "512x512" }] : ICONS,
    };
  }
  return {
    name: "Takara",
    short_name: "Takara",
    description: "Fast catalogues for gold and jewellery sellers.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0e0b08",
    theme_color: "#fbf9f5",
    icons: ICONS,
    shortcuts: [{ name: "Add piece", url: "/add", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] }],
  };
}
