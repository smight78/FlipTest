import * as pdfjsLib from "pdfjs-dist";

if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

export interface PDFPageImage {
  pageNumber: number;
  dataUrl: string;
  width: number;
  height: number;
}

export interface PDFInfo {
  numPages: number;
  title?: string;
  author?: string;
}

/**
 * Get basic info about a PDF file
 */
export async function getPDFInfo(file: File): Promise<PDFInfo> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const metadata = await pdf.getMetadata().catch(() => null);
  const info = (metadata?.info as Record<string, string | undefined>) || {};

  return {
    numPages: pdf.numPages,
    title: info.Title || undefined,
    author: info.Author || undefined,
  };
}

/**
 * Convert a PDF file (or ArrayBuffer from URL) to an array of page images
 */
export async function convertPDFToImages(
  source: File | ArrayBuffer,
  scale: number = 1.5,
  onProgress?: (current: number, total: number) => void
): Promise<PDFPageImage[]> {
  let arrayBuffer: ArrayBuffer;
  if (source instanceof ArrayBuffer) {
    arrayBuffer = source;
  } else {
    arrayBuffer = await source.arrayBuffer();
  }

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: PDFPageImage[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;

    await page.render({ canvasContext: ctx, viewport }).promise;

    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

    pages.push({
      pageNumber: i,
      dataUrl,
      width: viewport.width,
      height: viewport.height,
    });

    page.cleanup();
    onProgress?.(i, pdf.numPages);
  }

  pdf.destroy();
  return pages;
}

/**
 * Fetch a PDF from a URL and return its ArrayBuffer
 */
export async function fetchPDFAsArrayBuffer(
  url: string,
  onDownloadProgress?: (loaded: number, total: number) => void
): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download PDF: ${response.status} ${response.statusText}`
    );
  }

  if (onDownloadProgress && response.body) {
    const contentLength = response.headers.get("content-length");
    const total = contentLength ? parseInt(contentLength, 10) : 0;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      onDownloadProgress(loaded, total);
    }

    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result.buffer as ArrayBuffer;
  }

  return response.arrayBuffer();
}