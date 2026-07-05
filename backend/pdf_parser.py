#!/usr/bin/env python3
"""
PDF extraction engine for Flux.
Uses pymupdf4llm to extract markdown, tables, headings, images from PDFs.
Scanned pages get automatic OCR via Tesseract (per-page, only when needed).
Outputs JSON to stdout — designed to be called as a subprocess from Bun.
"""
import sys
import json
import traceback

try:
    import pymupdf4llm
except ImportError as e:
    print(json.dumps({"error": f"Missing dependency: {e}. Run: pip install pymupdf4llm"}), file=sys.stderr)
    sys.exit(1)


def estimate_tokens(text: str) -> int:
    return len(text) // 4


def extract(pdf_path: str) -> dict:
    result = pymupdf4llm.to_markdown(
        pdf_path,
        page_chunks=True,
        embed_images=True,
        image_format="png",
        ocr_dpi=200,
    )

    pages_output = []
    full_markdown_parts = []
    ocr_count = 0

    for page in result:
        text = page.get("text", "")
        meta = page.get("metadata", {})
        images = page.get("images", [])

        was_ocr = meta.get("ocr_applied", False)
        if was_ocr:
            ocr_count += 1

        pages_output.append({
            "page": meta.get("page", 0),
            "text": text,
            "images": images,
            "ocr_applied": was_ocr,
            "heading": _detect_first_heading(text),
        })
        if text:
            full_markdown_parts.append(text)

    full_markdown = "\n\n".join(full_markdown_parts)
    is_scanned = ocr_count > 0

    return {
        "metadata": {
            "pages": len(result),
            "ocr_pages": ocr_count,
            "is_scanned": is_scanned,
            "has_images": any(bool(page.get("images")) for page in result),
        },
        "markdown": full_markdown,
        "pages": pages_output,
        "token_count": estimate_tokens(full_markdown),
    }


def _detect_first_heading(text: str) -> str | None:
    for line in text.split("\n"):
        stripped = line.strip()
        if stripped.startswith("#"):
            return stripped.lstrip("# ").strip()
    return None


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
