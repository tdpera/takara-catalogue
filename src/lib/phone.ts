import { parsePhoneNumberFromString } from "libphonenumber-js/min";

/** Parses what a user typed (e.g. "050 123 4567" or "+91 98470 12345") into E.164. UAE is the default country. */
export function toE164(input: string): string | null {
  const p = parsePhoneNumberFromString(input.trim(), "AE");
  return p && p.isValid() ? p.number : null;
}

/** Human-friendly international format, e.g. "+971 50 123 4567". */
export function formatPhone(e164: string): string {
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
}
