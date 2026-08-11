import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export const GENERAL_KEY = "__general__";

export interface ReturnComment {
  key: string;
  label: string;
  comment: string;
}
type PanelOption = { id?: string; name?: string } | string;

/**
 * ReturnForRevisionModal — the reviewer's "send it back" dialog. Collects one or
 * more comments, each tagged to a specific panel (or "General — whole quotation"),
 * then hands the list back through onReturn. Theme-aware: the charcoal/white
 * prototype palette is re-expressed through the app's CSS variables so it works in
 * dark mode; brand orange (#F16722) is constant in both themes.
 */
export default function ReturnForRevisionModal({
  open,
  title = "",
  panels = [],
  generalOption = true,
  onCancel,
  onReturn,
}: {
  open: boolean;
  title?: string;
  panels?: PanelOption[];
  generalOption?: boolean;
  onCancel?: () => void;
  onReturn?: (comments: ReturnComment[]) => void;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [comments, setComments] = useState<ReturnComment[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const selectWrapRef = useRef<HTMLDivElement | null>(null);

  // Dropdown entries: "General" first, then "1-DB", "2-MDB", … from the quotation data.
  const options: { key: string; label: string }[] = [
    ...(generalOption ? [{ key: GENERAL_KEY, label: "General — whole quotation" }] : []),
    ...panels.map((p, i) => ({
      key: (typeof p === "string" ? undefined : p?.id) ?? `panel-${i}`,
      label: `${i + 1}-${typeof p === "string" ? p : p?.name || `Panel ${i + 1}`}`,
    })),
  ];
  const selected = options.find((o) => o.key === selectedKey) || null;

  const canAdd = !!selected && draft.trim().length > 0;
  const pendingCount = comments.length + (canAdd ? 1 : 0);
  const canReturn = pendingCount > 0;

  // Fresh state every time the modal opens.
  useEffect(() => {
    if (open) {
      setSelectedKey(null);
      setDraft("");
      setComments([]);
      setMenuOpen(false);
    }
  }, [open]);

  // Esc closes (menu first, then modal); clicking outside closes the menu.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (menuOpen) setMenuOpen(false);
      else onCancel?.();
    };
    const onDown = (e: MouseEvent) => {
      if (selectWrapRef.current && !selectWrapRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, menuOpen, onCancel]);

  if (!open) return null;

  const addComment = () => {
    if (!canAdd || !selected) return;
    setComments((c) => [...c, { key: selected.key, label: selected.label, comment: draft.trim() }]);
    setDraft("");
    setSelectedKey(null);
  };

  const removeComment = (idx: number) => setComments((c) => c.filter((_, i) => i !== idx));

  const handleReturn = () => {
    // A valid comment typed but not "+ Add"-ed is included automatically.
    const all = canAdd && selected
      ? [...comments, { key: selected.key, label: selected.label, comment: draft.trim() }]
      : comments;
    if (!all.length) return;
    onReturn?.(all);
  };

  return createPortal(
    <div className="rfr-backdrop" role="dialog" aria-modal="true" aria-label="Return for revision">
      <div className="rfr-card">
        <div className="rfr-head">
          <div>
            <h2 className="rfr-title">Return for revision</h2>
            {title ? <div className="rfr-sub">{title} · {panels.length} panels</div> : null}
          </div>
          <button type="button" className="rfr-x" onClick={onCancel} aria-label="Close">×</button>
        </div>

        <div className="rfr-divider" />

        <label className="rfr-label">PANEL <span className="rfr-req">*</span></label>
        <div className="rfr-selectwrap" ref={selectWrapRef}>
          <button
            type="button"
            className={`rfr-select ${menuOpen ? "is-open" : ""}`}
            onClick={() => setMenuOpen((v) => !v)}
            autoFocus
          >
            <span className={selected ? "" : "rfr-placeholder"}>
              {selected ? selected.label : "Select a panel…"}
            </span>
            <svg width="12" height="8" viewBox="0 0 12 8" className={`rfr-chev ${menuOpen ? "up" : ""}`} aria-hidden="true">
              <path d="M1 1.5 L6 6.5 L11 1.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {menuOpen && (
            <div className="rfr-menu" role="listbox">
              {options.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  role="option"
                  aria-selected={o.key === selectedKey}
                  className={`rfr-option ${o.key === selectedKey ? "is-selected" : ""} ${o.key === GENERAL_KEY ? "is-general" : ""}`}
                  onClick={() => { setSelectedKey(o.key); setMenuOpen(false); }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <label className="rfr-label">COMMENT <span className="rfr-req">*</span></label>
        <textarea
          className="rfr-textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            selected && selected.key === GENERAL_KEY
              ? "Write a note about the whole quotation…"
              : "What needs to change in this panel?"
          }
          rows={3}
        />

        <button type="button" className="rfr-add" onClick={addComment} disabled={!canAdd}>
          +&nbsp;&nbsp;Add comment
        </button>

        <div className="rfr-divider" />

        <div className="rfr-label rfr-listlabel">ADDED COMMENTS ({comments.length})</div>
        {comments.length === 0 ? (
          <div className="rfr-empty">Nothing added yet — at least one comment is required.</div>
        ) : (
          <div className="rfr-list">
            {comments.map((c, i) => (
              <div className="rfr-row" key={i}>
                <div className="rfr-rowbody">
                  <div className="rfr-rowtitle">{c.label}</div>
                  <div className="rfr-rowtext">{c.comment}</div>
                </div>
                <button
                  type="button"
                  className="rfr-x rfr-rowx"
                  onClick={() => removeComment(i)}
                  aria-label={`Remove comment for ${c.label}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="rfr-divider" />

        <div className="rfr-footer">
          <span className="rfr-hint">
            {canReturn
              ? `${pendingCount} comment${pendingCount > 1 ? "s" : ""} will be sent`
              : "At least 1 comment required"}
          </span>
          <div className="rfr-actions">
            <button type="button" className="rfr-cancel" onClick={onCancel}>Cancel</button>
            <button type="button" className="rfr-return" onClick={handleReturn} disabled={!canReturn}>
              Return for revision
            </button>
          </div>
        </div>
      </div>
      <style>{styles}</style>
    </div>,
    document.body,
  );
}

// Colours resolve through the app's theme variables (rgb(var(--c-*))) so the dialog
// follows light/dark; brand orange #F16722 is intentionally constant.
const styles = `
.rfr-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:1000;}
.rfr-card{width:440px;max-width:calc(100vw - 32px);max-height:calc(100vh - 48px);overflow:auto;background:var(--c-card);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.35);padding:24px;color:rgb(var(--c-ink));}
.rfr-head{display:flex;justify-content:space-between;align-items:flex-start;}
.rfr-title{margin:0;font-size:19px;font-weight:700;}
.rfr-sub{margin-top:4px;font-size:11.5px;color:rgb(var(--c-muted));}
.rfr-x{border:0;background:none;color:rgb(var(--c-muted));font-size:16px;cursor:pointer;padding:2px 6px;line-height:1;border-radius:6px;}
.rfr-x:hover{color:rgb(var(--c-ink));background:rgb(var(--c-ink) / .06);}
.rfr-divider{height:1px;background:rgb(var(--c-line));margin:14px 0;}
.rfr-label{display:block;font-size:10px;font-weight:600;letter-spacing:1.1px;color:rgb(var(--c-muted));margin:2px 0 6px;}
.rfr-req{color:#F16722;}
.rfr-selectwrap{position:relative;margin-bottom:14px;}
.rfr-select{width:100%;display:flex;justify-content:space-between;align-items:center;gap:8px;padding:11px 14px;font-size:12.5px;font-family:inherit;color:rgb(var(--c-ink));background:var(--c-card);border:1px solid rgb(var(--c-line));border-radius:8px;cursor:pointer;text-align:left;}
.rfr-select.is-open,.rfr-select:focus-visible{border-color:#F16722;box-shadow:0 0 0 1px rgba(241,103,34,.35);outline:none;}
.rfr-placeholder{color:rgb(var(--c-muted) / .8);}
.rfr-chev{color:rgb(var(--c-muted));transition:transform .15s;flex:none;}
.rfr-chev.up{transform:rotate(180deg);}
.rfr-menu{position:absolute;top:calc(100% + 4px);left:0;right:0;background:var(--c-card);border:1px solid rgb(var(--c-line));border-radius:10px;box-shadow:0 14px 36px rgba(0,0,0,.3);padding:4px;max-height:262px;overflow:auto;z-index:10;}
.rfr-option{display:block;width:100%;text-align:left;padding:10px 12px;font-size:12px;font-family:inherit;color:rgb(var(--c-ink));background:none;border:0;border-radius:7px;cursor:pointer;}
.rfr-option:hover{background:rgba(241,103,34,.08);}
.rfr-option.is-selected{background:rgba(241,103,34,.12);color:#F16722;font-weight:600;}
.rfr-option.is-general{font-weight:500;border-bottom:1px solid rgb(var(--c-line));border-bottom-left-radius:0;border-bottom-right-radius:0;margin-bottom:2px;}
.rfr-textarea{width:100%;box-sizing:border-box;resize:vertical;min-height:84px;padding:11px 14px;font-size:12.5px;font-family:inherit;color:rgb(var(--c-ink));background:var(--c-card);border:1px solid rgb(var(--c-line));border-radius:8px;}
.rfr-textarea:focus-visible{border-color:#F16722;box-shadow:0 0 0 1px rgba(241,103,34,.35);outline:none;}
.rfr-textarea::placeholder{color:rgb(var(--c-muted) / .8);}
.rfr-add{margin-top:12px;padding:9px 16px;font-size:12px;font-weight:600;font-family:inherit;color:#F16722;background:var(--c-card);border:1.2px solid #F16722;border-radius:8px;cursor:pointer;}
.rfr-add:hover:not(:disabled){background:rgba(241,103,34,.06);}
.rfr-add:disabled{opacity:.4;cursor:not-allowed;}
.rfr-listlabel{margin-bottom:8px;}
.rfr-empty{font-size:11.5px;color:rgb(var(--c-muted));padding:6px 0 2px;}
.rfr-list{display:flex;flex-direction:column;gap:8px;}
.rfr-row{display:flex;align-items:flex-start;gap:8px;background:rgb(var(--c-ink) / .05);border-left:3.5px solid #F16722;border-radius:8px;padding:10px 12px;}
.rfr-rowbody{flex:1;min-width:0;}
.rfr-rowtitle{font-size:11.5px;font-weight:600;}
.rfr-rowtext{font-size:11px;color:rgb(var(--c-muted));margin-top:2px;white-space:pre-wrap;word-break:break-word;}
.rfr-rowx{font-size:13px;flex:none;}
.rfr-footer{display:flex;justify-content:space-between;align-items:center;gap:12px;}
.rfr-hint{font-size:10.5px;color:rgb(var(--c-muted));}
.rfr-actions{display:flex;align-items:center;gap:14px;}
.rfr-cancel{border:0;background:none;font-size:12.5px;font-family:inherit;color:rgb(var(--c-muted));cursor:pointer;}
.rfr-cancel:hover{color:rgb(var(--c-ink));}
.rfr-return{padding:11px 22px;font-size:12.5px;font-weight:600;font-family:inherit;color:#fff;background:#F16722;border:0;border-radius:8px;cursor:pointer;}
.rfr-return:hover:not(:disabled){background:rgba(241,103,34,.88);}
.rfr-return:disabled{opacity:.4;cursor:not-allowed;}
`;
