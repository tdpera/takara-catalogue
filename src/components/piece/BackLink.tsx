"use client";
/** "← Catalogue" on the piece page: the photo flies back into its place in the grid. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { btnLink } from "@/components/ui";
import { IconBack } from "@/components/icons";
import { navigateWithMorph } from "@/lib/view-transition";

export function BackLink({ pieceId, label }: { pieceId: string; label: string }) {
  const router = useRouter();
  return (
    <Link
      href="/"
      className={btnLink + " text-sm"}
      onClick={(e) => navigateWithMorph(e, router, "/", document.querySelector<HTMLElement>("[data-piece-media]"), pieceId)}
    >
      <IconBack size={18} /> {label}
    </Link>
  );
}
