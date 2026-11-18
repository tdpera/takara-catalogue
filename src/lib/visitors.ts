/**
 * Telling real client visits apart from robots. When a salesperson sends a link, WhatsApp (and
 * other apps) fetch it straight away to build a preview; that must not show as "opened".
 * Views are recorded by a small script after the page loads in a real browser, and this check
 * is a second filter on the user agent.
 */
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|facebot|whatsapp|telegram|slack|discord|skype|linkedin|embedly|quora|pinterest|vkshare|w3c_validator|headless|lighthouse|python-requests|curl|wget|okhttp|go-http-client|axios|node-fetch/i;

export function isBot(userAgent: string | null | undefined): boolean {
  if (!userAgent || userAgent.length < 20) return true;
  return BOT.test(userAgent);
}

/**
 * An anonymous visitor id: a hash of the network address, browser and link, salted with the
 * Dubai date. It lets repeat visits within the day be counted once, without storing the address.
 */
export async function visitorHash(ip: string, userAgent: string, token: string, now = new Date()): Promise<string> {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(now);
  const data = new TextEncoder().encode(`${ip}|${userAgent}|${token}|${day}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest).slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}
