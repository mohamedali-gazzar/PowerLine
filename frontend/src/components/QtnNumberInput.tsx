// A QTN-number field: a plain text input for the FULL number (value/onChange are the
// full string, e.g. "QTN-26-01479"), starting empty with an example placeholder like
// "QTN-26-00000". The "QTN-YY-" prefix is only a hint, not enforced.

const CURRENT_YY = new Date().getFullYear() % 100;

/** Default prefix with the current year, e.g. "QTN-26-". Used for hints/examples. */
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
  value: string; // full number, e.g. "QTN-26-01479"
  onChange: (full: string) => void;
  onEnter?: () => void;
  autoFocus?: boolean;
  id?: string;
}) {
  return (
    <input
      id={id}
      className="w-full rounded-lg border border-line bg-white px-3 py-2 font-mono text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
      autoFocus={autoFocus}
      value={value}
      placeholder={`QTN-${String(CURRENT_YY).padStart(2, "0")}-00000`}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") onEnter?.(); }}
    />
  );
}
