// Rasterise an uploaded PDF (a transformer technical sheet) into one image per page. The MV
// technical offer is exported by snapshotting each `.a4-sheet` div, which CANNOT see a raw
// <embed>/<iframe> PDF — so to make an uploaded sheet appear in the offer (on screen and in the
// exported PDF) we draw each PDF page onto a canvas and hand back an <img>. Uses pdfjs-dist.
import * as pdfjsLib from "pdfjs-dist";
// Vite's `?worker` bundles the (ESM) pdf.js worker and hands back a Worker constructor with the
// correct module type. This is more reliable across embedded/webview browsers than pointing
// `workerSrc` at a `?url` (which loads the worker as a classic script and can hang).
import PdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";

// One persistent worker for the whole app session, reused across renders. pdf.js does NOT
// terminate a caller-provided workerPort on `pdf.destroy()`, so sharing it is safe even when two
// sheets (or React's dev double-invoke) render at once.
pdfjsLib.GlobalWorkerOptions.workerPort = new PdfjsWorker();

/** One rendered PDF page: a JPEG data URL plus its pixel size (to preserve the page aspect). */
export interface PdfPageImage {
  dataUrl: string;
  width: number;
  height: number;
}

/** Render every page of a PDF (raw bytes) to a JPEG data URL. `scale` trades sharpness for file
 *  size; 2 is crisp enough for print without bloating the exported offer PDF. `onPage` fires as
 *  each page finishes, so callers can show pages progressively rather than waiting for the whole
 *  document (rendering a multi-page datasheet can take several seconds).
 *
 *  Each call spins up its OWN pdf.js worker (and tears it down at the end): a shared worker is
 *  fragile because when one document's `destroy()` runs it can kill a worker another render is
 *  still using — which happens with React's dev double-invoke and with two sheets rendering at
 *  once. */
export async function renderPdfToImages(
  data: Uint8Array,
  scale = 2,
  onPage?: (page: PdfPageImage, index: number, total: number) => void,
): Promise<PdfPageImage[]> {
  // getDocument may transfer the buffer, so give it a copy — the caller might reuse `data`.
  const pdf = await pdfjsLib.getDocument({ data: data.slice() }).promise;
  const pages: PdfPageImage[] = [];
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const img: PdfPageImage = { dataUrl: canvas.toDataURL("image/jpeg", 0.85), width: canvas.width, height: canvas.height };
      pages.push(img);
      onPage?.(img, n, pdf.numPages);
      page.cleanup();
    }
  } finally {
    await pdf.destroy(); // destroys the document only — the shared workerPort stays alive
  }
  return pages;
}

/** Decode a base64 string (no `data:` prefix) to raw bytes. */
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
