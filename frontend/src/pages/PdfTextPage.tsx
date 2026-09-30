// Write on a PDF — the standalone tool, for a file that belongs to no quotation.
//
// Open one, type on the pages, download it again. Nothing is uploaded and nothing is saved: the file
// is opened, marked and downloaded in the browser and never leaves the machine. That is the whole
// difference from the same thing inside a quotation (Specs tab -> Documents), where the file is kept with the
// QTN and the notes are saved with it.
//
// The writing surface itself is pdf/PdfEditor.

import { useCallback, useRef, useState } from "react";
import { MAX_ATTACHMENT_BYTES } from "../api";
import PdfEditor from "../pdf/PdfEditor";

// The owner's decision: one size limit everywhere, so there is a single answer to "how big a PDF can
// I use". Taken from the attachment limit rather than repeated, so the two can never drift — nothing
// here is uploaded, so this cap is a house rule rather than something the server imposes.
const MAX_BYTES = MAX_ATTACHMENT_BYTES;
const MAX_MB = (MAX_BYTES / 1024 / 1024).toFixed(1);

export default function PdfTextPage() {
  const [name, setName] = useState("");
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const open = useCallback(async (file: File) => {
    setError("");
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      setError(`"${file.name}" is not a PDF.`);
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${MAX_MB} MB.`);
      return;
    }
    setName(file.name);
    setBytes(new Uint8Array(await file.arrayBuffer()));
  }, []);

  const reset = () => {
    setBytes(null); setName(""); setError("");
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-5 animate-fade-up">
      <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void open(f); }} />

      {!bytes ? (
        <div className="card p-6">
          <h1 className="sec-head">Write on a PDF</h1>
          <p className="mb-4 max-w-2xl text-sm text-muted">
            Open a PDF, click anywhere on it to type, then download it again. Useful for marking up a
            client's specification, a supplier datasheet or a drawing. The file stays on this computer —
            it is not uploaded anywhere and nothing is saved. To keep a file and its notes with a
            quotation, use the <b>Documents</b> card on that quotation's <b>Specs</b> tab instead.
          </p>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) void open(f); }}
            onClick={() => fileRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl2 border-2 border-dashed p-12 text-center transition-colors
              ${dragOver ? "border-brand bg-brand-tint" : "border-line hover:border-brand/50 hover:bg-brand-tint/40"}`}>
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
              strokeLinecap="round" strokeLinejoin="round" className="text-brand">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" /><path d="M12 18v-6" /><path d="m9 15 3-3 3 3" />
            </svg>
            <p className="text-sm font-bold text-ink">Drop a PDF here, or click to choose one</p>
            <p className="text-xs text-muted">Up to {MAX_MB} MB</p>
          </div>
          {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
        </div>
      ) : (
        <PdfEditor bytes={bytes} name={name} onBack={reset} backLabel="Another PDF" />
      )}
    </div>
  );
}
