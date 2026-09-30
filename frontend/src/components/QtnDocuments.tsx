// A quotation's Documents card, on its Specs tab: the client's files, and writing on the PDFs
// among them.
//
// The files live in their own table on the server (LvAttachment), not in the QTN state, which is
// re-saved on every keystroke. The NOTES written on a PDF do live in the QTN state, keyed by the
// file's id, so they are saved, shared and revised exactly like the rest of the quotation — and the
// stored PDF is never touched, so the original a client sent is always still the original.
//
// The writing surface is pdf/PdfEditor, shared with the standalone tool in the sidebar.

import { useEffect, useRef, useState } from "react";
import { api, MAX_ATTACHMENT_BYTES, type QtnAttachmentDto } from "../api";
import { useDialogs } from "./ConfirmModal";
import PdfEditor from "../pdf/PdfEditor";
import type { TextMark } from "../pdf/pdfText";

/** Human file size. */
function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
/** A picked file as plain base64 — FileReader yields a data: URL, so drop its prefix. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error ?? new Error("Could not read the file."));
    r.readAsDataURL(file);
  });
}
const isPdf = (f: QtnAttachmentDto) => /\.pdf$/i.test(f.name) || f.mime === "application/pdf";
/** Notes worth counting — a box someone opened and left blank is not one. Used everywhere a number
 *  is shown, so the list and the "remove this file" warning can never disagree. */
const noteCount = (marks: TextMark[] | undefined) => (marks ?? []).filter((m) => m.text.trim()).length;
const shortDate = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
};

export default function QtnDocuments({ qtnId, notes, onNotes, readOnly }: {
  qtnId: string;
  /** Notes typed on each file, keyed by the file's id. Saved with the quotation. */
  notes: Record<string, TextMark[]>;
  onNotes: (next: Record<string, TextMark[]>) => void;
  readOnly: boolean;
}) {
  const { confirm, dialogs } = useDialogs();
  const [files, setFiles] = useState<QtnAttachmentDto[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pick = useRef<HTMLInputElement>(null);

  // The file being written on: its row plus the bytes fetched from the server.
  const [open, setOpen] = useState<{ file: QtnAttachmentDto; bytes: Uint8Array } | null>(null);
  const [opening, setOpening] = useState("");

  useEffect(() => {
    if (!qtnId) return;
    let alive = true;
    api.qtns.attachments
      .list(qtnId)
      .then((r) => { if (alive) setFiles(r); })
      .catch(() => { if (alive) { setFiles([]); setError("Could not load the files."); } });
    return () => { alive = false; };
  }, [qtnId]);

  const onPicked = async (picked: FileList | null) => {
    if (!picked?.length || !qtnId) return;
    setBusy(true);
    setError("");
    // One at a time: each file is its own request, and the first failure (usually "too large")
    // should not lose the ones that already went up.
    for (const f of Array.from(picked)) {
      if (f.size > MAX_ATTACHMENT_BYTES) {
        setError(`"${f.name}" is ${fmtBytes(f.size)} — the limit is ${fmtBytes(MAX_ATTACHMENT_BYTES)} per file.`);
        continue;
      }
      try {
        const data = await fileToBase64(f);
        const row = await api.qtns.attachments.upload(qtnId, {
          name: f.name, mime: f.type || "application/octet-stream", data,
        });
        setFiles((prev) => [...(prev ?? []), row]);
      } catch (e) {
        setError(e instanceof Error ? e.message : `Could not upload "${f.name}".`);
      }
    }
    setBusy(false);
    if (pick.current) pick.current.value = ""; // so re-picking the same file fires onChange
  };

  const remove = async (f: QtnAttachmentDto) => {
    const has = noteCount(notes[f.id]);
    if (!(await confirm({
      title: "Remove this file",
      message: has
        ? `"${f.name}" and the ${has} note${has === 1 ? "" : "s"} written on it are removed from this quotation.`
        : `"${f.name}" is removed from this quotation.`,
      confirmLabel: "Remove",
      tone: "danger",
    }))) return;
    try {
      await api.qtns.attachments.remove(qtnId, f.id);
      setFiles((prev) => (prev ?? []).filter((x) => x.id !== f.id));
      if (notes[f.id]) {
        const next = { ...notes };
        delete next[f.id];
        onNotes(next);                        // nothing left to point at
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the file.");
    }
  };

  /** Fetch a stored PDF's bytes and hand them to the editor. */
  const write = async (f: QtnAttachmentDto) => {
    setError("");
    setOpening(f.id);
    try {
      const res = await fetch(api.qtns.attachments.link(qtnId, f.id));
      if (!res.ok) throw new Error(`the server answered ${res.status}`);
      setOpen({ file: f, bytes: new Uint8Array(await res.arrayBuffer()) });
    } catch (e) {
      setError(e instanceof Error ? `"${f.name}" could not be opened — ${e.message}` : `"${f.name}" could not be opened.`);
    } finally {
      setOpening("");
    }
  };

  if (open) {
    return (
      <div className="animate-fade-up">
        {dialogs}
        <PdfEditor
          key={open.file.id}
          bytes={open.bytes}
          name={open.file.name}
          initialMarks={notes[open.file.id] ?? []}
          onMarksChange={(marks) => onNotes({ ...notes, [open.file.id]: marks })}
          readOnly={readOnly}
          onBack={() => setOpen(null)}
          backLabel="← Files"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-up">
      {dialogs}
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* No explainer under the heading — the owner asked for it off. What it does is in the
              buttons on each row, and the size limit only matters when a file is refused, which the
              error says in full. */}
          <h2 className="sec-head mb-0">Documents</h2>
          <button type="button" onClick={() => pick.current?.click()} disabled={readOnly || busy || !qtnId}
            className="btn-ghost shrink-0 disabled:opacity-40">{busy ? "Uploading…" : "+ Upload files"}</button>
          <input ref={pick} type="file" multiple className="hidden" onChange={(e) => onPicked(e.target.files)} />
        </div>

        {error && (
          <p className="mt-3 rounded-md border border-red-400/50 bg-red-500/10 px-2 py-1.5 text-[11px] font-semibold text-red-600">
            {error}
          </p>
        )}

        {files === null ? (
          <p className="mt-3 text-sm text-muted">Loading…</p>
        ) : files.length === 0 ? (
          <p className="mt-3 rounded-lg bg-surface p-6 text-center text-sm text-muted">
            No files yet. Upload a client's PDF to write on it.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
            {files.map((f) => {
              const n = noteCount(notes[f.id]);
              return (
                <li key={f.id} className="flex items-center gap-3 px-3 py-2">
                  <a href={api.qtns.attachments.link(qtnId, f.id)} target="_blank" rel="noreferrer"
                    className="min-w-0 flex-1 truncate text-sm font-semibold text-ink hover:text-brand-dark hover:underline"
                    title={`Open ${f.name}`}>
                    {f.name}
                  </a>
                  {n > 0 && (
                    <span className="chip shrink-0 bg-brand-tint text-brand-dark" title="Notes written on this file">
                      {n} note{n === 1 ? "" : "s"}
                    </span>
                  )}
                  <span className="shrink-0 text-xs text-muted">{fmtBytes(f.size)}</span>
                  <span className="hidden shrink-0 text-xs text-muted sm:inline">
                    {f.byEmail || "—"} · {shortDate(f.createdAt)}
                  </span>
                  {isPdf(f) && (
                    <button type="button" onClick={() => void write(f)} disabled={!!opening}
                      className="btn-ghost shrink-0 px-2 py-1 text-[11px] disabled:opacity-40">
                      {opening === f.id ? "Opening…" : readOnly ? "View notes" : "✎ Write on it"}
                    </button>
                  )}
                  <a href={api.qtns.attachments.link(qtnId, f.id, true)} download={f.name}
                    title="Download the original" className="shrink-0 rounded p-1 text-muted hover:bg-surface hover:text-brand-dark">⬇</a>
                  <button type="button" onClick={() => void remove(f)} disabled={readOnly}
                    title="Remove this file"
                    className="shrink-0 rounded p-1 text-muted transition-colors hover:bg-surface hover:text-red-600 disabled:opacity-40">✕</button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
