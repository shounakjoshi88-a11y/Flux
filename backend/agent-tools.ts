// backend/agent-tools.ts
import pptxgen from "pptxgenjs";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { PDFDocument, StandardFonts, rgb, type RGB } from "pdf-lib";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import fontkit from '@pdf-lib/fontkit';

// ─── Shared result type ──────────────────────────────────
export type GeneratedFileResult = {
  base64: string;
  filename: string;
  mime: string;
  slides?: { title: string; content: string }[];
  sections?: { heading: string; body: string }[];
  pages?: { text: string }[];
  rows?: any[][];
  md?: string;
};

// ════════════════════════════════════════════════════════
//  STANDALONE BUILD FUNCTIONS  (called directly by index.ts)
// ════════════════════════════════════════════════════════

export async function buildXLSX(params: {
  title: string;
  rows: any[][];
}): Promise<GeneratedFileResult> {
  const { title, rows } = params;
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const b64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
  return {
    base64: b64,
    filename: `${title.replace(/[^a-zA-Z0-9]/g, "_")}.xlsx`,
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    rows,
  };
}

export async function buildCSV(params: {
  title: string;
  rows: any[][];
}): Promise<GeneratedFileResult> {
  const { title, rows } = params;
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  return {
    base64: Buffer.from(csv).toString("base64"),
    filename: `${title.replace(/[^a-zA-Z0-9]/g, "_")}.csv`,
    mime: "text/csv",
    rows,
  };
}

export async function buildTSV(params: {
  title: string;
  rows: any[][];
}): Promise<GeneratedFileResult> {
  const { title, rows } = params;
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const tsv = XLSX.utils.sheet_to_csv(ws, { FS: "\t" });
  return {
    base64: Buffer.from(tsv).toString("base64"),
    filename: `${title.replace(/[^a-zA-Z0-9]/g, "_")}.tsv`,
    mime: "text/tab-separated-values",
    rows,
  };
}

export async function buildMD(params: {
  title: string;
  content: string;
}): Promise<GeneratedFileResult> {
  const { title, content } = params;
  return {
    base64: Buffer.from(content).toString("base64"),
    filename: `${title.replace(/[^a-zA-Z0-9]/g, "_")}.md`,
    mime: "text/markdown",
    md: content,
  };
}

export async function buildJSON(params: {
  title: string;
  content: string;
}): Promise<GeneratedFileResult> {
  const { title, content } = params;
  return {
    base64: Buffer.from(content).toString("base64"),
    filename: `${title.replace(/[^a-zA-Z0-9]/g, "_")}.json`,
    mime: "application/json",
    md: content,
  };
}

export async function buildSQL(params: {
  title: string;
  content: string;
}): Promise<GeneratedFileResult> {
  const { title, content } = params;
  return {
    base64: Buffer.from(content).toString("base64"),
    filename: `${title.replace(/[^a-zA-Z0-9]/g, "_")}.sql`,
    mime: "text/x-sql",
    md: content,
  };
}

export async function buildHTML(params: {
  title: string;
  content: string;
}): Promise<GeneratedFileResult> {
  const { title, content } = params;
  return {
    base64: Buffer.from(content).toString("base64"),
    filename: `${title.replace(/[^a-zA-Z0-9]/g, "_")}.html`,
    mime: "text/html",
    md: content,
  };
}

export async function buildPPTX(params: {
  title: string;
  slides: { title: string; content: string }[];
}): Promise<GeneratedFileResult> {
  const { title, slides } = params;
  const ppt = new pptxgen();
  ppt.layout = "LAYOUT_WIDE";
  ppt.author = "Flux AI";
  ppt.title = title;

  const titleSlide = ppt.addSlide();
  titleSlide.background = { color: "0f0f0f" };
  titleSlide.addText(title, { x: 1, y: 1.5, w: "80%", h: 1.2, fontSize: 36, bold: true, color: "FFFFFF" });
  titleSlide.addText("Created by Flux AI", { x: 1, y: 2.9, w: "80%", h: 0.5, fontSize: 14, color: "888888" });

  slides.forEach((slide) => {
    const s = ppt.addSlide();
    s.background = { color: "111111" };
    s.addText(slide.title, { x: 0.5, y: 0.4, w: "90%", h: 0.8, fontSize: 24, bold: true, color: "FFFFFF" });
    const bullets = slide.content.split("\n").map((b) => b.replace(/^[-*•]\s*/, "").trim()).filter(Boolean);
    if (bullets.length > 0) {
      s.addText(bullets.map((b) => ({ text: b, options: { bullet: true } })), {
        x: 0.8, y: 1.4, w: "85%", h: 4.2, fontSize: 14, color: "CCCCCC",
      });
    }
  });

  const buffer = await ppt.write({ outputType: "nodebuffer" });
  return {
    base64: Buffer.from(buffer as any).toString("base64"),
    filename: `${title.replace(/[^a-zA-Z0-9]/g, "_")}.pptx`,
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    slides,
  };
}

export async function buildDOCX(params: {
  title: string;
  sections: { heading: string; body: string }[];
}): Promise<GeneratedFileResult> {
  const { title, sections } = params;
  const children: Paragraph[] = [];

  children.push(new Paragraph({
    children: [new TextRun({ text: title, bold: true, size: 36, color: "000000" })],
    spacing: { after: 400 },
  }));

  sections.forEach((sec) => {
    children.push(new Paragraph({
      children: [new TextRun({ text: sec.heading, bold: true, size: 26, color: "1a1a1a" })],
      spacing: { before: 300, after: 120 },
    }));
    sec.body.split(/\n\n+/).forEach((para) => {
      children.push(new Paragraph({
        children: [new TextRun({ text: para.trim(), size: 22 })],
        spacing: { after: 200 },
      }));
    });
  });

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);
  return {
    base64: Buffer.from(buffer).toString("base64"),
    filename: `${title.replace(/[^a-zA-Z0-9]/g, "_")}.docx`,
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    sections,
  };
}

// ════════════════════════════════════════════════════════
//  PDF TEMPLATE SYSTEM
// ════════════════════════════════════════════════════════

export type PDFTemplate = 'corporate' | 'minimal' | 'creative' | 'report';

interface TemplateDef {
  // ── Cover page ────────────────────────────────────────
  cover: {
    bg: RGB;
    titleColor: RGB;
    subtitleColor: RGB;
    accentBar: RGB;
    labelColor: RGB;
    decorColor: RGB;
    decorColor2: RGB;
    logoMain: RGB;
    logoAccent: RGB;
    logoTagline: RGB;
    drawDecorations: (page: any, PW: number, PH: number) => void;
  };
  // ── Content page chrome ───────────────────────────────
  chrome: {
    headerBg: RGB;
    headerText: RGB;
    headerAccentBar: RGB | null; // null = no side accent
    footerLine: RGB;
    footerText: RGB;
  };
  // ── Typography & element styles ───────────────────────
  h1: { bg: RGB; text: RGB; accent: RGB };
  h2: { bar: RGB; text: RGB };
  h3: { text: RGB };
  body: { text: RGB; muted: RGB };
  table: { headerBg: RGB; headerText: RGB; altRow: RGB; border: RGB };
  list: { bullet: RGB; numColor: RGB };
  rule: RGB;
}

function buildTemplates(): Record<PDFTemplate, TemplateDef> {
  return {
    // ──────────────────────────────────────────────────────
    //  CORPORATE  (navy / blue professional — original style)
    // ──────────────────────────────────────────────────────
    corporate: {
      cover: {
        bg:            rgb(0.045, 0.070, 0.150),
        titleColor:    rgb(1, 1, 1),
        subtitleColor: rgb(0.550, 0.700, 0.900),
        accentBar:     rgb(0.231, 0.510, 0.965),
        labelColor:    rgb(0.38, 0.52, 0.78),
        decorColor:    rgb(0.110, 0.190, 0.360),
        decorColor2:   rgb(0.18, 0.35, 0.70),
        logoMain:      rgb(0.28, 0.40, 0.70),
        logoAccent:    rgb(0.231, 0.510, 0.965),
        logoTagline:   rgb(0.32, 0.42, 0.60),
        drawDecorations(page, PW, PH) {
          // Top accent strip
          page.drawRectangle({ x: 0, y: PH - 8, width: PW, height: 8, color: this.accentBar });
          // Left accent bar
          page.drawRectangle({ x: 0, y: 0, width: 6, height: PH, color: this.accentBar });
          // Decorative blocks — top right
          page.drawRectangle({ x: PW - 140, y: PH - 220, width: 100, height: 180, color: this.decorColor });
          page.drawRectangle({ x: PW - 110, y: PH - 190, width: 55,  height: 100, color: this.decorColor2, opacity: 0.35 });
          // Bottom right
          page.drawRectangle({ x: PW - 100, y: 60, width: 70, height: 180, color: this.decorColor });
        },
      },
      chrome: {
        headerBg:         rgb(0.059, 0.090, 0.165),
        headerText:       rgb(1, 1, 1),
        headerAccentBar:  rgb(0.231, 0.510, 0.965),
        footerLine:       rgb(0.796, 0.835, 0.882),
        footerText:       rgb(0.392, 0.455, 0.545),
      },
      h1: { bg: rgb(0.059, 0.090, 0.165), text: rgb(1, 1, 1), accent: rgb(0.231, 0.510, 0.965) },
      h2: { bar: rgb(0.231, 0.510, 0.965), text: rgb(0.075, 0.290, 0.690) },
      h3: { text: rgb(0.25, 0.30, 0.42) },
      body: { text: rgb(0.118, 0.161, 0.231), muted: rgb(0.392, 0.455, 0.545) },
      table: {
        headerBg:   rgb(0.059, 0.090, 0.165),
        headerText: rgb(1, 1, 1),
        altRow:     rgb(0.945, 0.958, 0.980),
        border:     rgb(0.796, 0.835, 0.882),
      },
      list: { bullet: rgb(0.231, 0.510, 0.965), numColor: rgb(0.231, 0.510, 0.965) },
      rule: rgb(0.796, 0.835, 0.882),
    },

    // ──────────────────────────────────────────────────────
    //  MINIMAL  (clean white, subtle grays)
    // ──────────────────────────────────────────────────────
    minimal: {
      cover: {
        bg:            rgb(0.97, 0.97, 0.96),
        titleColor:    rgb(0.08, 0.08, 0.10),
        subtitleColor: rgb(0.38, 0.38, 0.42),
        accentBar:     rgb(0.15, 0.15, 0.18),
        labelColor:    rgb(0.55, 0.55, 0.58),
        decorColor:    rgb(0.88, 0.88, 0.87),
        decorColor2:   rgb(0.80, 0.80, 0.80),
        logoMain:      rgb(0.30, 0.30, 0.34),
        logoAccent:    rgb(0.08, 0.08, 0.10),
        logoTagline:   rgb(0.55, 0.55, 0.58),
        drawDecorations(page, PW, PH) {
          // Top rule (thin)
          page.drawRectangle({ x: 0, y: PH - 4, width: PW, height: 4, color: this.accentBar });
          // Bottom rule
          page.drawRectangle({ x: 0, y: 0, width: PW, height: 3, color: this.decorColor });
          // Subtle geometric quad — bottom right
          page.drawRectangle({ x: PW - 180, y: 0, width: 180, height: 180, color: this.decorColor });
          page.drawRectangle({ x: PW - 120, y: 0, width: 120, height: 90, color: this.decorColor2, opacity: 0.4 });
          // Thin left bar
          page.drawRectangle({ x: 0, y: 0, width: 2, height: PH, color: this.decorColor });
        },
      },
      chrome: {
        headerBg:         rgb(0.97, 0.97, 0.96),
        headerText:       rgb(0.25, 0.25, 0.28),
        headerAccentBar:  null,
        footerLine:       rgb(0.82, 0.82, 0.82),
        footerText:       rgb(0.60, 0.60, 0.62),
      },
      h1: { bg: rgb(0.08, 0.08, 0.10), text: rgb(1, 1, 1), accent: rgb(1, 1, 1) },
      h2: { bar: rgb(0.25, 0.25, 0.28), text: rgb(0.08, 0.08, 0.10) },
      h3: { text: rgb(0.30, 0.30, 0.34) },
      body: { text: rgb(0.12, 0.12, 0.15), muted: rgb(0.50, 0.50, 0.54) },
      table: {
        headerBg:   rgb(0.08, 0.08, 0.10),
        headerText: rgb(1, 1, 1),
        altRow:     rgb(0.94, 0.94, 0.93),
        border:     rgb(0.82, 0.82, 0.82),
      },
      list: { bullet: rgb(0.25, 0.25, 0.28), numColor: rgb(0.25, 0.25, 0.28) },
      rule: rgb(0.82, 0.82, 0.82),
    },

    // ──────────────────────────────────────────────────────
    //  CREATIVE  (teal / indigo — bold and modern)
    // ──────────────────────────────────────────────────────
    creative: {
      cover: {
        bg:            rgb(0.04, 0.10, 0.18),
        titleColor:    rgb(1, 1, 1),
        subtitleColor: rgb(0.60, 0.88, 0.95),
        accentBar:     rgb(0.00, 0.75, 0.80),
        labelColor:    rgb(0.50, 0.80, 0.85),
        decorColor:    rgb(0.06, 0.20, 0.32),
        decorColor2:   rgb(0.28, 0.18, 0.60),
        logoMain:      rgb(0.60, 0.88, 0.95),
        logoAccent:    rgb(0.00, 0.75, 0.80),
        logoTagline:   rgb(0.40, 0.62, 0.72),
        drawDecorations(page, PW, PH) {
          // Teal top strip
          page.drawRectangle({ x: 0, y: PH - 6, width: PW, height: 6, color: this.accentBar });
          // Left indigo bar
          page.drawRectangle({ x: 0, y: 0, width: 8, height: PH, color: this.decorColor2, opacity: 0.85 });
          // Large teal rectangle — right side background
          page.drawRectangle({ x: PW - 180, y: PH - 300, width: 180, height: 300, color: this.decorColor });
          page.drawRectangle({ x: PW - 120, y: PH - 200, width: 120, height: 200, color: this.accentBar, opacity: 0.12 });
          // Diagonal-ish layered shapes bottom
          page.drawRectangle({ x: PW - 220, y: 0, width: 220, height: 140, color: this.decorColor2, opacity: 0.30 });
          page.drawRectangle({ x: PW - 140, y: 0, width: 140, height: 80, color: this.decorColor2, opacity: 0.50 });
        },
      },
      chrome: {
        headerBg:         rgb(0.04, 0.10, 0.18),
        headerText:       rgb(0.75, 0.92, 0.96),
        headerAccentBar:  rgb(0.00, 0.75, 0.80),
        footerLine:       rgb(0.10, 0.28, 0.42),
        footerText:       rgb(0.38, 0.60, 0.70),
      },
      h1: { bg: rgb(0.04, 0.10, 0.18), text: rgb(0.60, 0.88, 0.95), accent: rgb(0.00, 0.75, 0.80) },
      h2: { bar: rgb(0.00, 0.75, 0.80), text: rgb(0.04, 0.22, 0.45) },
      h3: { text: rgb(0.05, 0.28, 0.50) },
      body: { text: rgb(0.10, 0.18, 0.28), muted: rgb(0.38, 0.52, 0.62) },
      table: {
        headerBg:   rgb(0.04, 0.10, 0.18),
        headerText: rgb(0.60, 0.88, 0.95),
        altRow:     rgb(0.92, 0.97, 0.99),
        border:     rgb(0.70, 0.88, 0.92),
      },
      list: { bullet: rgb(0.00, 0.75, 0.80), numColor: rgb(0.00, 0.65, 0.70) },
      rule: rgb(0.65, 0.85, 0.92),
    },

    // ──────────────────────────────────────────────────────
    //  REPORT  (academic / formal — white with gray structure)
    // ──────────────────────────────────────────────────────
    report: {
      cover: {
        bg:            rgb(1, 1, 1),
        titleColor:    rgb(0.07, 0.07, 0.08),
        subtitleColor: rgb(0.32, 0.32, 0.36),
        accentBar:     rgb(0.38, 0.38, 0.42),
        labelColor:    rgb(0.50, 0.50, 0.54),
        decorColor:    rgb(0.88, 0.88, 0.90),
        decorColor2:   rgb(0.78, 0.78, 0.82),
        logoMain:      rgb(0.30, 0.30, 0.34),
        logoAccent:    rgb(0.12, 0.12, 0.15),
        logoTagline:   rgb(0.55, 0.55, 0.58),
        drawDecorations(page, PW, PH) {
          // Outer frame
          page.drawRectangle({ x: 20, y: 20, width: PW - 40, height: PH - 40, color: this.decorColor });
          page.drawRectangle({ x: 26, y: 26, width: PW - 52, height: PH - 52, color: this.bg });
          // Thick top bar
          page.drawRectangle({ x: 20, y: PH - 20, width: PW - 40, height: -80, color: this.decorColor });
          page.drawRectangle({ x: 26, y: PH - 20, width: PW - 52, height: -80, color: this.decorColor2 });
          // Thin accent line
          page.drawRectangle({ x: 56, y: PH - 100, width: PW - 112, height: 2, color: this.accentBar });
        },
      },
      chrome: {
        headerBg:         rgb(0.94, 0.94, 0.95),
        headerText:       rgb(0.20, 0.20, 0.22),
        headerAccentBar:  null,
        footerLine:       rgb(0.78, 0.78, 0.80),
        footerText:       rgb(0.55, 0.55, 0.58),
      },
      h1: { bg: rgb(0.20, 0.20, 0.22), text: rgb(1, 1, 1), accent: rgb(0.55, 0.55, 0.58) },
      h2: { bar: rgb(0.38, 0.38, 0.42), text: rgb(0.07, 0.07, 0.08) },
      h3: { text: rgb(0.22, 0.22, 0.26) },
      body: { text: rgb(0.10, 0.10, 0.12), muted: rgb(0.45, 0.45, 0.48) },
      table: {
        headerBg:   rgb(0.20, 0.20, 0.22),
        headerText: rgb(1, 1, 1),
        altRow:     rgb(0.95, 0.95, 0.96),
        border:     rgb(0.78, 0.78, 0.80),
      },
      list: { bullet: rgb(0.38, 0.38, 0.42), numColor: rgb(0.20, 0.20, 0.22) },
      rule: rgb(0.78, 0.78, 0.80),
    },
  };
}

// ════════════════════════════════════════════════════════
//  MARKDOWN PARSER
// ════════════════════════════════════════════════════════

type SegmentType =
  | 'heading1' | 'heading2' | 'heading3'
  | 'paragraph' | 'listItem' | 'orderedItem'
  | 'table' | 'rule';

interface Segment {
  type: SegmentType;
  content: string;
}

function parseMarkdownToSegments(text: string): Segment[] {
  const lines = text.split('\n');
  const segments: Segment[] = [];
  let currentParagraph = '';
  let inTable = false;
  let tableBuffer: string[] = [];

  const flushParagraph = () => {
    if (currentParagraph.trim()) {
      segments.push({ type: 'paragraph', content: currentParagraph.trim() });
      currentParagraph = '';
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    if (trimmed.startsWith('|') && trimmed.indexOf('|', 1) > 0) {
      if (!inTable) { flushParagraph(); inTable = true; tableBuffer = []; }
      tableBuffer.push(trimmed);
      continue;
    } else if (inTable) {
      inTable = false;
      segments.push({ type: 'table', content: tableBuffer.join('\n') });
      tableBuffer = [];
    }

    if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
      flushParagraph();
      segments.push({ type: 'rule', content: '' });
      continue;
    }

    if (trimmed.startsWith('# ')) {
      flushParagraph();
      segments.push({ type: 'heading1', content: trimmed.slice(2).trim() });
    } else if (trimmed.startsWith('## ')) {
      flushParagraph();
      segments.push({ type: 'heading2', content: trimmed.slice(3).trim() });
    } else if (trimmed.startsWith('### ')) {
      flushParagraph();
      segments.push({ type: 'heading3', content: trimmed.slice(4).trim() });
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
      flushParagraph();
      segments.push({ type: 'listItem', content: trimmed.slice(2).trim() });
    } else if (/^\d+\.\s+/.test(trimmed)) {
      flushParagraph();
      const match = trimmed.match(/^(\d+)\.\s+(.*)/);
      const num = match?.[1] ?? '1';
      const body = match?.[2]?.trim() ?? trimmed;
      segments.push({ type: 'orderedItem', content: `${num}. ${body}` });
    } else if (trimmed === '') {
      flushParagraph();
    } else {
      currentParagraph += (currentParagraph ? ' ' : '') + trimmed;
    }
  }

  flushParagraph();
  if (inTable) segments.push({ type: 'table', content: tableBuffer.join('\n') });
  return segments;
}

// ════════════════════════════════════════════════════════
//  PDF BUILDER  — multi-template engine
// ════════════════════════════════════════════════════════

export async function buildPDF(params: {
  title: string;
  pages: { text: string }[];
  template?: PDFTemplate;
}): Promise<GeneratedFileResult> {
  const { title, pages } = params;
  const templateName: PDFTemplate = params.template ?? 'corporate';
  const tmpl = buildTemplates()[templateName];

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  // ── Font loading ──────────────────────────────────────
  let fReg: any;
  let fBold: any;
  try {
    const [rb, bb] = await Promise.all([
      fetch('https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.0/ttf/DejaVuSans.ttf')
        .then(r => { if (!r.ok) throw new Error('font'); return r.arrayBuffer(); }),
      fetch('https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.0/ttf/DejaVuSans-Bold.ttf')
        .then(r => { if (!r.ok) throw new Error('bold font'); return r.arrayBuffer(); }),
    ]);
    fReg  = await pdfDoc.embedFont(new Uint8Array(rb),  { subset: true });
    fBold = await pdfDoc.embedFont(new Uint8Array(bb),  { subset: true });
    console.log(`✅ DejaVu fonts loaded for PDF [${templateName}]`);
  } catch (err) {
    console.warn('⚠️ Custom fonts failed, using Helvetica:', err);
    fReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);
    fBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  }

  // ── Page geometry (A4) ────────────────────────────────
  const PW    = 595;
  const PH    = 842;
  const ML    = 56;
  const MR    = 56;
  const CW    = PW - ML - MR;
  const HDR   = 32;
  const FTR   = 44;
  const Y_TOP  = PH - HDR - 16;
  const Y_STOP = FTR + 12;

  // ── Text utilities ────────────────────────────────────
  const clean = (s: string): string =>
    s.replace(/\*\*(.*?)\*\*/g, '$1')
     .replace(/__(.*?)__/g, '$1')
     .replace(/\*(.*?)\*/g, '$1')
     .replace(/_(.*?)_/g, '$1')
     .replace(/`(.*?)`/g, '$1')
     .replace(/[^\x00-\xFF]/g, '?');

  const wrap = (text: string, font: any, size: number, maxW: number): string[] => {
    if (!text.trim()) return [''];
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = '';
    for (const word of words) {
      const test = cur ? `${cur} ${word}` : word;
      let tw = 0;
      try { tw = font.widthOfTextAtSize(test, size); } catch { tw = test.length * size * 0.5; }
      if (tw > maxW && cur) { lines.push(cur); cur = word; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  };

  // ── Page state ────────────────────────────────────────
  let page: any   = null;
  let curY: number = 0;
  let pNum: number = 0;

  const newPage = () => {
    pNum++;
    page = pdfDoc.addPage([PW, PH]);

    // ── Header bar ──────────────────────────────────────
    page.drawRectangle({ x: 0, y: PH - HDR, width: PW, height: HDR, color: tmpl.chrome.headerBg });
    if (tmpl.chrome.headerAccentBar) {
      page.drawRectangle({ x: 0, y: PH - HDR, width: 4, height: HDR, color: tmpl.chrome.headerAccentBar });
    }
    // Minimal / report: bottom rule under header
    if (!tmpl.chrome.headerAccentBar) {
      page.drawRectangle({ x: 0, y: PH - HDR - 1, width: PW, height: 1, color: tmpl.chrome.footerLine });
    }

    const hd = clean(title).substring(0, 62) + (title.length > 62 ? '…' : '');
    try {
      page.drawText(hd, { x: ML, y: PH - HDR + 11, size: 8, font: fReg, color: tmpl.chrome.headerText });
    } catch {}

    // ── Footer ────────────────────────────────────────
    page.drawLine({
      start: { x: ML, y: FTR - 2 }, end: { x: PW - MR, y: FTR - 2 },
      thickness: 0.5, color: tmpl.chrome.footerLine,
    });
    try {
      page.drawText(`${pNum}`,    { x: PW / 2 - 5, y: FTR - 15, size: 8, font: fReg, color: tmpl.chrome.footerText });
      page.drawText('Flux AI',    { x: PW - MR - 32, y: FTR - 15, size: 8, font: fReg, color: tmpl.chrome.footerText });
    } catch {}

    curY = Y_TOP;
  };

  const need = (n: number) => { if (curY - n < Y_STOP) newPage(); };

  const putLines = (
    lines: string[],
    font: any,
    size: number,
    color: any,
    x: number = ML,
    lineHeight?: number,
    afterGap: number = 0,
  ) => {
    const lh = lineHeight ?? Math.ceil(size * 1.58);
    for (const ln of lines) {
      need(lh + 2);
      try { page.drawText(ln, { x, y: curY - size, size, font, color }); } catch {}
      curY -= lh;
    }
    if (afterGap) curY -= afterGap;
  };

  // ════════════════════════════════════════════════════
  //  COVER PAGE
  // ════════════════════════════════════════════════════
  const cov = pdfDoc.addPage([PW, PH]);
  const cv  = tmpl.cover;

  // Background
  cov.drawRectangle({ x: 0, y: 0, width: PW, height: PH, color: cv.bg });

  // Template-specific decorations
  cv.drawDecorations.call(cv, cov, PW, PH);

  // ── Cover content ──────────────────────────────────
  const covX = ML + 22;

  // "GENERATED DOCUMENT" label
  try {
    cov.drawText('GENERATED DOCUMENT', {
      x: covX, y: PH - 100, size: 8.5, font: fReg, color: cv.labelColor
    });
  } catch {}

  // Title (wrapped)
  const covLines = wrap(clean(title), fBold, 26, CW - 50);
  let cy = PH - 145;
  for (const ln of covLines) {
    try { cov.drawText(ln, { x: covX, y: cy, size: 26, font: fBold, color: cv.titleColor }); } catch {}
    cy -= 36;
  }

  // Accent rule under title
  cy -= 14;
  cov.drawRectangle({ x: covX, y: cy, width: 56, height: 3, color: cv.accentBar });
  cy -= 26;

  // Date + attribution
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  try {
    cov.drawText(dateStr,                { x: covX, y: cy,      size: 11, font: fReg, color: cv.subtitleColor });
    cov.drawText('Generated by Flux AI', { x: covX, y: cy - 20, size: 9,  font: fReg, color: cv.labelColor });
  } catch {}

  // Template badge — subtle label bottom-left
  try {
    cov.drawText(`Template: ${templateName}`, { x: covX, y: 75, size: 7, font: fReg, color: cv.labelColor });
  } catch {}

  // Bottom branding
  try {
    cov.drawText('FLUX', { x: covX, y: 58, size: 20, font: fBold, color: cv.logoMain });
    cov.drawText('AI',   { x: covX + 41, y: 58, size: 20, font: fBold, color: cv.logoAccent });
    cov.drawText('Intelligent Document Generation', { x: covX, y: 40, size: 7.5, font: fReg, color: cv.logoTagline });
  } catch {}

  // ════════════════════════════════════════════════════
  //  CONTENT RENDERING
  // ════════════════════════════════════════════════════
  newPage();

  const allText = pages.map(p => p.text).join('\n\n');
  const segs    = parseMarkdownToSegments(allText);

  for (const seg of segs) {
    const txt = typeof seg.content === 'string' ? clean(seg.content) : '';

    // ── Heading 1 ────────────────────────────────────────
    if (seg.type === 'heading1') {
      curY -= 16;
      const lines = wrap(txt, fBold, 15, CW - 24);
      const boxH  = lines.length * 26 + 14;
      need(boxH + 8);

      page.drawRectangle({ x: ML, y: curY - boxH, width: CW,   height: boxH, color: tmpl.h1.bg });
      page.drawRectangle({ x: ML, y: curY - boxH, width: 4,    height: boxH, color: tmpl.h1.accent });

      let hy = curY - 14;
      for (const ln of lines) {
        try { page.drawText(ln, { x: ML + 14, y: hy - 15, size: 15, font: fBold, color: tmpl.h1.text }); } catch {}
        hy -= 26;
      }
      curY -= boxH + 12;

    // ── Heading 2 ────────────────────────────────────────
    } else if (seg.type === 'heading2') {
      curY -= 12;
      const lines = wrap(txt, fBold, 13, CW - 16);
      const boxH  = lines.length * 22 + 8;
      need(boxH + 6);

      page.drawRectangle({ x: ML, y: curY - boxH, width: 3, height: boxH, color: tmpl.h2.bar });

      let hy = curY - 8;
      for (const ln of lines) {
        try { page.drawText(ln, { x: ML + 12, y: hy - 13, size: 13, font: fBold, color: tmpl.h2.text }); } catch {}
        hy -= 22;
      }
      curY -= boxH + 8;

    // ── Heading 3 ────────────────────────────────────────
    } else if (seg.type === 'heading3') {
      curY -= 10;
      const lines = wrap(txt, fBold, 11.5, CW);
      need(lines.length * 18 + 6);
      putLines(lines, fBold, 11.5, tmpl.h3.text, ML, 18, 4);

    // ── Paragraph ────────────────────────────────────────
    } else if (seg.type === 'paragraph') {
      curY -= 2;
      const lines = wrap(txt, fReg, 10.5, CW);
      putLines(lines, fReg, 10.5, tmpl.body.text, ML, 17, 6);

    // ── Unordered list item ───────────────────────────────
    } else if (seg.type === 'listItem') {
      const INDENT = 16;
      const lines  = wrap(txt, fReg, 10.5, CW - INDENT);
      const lh     = 17;
      for (let li = 0; li < lines.length; li++) {
        need(lh + 2);
        if (li === 0) {
          try { page.drawCircle({ x: ML + 4, y: curY - 7, size: 2.2, color: tmpl.list.bullet }); } catch {}
        }
        try { page.drawText(lines[li]!, { x: ML + INDENT, y: curY - 10.5, size: 10.5, font: fReg, color: tmpl.body.text }); } catch {}
        curY -= lh;
      }
      curY -= 2;

    // ── Ordered list item ─────────────────────────────────
    } else if (seg.type === 'orderedItem') {
      const safeTxt = typeof txt === 'string' ? txt : '';
      const dotIdx   = safeTxt.indexOf('. ');
      const numPart  = dotIdx > -1 ? safeTxt.slice(0, dotIdx + 1) : '';
      const bodyPart = dotIdx > -1 ? safeTxt.slice(dotIdx + 2) : safeTxt;
      const INDENT   = 20;
      const lh       = 17;
      const lines    = wrap(bodyPart, fReg, 10.5, CW - INDENT);

      for (let li = 0; li < lines.length; li++) {
        need(lh + 2);
        if (li === 0) {
          try { page.drawText(numPart, { x: ML, y: curY - 10.5, size: 10.5, font: fBold, color: tmpl.list.numColor }); } catch {}
        }
        try { page.drawText(lines[li]!, { x: ML + INDENT, y: curY - 10.5, size: 10.5, font: fReg, color: tmpl.body.text }); } catch {}
        curY -= lh;
      }
      curY -= 2;

    // ── Horizontal rule ───────────────────────────────────
    } else if (seg.type === 'rule') {
      curY -= 10;
      need(10);
      try {
        page.drawLine({
          start: { x: ML, y: curY - 4 }, end: { x: ML + CW, y: curY - 4 },
          thickness: 0.8, color: tmpl.rule,
        });
      } catch {}
      curY -= 14;

    // ── Table ─────────────────────────────────────────────
    } else if (seg.type === 'table') {
      const rows = seg.content
        .split('\n')
        .filter(r => !r.match(/^\|[\s:-]+\|/))
        .map(r => r.split('|').map(c => c.trim()).filter(c => c !== ''));

      if (!rows.length) continue;

      const colCount = Math.max(...rows.map(r => r.length));
      if (!colCount) continue;

      const colW = CW / colCount;
      const RH   = 22;

      curY -= 10;
      const tableTop = curY;

      for (let ri = 0; ri < rows.length; ri++) {
        const row   = rows[ri]!;
        const isHdr = ri === 0;
        need(RH + 2);

        page.drawRectangle({
          x: ML, y: curY - RH, width: CW, height: RH,
          color: isHdr ? tmpl.table.headerBg : (ri % 2 === 1 ? tmpl.table.altRow : rgb(1, 1, 1)),
        });

        for (let ci = 0; ci < colCount; ci++) {
          const cell  = clean(row[ci] || '');
          const cellX = ML + ci * colW;

          if (ci > 0) {
            try {
              page.drawLine({
                start: { x: cellX, y: curY }, end: { x: cellX, y: curY - RH },
                thickness: 0.5, color: tmpl.table.border,
              });
            } catch {}
          }

          let display = cell;
          const maxCW = colW - 12;
          try {
            const tf = isHdr ? fBold : fReg;
            while (display.length > 3 && tf.widthOfTextAtSize(display, 9) > maxCW) {
              display = display.slice(0, -4) + '…';
            }
            page.drawText(display, {
              x: cellX + 6, y: curY - RH + 7,
              size: 9, font: isHdr ? fBold : fReg,
              color: isHdr ? tmpl.table.headerText : tmpl.body.text,
            });
          } catch {}
        }

        try {
          page.drawLine({
            start: { x: ML, y: curY - RH }, end: { x: ML + CW, y: curY - RH },
            thickness: 0.5, color: tmpl.table.border,
          });
        } catch {}

        curY -= RH;
      }

      try {
        page.drawLine({ start: { x: ML, y: curY }, end: { x: ML + CW, y: curY }, thickness: 1.0, color: tmpl.table.border });
        page.drawLine({ start: { x: ML, y: tableTop }, end: { x: ML, y: curY }, thickness: 0.8, color: tmpl.table.border });
        page.drawLine({ start: { x: ML + CW, y: tableTop }, end: { x: ML + CW, y: curY }, thickness: 0.8, color: tmpl.table.border });
        page.drawLine({ start: { x: ML, y: tableTop }, end: { x: ML + CW, y: tableTop }, thickness: 1.2, color: tmpl.table.headerBg });
      } catch {}

      curY -= 12;
    }
  }

  const pdfBytes = await pdfDoc.save();
  return {
    base64: Buffer.from(pdfBytes).toString("base64"),
    filename: `${title.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`,
    mime: "application/pdf",
    pages,
  };
}