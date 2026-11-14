/**
 * Peek-panel state machine.
 *
 * The side panel shows one "peek" at a time: a web URL, a PDF/docx/pptx/xlsx/
 * markdown document, a generated-code widget or a raw file dump. All of those
 * share the same close semantics ("open one, clear the other six"), which used
 * to be scattered across nine `useState` calls in the dashboard. They are
 * grouped here, and every setter still exists because `PeekPanel` and friends
 * address the states individually.
 *
 * `handlePreview` implements the artifacts integration: the artifacts modal
 * hands us a typed payload with a filename, we clear every other peek (and
 * the open URL panel) and show the matching one - and the modal itself is
 * always closed so the preview renders next to the chat.
 *
 * Extracted from `pages/Dashboard.tsx`.
 *
 * Usage:
 *   const peek = usePeekPanelState();
 *   <PeekPanel isOpen={peek.isPeeking} url={peek.peekUrl} ... onClose={peek.closeAllPeeks} />
 */
import { useCallback, useState } from "react";

/** Payload shape artifacts (and message previews) hand to the peek panel. */
export type PreviewPayload = {
  type: "pdf" | "docx" | "pptx" | "xlsx" | "md";
  base64?: string;
  html?: string;
  filename: string;
};

export function usePeekPanelState() {
  const [peekUrl, setPeekUrl] = useState<string | null>(null);
  const [peekPdf, setPeekPdf] = useState<{ base64: string; filename: string } | null>(null);
  const [peekDocx, setPeekDocx] = useState<{ html: string; filename: string } | null>(null);
  const [peekPptx, setPeekPptx] = useState<{ base64: string; filename: string } | null>(null);
  const [peekXlsx, setPeekXlsx] = useState<{ base64: string; filename: string } | null>(null);
  const [peekMd, setPeekMd] = useState<{ base64: string; filename: string } | null>(null);
  const [peekFile, setPeekFile] = useState<{ name: string; content: string } | null>(null);
  const [htmlPreviewContent, setHtmlPreviewContent] = useState<string | null>(null);

  /** True while any peek surface is populated (used for layout/panel sizing). */
  const isPeeking = !!(
    peekUrl || peekPdf || peekDocx || peekPptx || peekXlsx || peekMd || peekFile || htmlPreviewContent
  );

  /** Clear every peek surface. */
  const closeAllPeeks = useCallback(() => {
    setPeekUrl(null);
    setPeekPdf(null);
    setPeekDocx(null);
    setPeekPptx(null);
    setPeekXlsx(null);
    setPeekMd(null);
    setPeekFile(null);
    setHtmlPreviewContent(null);
  }, []);

  /** Clear only the document peeks (the PeekPanel's own close button). */
  const closeDocumentPeeks = useCallback(() => {
    setPeekUrl(null);
    setPeekPdf(null);
    setPeekDocx(null);
    setPeekPptx(null);
    setPeekXlsx(null);
    setPeekMd(null);
  }, []);

  /** Peek a raw text/code file dump. */
  const openPeekFile = useCallback((file: { name: string; content: string } | null) => {
    setPeekFile(file);
  }, []);

  /** Render an HTML/JSX artifact inline in the peek panel. */
  const handleHtmlPreview = useCallback((html: string) => {
    setHtmlPreviewContent(html);
  }, []);

  /**
   * Artifact preview handler. Opens the matching document peek and clears
   * everything else (including any open URL panel). The artifacts modal is
   * closed by the caller after this returns so the preview can sit next to
   * the chat.
   */
  const handlePreview = useCallback((data: PreviewPayload) => {
    // Clear ALL peek states (including any open URL panel) before showing artifact
    setPeekUrl(null);
    setPeekPdf(null);
    setPeekDocx(null);
    setPeekPptx(null);
    setPeekXlsx(null);
    setPeekMd(null);

    if (data.type === "pdf" && data.base64) {
      setPeekPdf({ base64: data.base64, filename: data.filename });
    } else if (data.type === "docx" && data.html) {
      setPeekDocx({ html: data.html, filename: data.filename });
    } else if (data.type === "pptx" && data.base64) {
      setPeekPptx({ base64: data.base64, filename: data.filename });
    } else if (data.type === "xlsx" && data.base64) {
      setPeekXlsx({ base64: data.base64, filename: data.filename });
    } else if (data.type === "md" && data.base64) {
      setPeekMd({ base64: data.base64, filename: data.filename });
    }
  }, []);

  return {
    isPeeking,
    closeAllPeeks,
    closeDocumentPeeks,
    peekUrl, setPeekUrl,
    peekPdf, setPeekPdf,
    peekDocx, setPeekDocx,
    peekPptx, setPeekPptx,
    peekXlsx, setPeekXlsx,
    peekMd, setPeekMd,
    peekFile, setPeekFile, openPeekFile,
    htmlPreviewContent, setHtmlPreviewContent,
    handleHtmlPreview,
    handlePreview,
  };
}
