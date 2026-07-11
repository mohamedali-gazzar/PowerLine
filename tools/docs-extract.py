# Document-library builder for the "Docs & Support" section.
#
#   python tools/docs-extract.py "<source-folder>"
#
# The source folder contains one sub-folder per CATEGORY, each holding PDFs
# (e.g. the EEHC technical-specification pack). The script:
#   1. copies every file to  frontend/public/specs/<slug>.<ext>   (served statically)
#   2. extracts text per page (pypdf), strips repeated page headers/footers,
#      and splits it into search chunks
#   3. writes  frontend/public/specs-data/manifest.json  (the library listing)
#      and     frontend/public/specs-data/chunks.json    (the chatbot's local
#      search corpus — loaded by Fuse.js in the browser)
#
# Re-run it after adding files to the source folder; it regenerates everything.
# Requires: pip install pypdf

import io
import json
import re
import shutil
import sys
import unicodedata
from collections import Counter
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
OUT_FILES = ROOT / "frontend" / "public" / "specs"
OUT_DATA = ROOT / "frontend" / "public" / "specs-data"

CHUNK_TARGET = 700   # aim for chunks around this many characters
CHUNK_MAX = 1200     # hard cap


def slugify(text: str, fallback: str) -> str:
    t = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    t = re.sub(r"[^a-zA-Z0-9]+", "-", t).strip("-").lower()
    t = re.sub(r"-{2,}", "-", t)
    return t[:60] or fallback


# PDF bullet glyphs / dingbats / private-use symbols that render as boxes in
# the browser — normalize them all to a plain bullet.
_BULLETS = re.compile(r"[•■-◿✀-➿←-⇿-�]+")
_CTRL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")


def clean_line(line: str) -> str:
    line = _CTRL.sub(" ", line)
    line = _BULLETS.sub("•", line)
    return re.sub(r"\s+", " ", line).strip()


def extract_pdf(path: Path):
    """Return list of per-page text with repeated header/footer lines removed."""
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    pages_lines = []
    freq = Counter()
    for page in reader.pages:
        lines = [clean_line(l) for l in (page.extract_text() or "").split("\n")]
        lines = [l for l in lines if l]
        pages_lines.append(lines)
        for l in set(lines):
            freq[l] += 1

    n = len(pages_lines)
    # Lines that repeat on ≥50% of pages (headers/footers/watermarks) add noise
    # to search — drop them, but only for documents long enough to be sure.
    repeated = {l for l, c in freq.items() if n >= 4 and c >= max(2, n * 0.5)}
    return [[l for l in lines if l not in repeated] for lines in pages_lines]


def chunk_page(lines):
    """Merge a page's lines into chunks of roughly CHUNK_TARGET characters."""
    chunks, buf = [], ""
    for line in lines:
        candidate = (buf + " " + line).strip()
        if len(candidate) >= CHUNK_MAX:
            if buf:
                chunks.append(buf)
            buf = line[:CHUNK_MAX]
        elif len(candidate) >= CHUNK_TARGET:
            chunks.append(candidate)
            buf = ""
        else:
            buf = candidate
    if len(buf) >= 60:  # ignore tiny fragments
        chunks.append(buf)
    return chunks


def pretty_name(stem: str) -> str:
    name = re.sub(r"[-_]+", " ", stem)
    return re.sub(r"\s{2,}", " ", name).strip()


def main():
    if len(sys.argv) < 2:
        print("usage: python tools/docs-extract.py <source-folder>")
        sys.exit(1)
    src = Path(sys.argv[1])
    if not src.is_dir():
        print(f"source folder not found: {src}")
        sys.exit(1)

    if OUT_FILES.exists():
        shutil.rmtree(OUT_FILES)
    OUT_FILES.mkdir(parents=True)
    OUT_DATA.mkdir(parents=True, exist_ok=True)

    manifest, chunks = [], []
    used_slugs = set()
    idx = 0

    for cat_dir in sorted(src.iterdir()):
        if not cat_dir.is_dir():
            continue
        category = re.sub(r"\s+", " ", cat_dir.name).strip()
        for f in sorted(cat_dir.iterdir()):
            if not f.is_file():
                continue
            idx += 1
            slug = slugify(f.stem, f"doc-{idx:02d}")
            while slug in used_slugs:
                slug = f"{slug}-{idx}"
            used_slugs.add(slug)
            ext = f.suffix.lower()
            dest = OUT_FILES / f"{slug}{ext}"
            shutil.copyfile(f, dest)

            pages = 0
            doc_chunks = 0
            if ext == ".pdf":
                try:
                    page_texts = extract_pdf(f)
                    pages = len(page_texts)
                    for pno, lines in enumerate(page_texts, start=1):
                        for c in chunk_page(lines):
                            chunks.append({"d": slug, "p": pno, "t": c})
                            doc_chunks += 1
                except Exception as e:  # noqa: BLE001 — a bad PDF shouldn't kill the run
                    print(f"  WARN: text extraction failed for {f.name}: {e}")

            manifest.append(
                {
                    "id": slug,
                    "file": f"specs/{slug}{ext}",
                    "name": pretty_name(f.stem),
                    "category": category,
                    "pages": pages,
                    "kb": round(f.stat().st_size / 1024),
                }
            )
            print(f"  {category} / {f.name} -> {slug}{ext}  ({pages} pages, {doc_chunks} chunks)")

    (OUT_DATA / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False), encoding="utf-8"
    )
    (OUT_DATA / "chunks.json").write_text(
        json.dumps(chunks, ensure_ascii=False), encoding="utf-8"
    )
    total_kb = sum(m["kb"] for m in manifest)
    print(
        f"\nDONE: {len(manifest)} documents ({total_kb // 1024} MB), "
        f"{len(chunks)} search chunks -> {OUT_DATA}"
    )


if __name__ == "__main__":
    main()
