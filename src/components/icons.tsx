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

export const IconGrid = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="4" width="7" height="7" rx="2" />
    <rect x="13" y="4" width="7" height="7" rx="2" />
    <rect x="4" y="13" width="7" height="7" rx="2" />
    <rect x="13" y="13" width="7" height="7" rx="2" />
  </Svg>
);
export const IconSend = (p: P) => (
  <Svg {...p} className={`rtl:-scale-x-100 ${p.className ?? ""}`}>
    <path d="M20.5 3.5 10 14" />
    <path d="m20.5 3.5-6.5 17-4-6.5-6.5-4z" />
  </Svg>
);
export const IconCoins = (p: P) => (
  <Svg {...p}>
    <ellipse cx="9" cy="7" rx="5" ry="2.5" />
    <path d="M4 7v4c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V7" />
    <path d="M10 15.4c.6.4 2.1 1.1 4 1.1 2.8 0 5-1.1 5-2.5V10c0-1.4-2.2-2.5-5-2.5" />
    <path d="M10 19.4c.6.4 2.1 1.1 4 1.1 2.8 0 5-1.1 5-2.5v-4" />
  </Svg>
);
export const IconUsers = (p: P) => (
  <Svg {...p}>
    <circle cx="9" cy="8.5" r="3.5" />
    <path d="M3 19.5c.6-3.2 3-5 6-5s5.4 1.8 6 5" />
    <path d="M15.5 5.2a3.5 3.5 0 0 1 0 6.6M17.5 14.8c2 .6 3.2 2.2 3.5 4.7" />
  </Svg>
);
export const IconGlobe = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.2-3.6-8.5S9.6 5.9 12 3.5z" />
  </Svg>
);
/** A jeweller's tray: the customer's chosen pieces. */
export const IconTray = (p: P) => (
  <Svg {...p}>
    <path d="M3 14h18l-1.5 5h-15z" />
    <path d="M6 14V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6" />
    <path d="M9 10h6" />
  </Svg>
);
export const IconStore = (p: P) => (
  <Svg {...p}>
    <path d="M4 9.5 5.5 4h13L20 9.5" />
    <path d="M4 9.5c0 1.4 1.1 2.5 2.7 2.5S9.3 10.9 9.3 9.5c0 1.4 1.2 2.5 2.7 2.5s2.7-1.1 2.7-2.5c0 1.4 1.1 2.5 2.6 2.5S20 10.9 20 9.5" />
    <path d="M5.5 12v8h13v-8M10 20v-4.5h4V20" />
  </Svg>
);
export const IconChart = (p: P) => (
  <Svg {...p}>
    <path d="M4 20V4M4 20h16" />
    <path d="M8 16v-4M12 16V8M16 16v-6" />
  </Svg>
);
export const IconChevron = (p: P) => (
  <Svg {...p} className={`rtl:-scale-x-100 ${p.className ?? ""}`}>
    <path d="m9 6 6 6-6 6" />
  </Svg>
);

/**
 * The Takara mark, Maison style: a fine gold ring with the stone in outline. `draw` makes it draw
 * itself once (empty states, sign-in); see .mark-draw in globals.css.
 */
export function Logo({ size = 32, className = "", draw = false }: { size?: number; className?: string; draw?: boolean }) {
  // Hairlines get relatively heavier as the mark gets smaller, so it stays crisp at 16–28 px.
  const sw = size <= 20 ? 2.6 : size <= 32 ? 2 : 1.5;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
      overflow="visible"
      className={`shrink-0 text-gold-line ${draw ? "mark-draw" : ""} ${className}`}
    >
      <circle className="ring" cx="24" cy="28" r="14" fill="none" stroke="currentColor" strokeWidth={sw} pathLength={100} transform="rotate(-90 24 28)" />
      <path className="gem" d="M24 4.5 30 10.5 24 16.5 18 10.5z" fill="none" stroke="currentColor" strokeWidth={sw * 0.9} strokeLinejoin="round" pathLength={40} />
    </svg>
  );
}
