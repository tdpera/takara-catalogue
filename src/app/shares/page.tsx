import { redirect } from "next/navigation";

/** Shares became Digital trays: the trays you sent are in the Trays tab. */
export default function SharesPage() {
  redirect("/trays");
}
