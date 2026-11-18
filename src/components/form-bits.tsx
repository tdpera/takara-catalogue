"use client";
/** Small form pieces shared by the capture and edit screens. */
import { useT } from "@/i18n/client";
import { label } from "@/components/ui";

export function AiBadge({ show }: { show: boolean }) {
  const { t } = useT();
  if (!show) return null;
  return <span className="ms-2 inline-block rounded-full border border-warn bg-warn-soft px-2 py-0.5 align-middle text-xs font-semibold text-warn">{t("ai.badge")}</span>;
}

/** Big tappable radio chips (karat, category). */
export function Chips<T extends string | number>({
  legend,
  options,
  value,
  onChange,
  render,
  name,
  invalid,
  ai,
}: {
  legend: string;
  options: readonly T[];
  value: T | null;
  onChange: (v: T) => void;
  render: (v: T) => string;
  name: string;
  invalid?: boolean;
  ai?: boolean;
}) {
  return (
    <fieldset aria-invalid={invalid || undefined}>
      <legend className={label}>{legend}<AiBadge show={!!ai} /></legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={String(o)} className="relative">
            <input type="radio" name={name} className="peer sr-only" checked={value === o} onChange={() => onChange(o)} />
            <span className={`inline-flex min-h-11 min-w-14 cursor-pointer items-center justify-center rounded-xl border border-line bg-surface px-3 font-medium peer-checked:font-semibold ${ai ? "peer-checked:border-2 peer-checked:border-warn peer-checked:bg-warn-soft" : "peer-checked:border-gold peer-checked:bg-gold-soft"} peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus)]`}>
              {render(o)}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
