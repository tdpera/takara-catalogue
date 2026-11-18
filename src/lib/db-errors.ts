import type { MessageKey } from "@/i18n";

/** Maps Postgres error codes raised by our RPCs and policies to interface messages. */
export function dbErrorKey(err: { code?: string } | null | undefined): MessageKey {
  switch (err?.code) {
    case "42501":
      return "common.notAllowed";
    case "23505":
      return "team.alreadyMember";
    case "23514":
      return "team.lastOwner";
    case "22023":
      return "login.invalidPhone";
    default:
      return "common.error";
  }
}
