import type { ReactNode } from "react";
import { label as toLabel } from "../options";

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted/80">{hint}</p>}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      className="input"
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function NumberInput({
  value,
  onChange,
  step = 1,
  min,
  suffix,
  placeholder,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  suffix?: string;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <input
        className={`input ${suffix ? "pr-12" : ""}`}
        type="number"
        value={Number.isNaN(value) ? "" : value}
        step={step}
        min={min}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted">
          {suffix}
        </span>
      )}
    </div>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  disabledOptions,
  renderLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly T[];
  /** Options shown but not selectable (e.g. brands with no data yet). */
  disabledOptions?: readonly T[];
  /** Friendly option text (e.g. "PRAL · Air", "12 kV"); defaults to a title-cased value. */
  renderLabel?: (v: T) => string;
}) {
  return (
    <select className="input cursor-pointer" value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => {
        const locked = disabledOptions?.includes(o);
        return (
          <option key={o} value={o} disabled={locked}>
            {renderLabel ? renderLabel(o) : toLabel(o)}
            {locked ? " 🔒" : ""}
          </option>
        );
      })}
    </select>
  );
}

/** Segmented control — nicer than a dropdown for 2–4 mutually-exclusive choices.
 *  Options in `disabledOptions` are shown greyed with a 🔒 and aren't selectable. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  renderLabel,
  disabledOptions,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly T[];
  renderLabel?: (v: T) => ReactNode;
  disabledOptions?: readonly T[];
}) {
  return (
    <div className="inline-flex w-full rounded-lg border border-line bg-surface p-1">
      {options.map((o) => {
        const active = o === value;
        const locked = disabledOptions?.includes(o);
        return (
          <button
            key={o}
            type="button"
            disabled={locked}
            title={locked ? "No data yet — locked" : undefined}
            onClick={() => !locked && onChange(o)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition-all duration-150 ${
              locked
                ? "cursor-not-allowed text-muted/40"
                : active
                ? "bg-brand text-white shadow-soft"
                : "text-muted hover:text-brand-dark"
            }`}
          >
            {locked && <span className="mr-1">🔒</span>}
            {renderLabel ? renderLabel(o) : toLabel(o)}
          </button>
        );
      })}
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-line text-brand focus:ring-brand"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

/** A nicer toggle switch. */
export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`group flex w-full items-center justify-between gap-3 focus:outline-none ${
        disabled ? "cursor-not-allowed opacity-50" : ""
      }`}
    >
      <span className="min-w-0 text-sm font-semibold text-ink">{label}</span>
      {/* Track: fixed 44×24, never shrinks. The thumb is absolutely positioned with a static 2px
          inset (left-0.5) and only translates, so its ON position (translateX 20px) keeps it fully
          inside the track (2 + 20 + 20 = 42 ≤ 44) instead of sliding past the right edge. */}
      <span
        className={`relative box-border h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ease-out group-focus-visible:ring-2 group-focus-visible:ring-brand group-focus-visible:ring-offset-2 ${
          checked ? "bg-brand" : "bg-[#D1D5DB] dark:bg-[#4B5563]"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-transform duration-200 ease-out ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}
