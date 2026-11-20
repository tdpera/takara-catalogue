// Shared class strings, Maison style: near-square corners, hairline borders, small tracked capitals
// on buttons. Logical properties (ps/pe/ms/me/text-start) keep layouts correct in RTL.
const press = "transition duration-200 active:scale-[0.98] motion-reduce:transform-none";
/** Secondary action: hairline outline. */
export const btn =
  `caps inline-flex min-h-11 items-center justify-center gap-2 rounded-[2px] border border-ink/25 bg-transparent px-5 text-[12.5px] font-semibold text-ink hover:border-ink hover:bg-surface disabled:opacity-50 disabled:active:scale-100 ${press}`;
/** Main action on a screen: solid ink. */
export const btnPrimary =
  `caps inline-flex min-h-11 items-center justify-center gap-2 rounded-[2px] bg-primary px-5 text-[12.5px] font-semibold text-on-primary hover:opacity-90 disabled:opacity-50 disabled:hover:opacity-50 ${press}`;
/** Gold-edged action, used sparingly (Add piece on wide screens, empty catalogue). */
export const btnGold =
  `caps inline-flex min-h-11 items-center justify-center gap-2 rounded-[2px] bg-primary px-5 text-[12.5px] font-semibold text-on-primary shadow-[inset_0_-2px_0_var(--gold-line)] hover:opacity-90 disabled:opacity-50 ${press}`;
/** Text link with an underline that draws in on hover. */
export const btnLink =
  "inline-flex min-h-11 items-center gap-1.5 font-semibold text-gold underline decoration-transparent decoration-1 underline-offset-[6px] transition-[text-decoration-color] duration-300 hover:decoration-current";
export const input =
  "block min-h-12 w-full rounded-[2px] border border-line bg-surface px-4 text-base text-ink placeholder:text-muted/80 transition-colors duration-200 hover:border-ink/30 focus:border-ink";
export const label = "mb-1.5 block text-sm font-semibold";
export const hint = "mt-1.5 text-sm text-muted";
export const card = "rounded-[2px] border border-line bg-surface p-5";
export const errorText = "text-sm font-medium text-danger";
/** Page titles: Bodoni Moda. */
export const pageTitle = "font-display text-[2rem] leading-tight";
/** Selectable option (karat, category, status, tabs): a square hairline box, solid ink when chosen. */
export const chip =
  "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-[2px] border border-line bg-surface px-4 text-[15px] font-medium transition-colors duration-200 hover:border-ink/40";
export const chipOn = "border-ink bg-ink text-paper hover:border-ink";
