import { getT } from "@/i18n/server";
import { GridSkeleton } from "@/components/Skeletons";

export default async function Loading() {
  const { t } = await getT();
  return <GridSkeleton label={t("common.loading")} />;
}
