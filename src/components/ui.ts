// Shared class strings. Logical properties (ps/pe/ms/me/text-start) keep layouts correct in RTL.
const press = "transition duration-150 active:scale-[0.98] motion-reduce:transform-none";
/** Secondary action: quiet outline. */
export const btn =
  `inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line bg-surface px-5 font-medium text-ink hover:border-ink/25 hover:bg-raised disabled:opacity-50 disabled:active:scale-100 ${press}`;
/** Main action on a screen: ink (gold in dark mode). */
export const btnPrimary =
  `inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 font-semibold text-on-primary shadow-sm hover:opacity-90 disabled:opacity-50 disabled:hover:opacity-50 ${press}`;
/** Gold action, used sparingly (Add piece). */
export const btnGold =
  `inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-gold-gradient px-5 font-semibold text-[#1c1408] shadow-sm hover:brightness-105 disabled:opacity-50 ${press}`;
export const btnLink = "inline-flex min-h-11 items-center gap-1.5 font-medium text-gold underline-offset-4 hover:underline";
export const input =
  "block min-h-12 w-full rounded-2xl border border-line bg-surface px-4 text-base text-ink placeholder:text-muted/80 transition-colors focus:border-ink/40";
export const label = "mb-1.5 block text-sm font-medium";
export const hint = "mt-1.5 text-sm text-muted";
export const card = "rounded-3xl border border-line/70 bg-surface p-5 shadow-card";
export const errorText = "text-sm font-medium text-danger";
/** Page titles: the display serif, like the prototype. */
export const pageTitle = "font-display text-[2rem] leading-tight";
/** Rounded "chip" radio/segment, used for karat, category, status and tabs. */
export const chip =
  "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-line bg-surface px-4 text-[15px] font-medium transition-colors hover:border-ink/25";
export const chipOn = "border-ink bg-ink text-paper hover:border-ink";
