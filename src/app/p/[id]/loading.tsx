import { getT } from "@/i18n/server";
import { DetailSkeleton } from "@/components/Skeletons";

export default async function Loading() {
  const { t } = await getT();
  return <DetailSkeleton label={t("common.loading")} />;
}
