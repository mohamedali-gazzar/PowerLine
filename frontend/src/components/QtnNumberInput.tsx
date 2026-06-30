// A QTN-number field: a fixed "QTN-" label, a YEAR dropdown (default = current
// year, e.g. 26), and a suffix you type. The value/onChange are the FULL number,
// e.g. "QTN-26-0001".

const CURRENT_YY = new Date().getFullYear() % 100;
// A small range around the current year (e.g. 24…30) for the dropdown.
const YEARS = Array.from({ length: 7 }, (_, i) => CURRENT_YY - 2 + i).map((y) =>
  String((y + 100) % 100).padStart(2, "0")
);

/** Default full number with the current year and an empty suffix, e.g. "QTN-26-". */
export function qtnPrefix(): string {
  return `QTN-${String(CURRENT_YY).padStart(2, "0")}-`;
}

function parse(full: string): { year: string; suffix: string } {
  const m = /^QTN-(\d{1,2})-(.*)$/i.exec(full || "");
  if (m) return { year: m[1].padStart(2, "0"), suffix: m[2] };
  return { year: String(CURRENT_YY).padStart(2, "0"), suffix: (full || "").replace(/^QTN-/i, "") };
}

/** The editable suffix (part after "QTN-YY-") of a full number. */
export function qtnSuffix(full: string): string {
  return parse(full).suffix;
}

export function QtnNumberInput({
  value,
  onChange,
  onEnter,
  autoFocus,
  id,
}: {
  value: string; // full number, e.g. "QTN-26-0001"
  onChange: (full: string) => void;
  onEnter?: () => void;
  autoFocus?: boolean;
  id?: string;
}) {
  const { year, suffix } = parse(value);
  const emit = (y: string, s: string) => onChange(`QTN-${y}-${s}`);
  return (
    <div className="flex items-stretch overflow-hidden rounded-lg border border-line bg-white focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/30">
      <span className="flex select-none items-center bg-surface pl-3 font-mono text-sm font-bold text-muted">QTN-</span>
      <select
        aria-label="Year"
        className="cursor-pointer bg-surface pl-0.5 pr-1 font-mono text-sm font-bold text-ink focus:outline-none"
        value={year}
        onChange={(e) => emit(e.target.value, suffix)}
      >
        {YEARS.map((yy) => (
          <option key={yy} value={yy}>{yy}</option>
        ))}
      </select>
      <span className="flex select-none items-center bg-surface pr-2 font-mono text-sm font-bold text-muted">-</span>
      <input
        id={id}
        className="flex-1 bg-white px-3 py-2 font-mono text-sm text-ink placeholder:text-muted focus:outline-none"
        autoFocus={autoFocus}
        value={suffix}
        placeholder="0001"
        onChange={(e) => emit(year, e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onEnter?.(); }}
      />
    </div>
  );
}
