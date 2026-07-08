#!/usr/bin/env python3
"""
PDF extraction engine for Flux.
Uses PyMuPDF (fitz) directly to extract text from PDFs.
Outputs JSON to stdout — designed to be called as a subprocess from Bun.
"""
import sys
import json
import traceback

try:
    import fitz
except ImportError as e:
    print(json.dumps({"error": f"Missing dependency: {e}. Run: pip install PyMuPDF"}), file=sys.stderr)
    sys.exit(1)


def estimate_tokens(text: str) -> int:
    return len(text) // 4


def _page_to_markdown_text(page: fitz.Page) -> str:
    blocks = page.get_text("dict")["blocks"]
    lines = []
    for block in blocks:
        if block["type"] == 0:
            for line in block["lines"]:
                text = "".join(span["text"] for span in line["spans"])
                if text.strip():
                    lines.append(text)
        elif block["type"] == 1:
            lines.append(f"[Image block {block.get('number', '?')}]")
    return "\n".join(lines)


def _detect_first_heading(text: str) -> str | None:
    for line in text.split("\n"):
        stripped = line.strip()
        if stripped.startswith("#"):
            return stripped.lstrip("# ").strip()
    return None


def extract(pdf_path: str) -> dict:
    doc = fitz.open(pdf_path)
    total_pages = doc.page_count
    pages_output = []
    full_markdown_parts = []

    for page_num in range(total_pages):
        page = doc[page_num]
        text = _page_to_markdown_text(page)
        pages_output.append({
            "page": page_num,
            "text": text,
            "images": [],
            "ocr_applied": False,
            "heading": _detect_first_heading(text),
        })
        if text.strip():
            full_markdown_parts.append(text)

    doc.close()

    full_markdown = "\n\n".join(full_markdown_parts)

    return {
        "metadata": {
            "pages": total_pages,
            "ocr_pages": 0,
            "is_scanned": False,
            "has_images": False,
        },
        "markdown": full_markdown or "[PDF parser: fitz extracted no text — file may be image-only or corrupted]",
        "pages": pages_output,
        "token_count": estimate_tokens(full_markdown),
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: pdf_parser.py <path_to_pdf>"}), file=sys.stderr)
        sys.exit(1)

    pdf_path = sys.argv[1]
    try:
        print(json.dumps(extract(pdf_path)))
    except MemoryError:
        print(json.dumps({"error": "PDF parsing failed: out of memory (possible OCR bomb)"}), file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": f"PDF parsing failed: {traceback.format_exc()}"}), file=sys.stderr)
        sys.exit(1)
