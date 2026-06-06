"""Extract readable text from a .docx, preserving paragraph and table structure.
Reads word/document.xml directly (no external deps)."""
import sys, zipfile, re
import xml.etree.ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def text_of(el):
    return "".join(t.text or "" for t in el.iter(f"{W}t"))


def walk(parent, out):
    for child in parent:
        tag = child.tag
        if tag == f"{W}p":
            txt = text_of(child).strip()
            if txt:
                out.append(txt)
        elif tag == f"{W}tbl":
            out.append("[TABLE]")
            for tr in child.findall(f"{W}tr"):
                cells = []
                for tc in tr.findall(f"{W}tc"):
                    # a cell may hold multiple paragraphs
                    parts = [text_of(p).strip() for p in tc.findall(f"{W}p")]
                    cells.append(" ".join(s for s in parts if s))
                out.append(" | ".join(cells))
            out.append("[/TABLE]")


def main(path):
    with zipfile.ZipFile(path) as z:
        xml = z.read("word/document.xml")
    root = ET.fromstring(xml)
    body = root.find(f"{W}body")
    out = []
    walk(body, out)
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1])
