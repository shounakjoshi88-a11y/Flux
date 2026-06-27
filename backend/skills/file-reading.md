# Reading Uploaded Files

## Why this skill exists

When a user uploads a file, the path is listed in the fileGuard notice at `/home/user/uploads/<filename>`.
**The file may be truncated in context.** You must go read it properly.

The naive thing — `read_file` on everything — is wrong for most files:
- On a PDF, XLSX, or DOCX it prints binary garbage.
- On a large CSV it floods your context with rows you will never use.
- On an image it does nothing useful.

This skill tells you the right first move for each type.

## General protocol

1. **Check the extension.** That is your dispatch key.
2. **Check file size before reading.** Use `run_bash` with `stat`:
   ```bash
   stat -c '%s bytes' /home/user/uploads/report.pdf
   ```
   For files > 1MB, read only what you need (head/sample) — do NOT load the whole thing.
3. **Read just enough to answer.** If they asked "how many rows", use `wc -l` or pandas `nrows=1` for CSV; don't load the whole file.
4. **After reading/editing, call `get_generated_file`** to deliver results. Files left in the sandbox are invisible.

## Dispatch table

| Extension | First move | Notes |
| --------- | ---------- | ----- |
| `.txt`, `.md`, `.log`, `.json`, `.yaml`, `.yml`, `.toml`, `.ini`, `.cfg`, `.env` | `read_file({ path: "/home/user/uploads/<file>" })` — these are plain text. | For huge (>1MB) logs: `run_bash` with `tail -200` instead. |
| `.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.rs`, `.go`, `.java`, `.c`, `.cpp`, `.h`, `.hpp`, `.css`, `.scss`, `.less`, `.html`, `.svelte`, `.vue` | `read_file({ path: "/home/user/uploads/<file>" })` — code files are text. | After reading, use `run_bash` to compile/lint/typecheck. |
| `.csv`, `.tsv` | Use `run_bash` with Python pandas to preview:\n```python\nimport pandas as pd\ndf = pd.read_csv("/home/user/uploads/data.csv", nrows=5)\nprint(df)\nprint(df.dtypes)\n``` | For `.tsv` add `sep="\\t"`. Get row count with `wc -l` (approximate). |
| `.json`, `.jsonl` | Use Python `json` module or `jq`:\n```python\nimport json\nwith open("/home/user/uploads/data.json") as f:\n    data = json.load(f)\nif isinstance(data, list): print(f"Array of {len(data)} items")\nelif isinstance(data, dict): print(f"Object with keys: {list(data.keys())}")\n``` | JSONL: `head -3` then `wc -l`. |
| `.pdf` | **NEVER** `read_file` a PDF. Use Python:\n```python\nimport pymupdf\ndoc = pymupdf.open("/home/user/uploads/file.pdf")\nprint(f"{len(doc)} pages")\nfor page in doc:\n    print(page.get_text())\n``` | `pymupdf` (aka `fitz`) is pre-installed. For scanned PDFs without text layer, the output will be empty. |
| `.docx` | **NEVER** `read_file` a DOCX. Use Python:\n```python\nfrom docx import Document\ndoc = Document("/home/user/uploads/file.docx")\nfor para in doc.paragraphs:\n    print(para.text)\n``` | `python-docx` is pre-installed. |
| `.xlsx`, `.xlsm` | **NEVER** `read_file` an XLSX. Use Python:\n```python\nfrom openpyxl import load_workbook\nwb = load_workbook("/home/user/uploads/data.xlsx", read_only=True)\nprint(f"Sheets: {wb.sheetnames}")\nws = wb.active\nfor row in ws.iter_rows(max_row=5, values_only=True):\n    print(row)\n``` | `openpyxl` is pre-installed. `read_only=True` is critical for large files. |
| `.pptx` | **NEVER** `read_file` a PPTX. Use Python:\n```python\nfrom pptx import Presentation\nprs = Presentation("/home/user/uploads/deck.pptx")\nfor slide in prs.slides:\n    for shape in slide.shapes:\n        if shape.has_text_frame:\n            for para in shape.text_frame.paragraphs:\n                print(para.text)\n``` | `python-pptx` is pre-installed. |
| `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg`, `.ico` | **The image is already in your context** as visual input. You do NOT need to read it from disk. | Only use `run_bash` with PIL if you need to process programmatically:\n```python\nfrom PIL import Image\nimg = Image.open("/home/user/uploads/photo.jpg")\nprint(img.size, img.mode)\n``` |
| `.zip`, `.tar`, `.tar.gz`, `.tgz`, `.gz` | **NEVER** blindly extract. List contents first:\n```bash\nunzip -l /home/user/uploads/bundle.zip\ntar -tf /home/user/uploads/bundle.tar.gz\n``` | For standalone `.gz` (no tar), peek with:\n```bash\nzcat /home/user/uploads/data.gz | head -50\n``` |
| `.exe`, `.bin`, `.dll`, `.so`, `.wasm`, `.o`, `.a`, `.lib`, `.pyc` | **NEVER** `read_file`. Use `file`:\n```bash\nfile /home/user/uploads/mystery.bin\n``` | Binary files. Only process if user explicitly asks. |
| Unknown | Use `file` to identify, then decide: `file /home/user/uploads/mystery.ext` | If still unknown, ask the user. |

## Important rules

- **NEVER** `cat` or `read_file` a binary file (PDF, DOCX, XLSX, PPTX, images, archives, executables) — you get garbage.
- **ALWAYS** check file size first for large files (>1MB). Use `stat -c '%s bytes' /path/to/file`.
- **For code/text files**, `read_file` is the right tool — it returns the complete content.
- **After editing or generating a file**, call `get_generated_file` to deliver it to the user. Do NOT just say "the file has been saved" and leave it in the sandbox.
- **Do NOT install packages.** The sandbox already has Python 3 with pandas, openpyxl, python-docx, python-pptx, pymupdf (fitz), Pillow.
