// Shared class strings. Logical properties (ps/pe/ms/me/text-start) keep layouts correct in RTL.
const press = "transition duration-150 active:scale-[0.98] motion-reduce:transform-none";
export const btn =
  `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 font-medium text-ink hover:border-muted/60 hover:bg-paper disabled:opacity-50 disabled:active:scale-100 ${press}`;
export const btnPrimary =
  `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gold px-4 font-semibold text-white shadow-sm hover:brightness-110 dark:text-black disabled:opacity-50 disabled:hover:brightness-100 ${press}`;
export const btnLink = "inline-flex min-h-11 items-center gap-1.5 font-medium text-gold underline-offset-4 hover:underline";
export const input =
  "block min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-base text-ink placeholder:text-muted/80 transition-colors focus:border-gold";
export const label = "mb-1 block text-sm font-medium";
export const hint = "mt-1 text-sm text-muted";
export const card = "rounded-2xl border border-line bg-surface p-4 shadow-card";
export const errorText = "text-sm font-medium text-danger";
/** Page titles: the display serif, like the prototype. */
export const pageTitle = "font-display text-[1.75rem] leading-tight";
