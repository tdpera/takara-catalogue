import { getT } from "@/i18n/server";
import { NotFoundPanel } from "@/components/NotFoundPanel";

export default async function PieceNotFound() {
  const { t } = await getT();
  return <NotFoundPanel message={t("piece.notFound")} />;
}
