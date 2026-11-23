import { headers } from "next/headers";
import { getT } from "@/i18n/server";
import { GridSkeleton, PlainSkeleton } from "@/components/Skeletons";

export default async function Loading() {
  const { t } = await getT();
  // Shop websites don't have the app's header, so they get plain shapes while loading.
  if ((await headers()).get("x-site-slug")) return <PlainSkeleton label={t("common.loading")} />;
  return <GridSkeleton label={t("common.loading")} />;
}
