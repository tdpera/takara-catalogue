import { getT } from "@/i18n/server";
import { PlainSkeleton } from "@/components/Skeletons";

export default async function Loading() {
  const { t } = await getT();
  return <PlainSkeleton label={t("common.loading")} />;
}
