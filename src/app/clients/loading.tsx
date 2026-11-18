import { getT } from "@/i18n/server";
import { PageSkeleton } from "@/components/Skeletons";

export default async function Loading() {
  const { t } = await getT();
  return <PageSkeleton label={t("common.loading")} />;
}
