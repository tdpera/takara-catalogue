/**
 * Small line icons (24×24, stroke = currentColor), replacing emoji that render differently on
 * every phone. Decorative by default (aria-hidden); the button or link text carries the meaning.
 */
type P = { className?: string; size?: number };

function Svg({ className = "", size = 20, children }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      {children}
    </svg>
  );
}

export const IconPlus = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const IconCamera = (p: P) => (
  <Svg {...p}>
    <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
    <circle cx="12" cy="12.5" r="3.5" />
  </Svg>
);
export const IconVideo = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="6" width="13" height="12" rx="2.5" />
    <path d="m16 10.5 5-3v9l-5-3" />
  </Svg>
);
export const IconSparkles = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.5 13.6 8.4 18.5 10l-4.9 1.6L12 16.5l-1.6-4.9L5.5 10l4.9-1.6z" />
    <path d="M18.5 15.5v4M16.5 17.5h4" />
  </Svg>
);
export const IconCheck = (p: P) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);
export const IconX = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);
/** Points back (left in English, right in Arabic). */
export const IconBack = (p: P) => (
  <Svg {...p} className={`rtl:-scale-x-100 ${p.className ?? ""}`}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Svg>
);
export const IconWarning = (p: P) => (
  <Svg {...p}>
    <path d="M12 4 2.8 19.5h18.4z" />
    <path d="M12 10v4.2M12 17.1v.1" />
  </Svg>
);
export const IconTurn = (p: P) => (
  <Svg {...p}>
    <path d="M4 12a8 3.5 0 0 0 16 0 8 3.5 0 0 0-11-3.3" />
    <path d="m8 6.3 1.4 2.4-2.6.9" />
  </Svg>
);
export const IconLink = (p: P) => (
  <Svg {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L11.5 6.8" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5" />
  </Svg>
);
export const IconChat = (p: P) => (
  <Svg {...p}>
    <path d="M4.5 19.5 6 15.6A7.5 7.5 0 1 1 9 18.6z" />
  </Svg>
);
export const IconImage = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m20.5 16-4.5-4.5L7 19.5" />
  </Svg>
);
export const IconShare = (p: P) => (
  <Svg {...p}>
    <path d="M12 15V4M8 8l4-4 4 4" />
    <path d="M6 11.5H5.5A1.5 1.5 0 0 0 4 13v5.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V13a1.5 1.5 0 0 0-1.5-1.5H18" />
  </Svg>
);
export const IconSearch = (p: P) => (
  <Svg {...p}>
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="m15 15 5 5" />
  </Svg>
);

/** The app's mark: a gold ring with a stone, drawn as a gradient so it reads well at small sizes. */
export function Logo({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false" className={`shrink-0 ${className}`}>
      <defs>
        <linearGradient id="souq-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6dc93" />
          <stop offset="0.45" stopColor="#c9962f" />
          <stop offset="1" stopColor="#7a5212" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="28" r="14" fill="none" stroke="url(#souq-gold)" strokeWidth="5.5" />
      <path d="M24 4.5 30 10.5 24 16.5 18 10.5z" fill="url(#souq-gold)" />
      <path d="M24 4.5 30 10.5H18z" fill="#fff6dc" opacity="0.55" />
    </svg>
  );
}
