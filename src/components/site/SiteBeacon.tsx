"use client";
import { useEffect } from "react";

/** Counts a website visit (or piece view) once the page is actually shown in a browser. */
export function SiteBeacon({ slug, sku }: { slug: string; sku?: string }) {
  useEffect(() => {
    let sent = false;
    const send = () => {
      if (sent || document.visibilityState !== "visible") return;
      sent = true;
      void fetch("/api/public/site/view", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, sku }),
        keepalive: true,
      }).catch(() => {});
    };
    send();
    document.addEventListener("visibilitychange", send);
    return () => document.removeEventListener("visibilitychange", send);
  }, [slug, sku]);
  return null;
}
