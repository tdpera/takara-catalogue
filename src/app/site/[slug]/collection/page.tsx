import { redirect } from "next/navigation";
import { siteContext } from "@/lib/site-data";

/** The whole collection isn't public any more (DECISIONS §26): only the showcase, on the home page. */
export default async function SiteCollection({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { base } = await siteContext(slug);
  redirect(`${base}/#showcase`);
}
