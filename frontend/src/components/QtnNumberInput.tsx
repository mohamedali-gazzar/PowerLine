// A QTN-number field locked to the serial format QTN-YY-NNNNN (e.g. "QTN-26-01479"):
// "QTN-", a 2-digit year, "-", then a 5-digit serial. The input is masked as you type —
// only digits are accepted and the dashes are inserted automatically — and value/onChange
// are always the full string. Shared by the New-QTN dialog for both LV and MV.

const CURRENT_YY = new Date().getFullYear() % 100;

/** Default prefix with the current year, e.g. "QTN-26-". Used for the seed + examples. */
export function qtnPrefix(): string {
  return `QTN-${String(CURRENT_YY).padStart(2, "0")}-`;
}

/** Coerce whatever the user typed into the QTN-YY-NNNNN shape (digits only, max 2+5).
 *  Empty input stays empty so the placeholder shows. */
export function maskQtn(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "").slice(0, 7); // YY (2) + serial (5)
  if (digits.length === 0) return "";
  if (digits.length < 2) return `QTN-${digits}`;
  const yy = digits.slice(0, 2);
  const serial = digits.slice(2);
  return `QTN-${yy}-${serial}`; // once the year is complete, show the "-" and the serial
}

/** True only for a complete serial: QTN-<2 digits>-<5 digits>. */
export function isValidQtn(full: string): boolean {
  return /^QTN-\d{2}-\d{5}$/.test((full || "").trim());
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
      inputMode="numeric"
      className="w-full rounded-lg border border-line bg-white px-3 py-2 font-mono text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
      autoFocus={autoFocus}
      value={value}
      placeholder={`QTN-${String(CURRENT_YY).padStart(2, "0")}-00000`}
      onChange={(e) => onChange(maskQtn(e.target.value))}
      onKeyDown={(e) => { if (e.key === "Enter") onEnter?.(); }}
    />
  );
}
