// A QTN-number field with a fixed "QTN-YY-" prefix. The year prefix is locked
// (shown as a static label); the user only types the part after the last dash.
// Full number = qtnPrefix() + suffix.

export function qtnPrefix(): string {
  return `QTN-${String(new Date().getFullYear() % 100).padStart(2, "0")}-`;
}

/** Build a full QTN number from the typed suffix. */
export function composeQtn(suffix: string): string {
  return qtnPrefix() + suffix.trim();
}

/** Strip the QTN-YY- prefix off a full number to get the editable suffix. */
export function qtnSuffix(full: string): string {
  const p = qtnPrefix();
  if (full.startsWith(p)) return full.slice(p.length);
  return full.replace(/^QTN-\d{2}-/i, "");
}

export function QtnNumberInput({
  value,
  onChange,
  onEnter,
  autoFocus,
  id,
}: {
  value: string; // the editable suffix
  onChange: (suffix: string) => void;
  onEnter?: () => void;
  autoFocus?: boolean;
  id?: string;
}) {
  return (
    <div className="flex items-stretch">
      <span className="flex select-none items-center rounded-l-lg border border-r-0 border-line bg-surface px-3 font-mono text-sm font-bold text-muted">
        {qtnPrefix()}
      </span>
      <input
        id={id}
        className="input flex-1 rounded-l-none font-mono"
        autoFocus={autoFocus}
        value={value}
        placeholder="0001"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onEnter?.(); }}
      />
    </div>
  );
}
