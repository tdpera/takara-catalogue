"use client";
/** Last resort when the root layout itself fails. Plain, with no app styles or translations. */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 1rem", textAlign: "center", background: "#f2f3f5", color: "#15171c" }}>
        <main>
          <h1 style={{ fontSize: "1.5rem" }}>Something went wrong.</h1>
          <p>Check your connection and try again.</p>
          <button type="button" onClick={reset} style={{ marginTop: "1rem", minHeight: 44, padding: "0 1rem", borderRadius: 12, border: 0, background: "#8f6312", color: "#fff", fontWeight: 600 }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
