"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  BookOpen,
  Link2,
  Copy,
  Check,
  Download,
  Globe,
  Loader2,
  FileUp,
} from "lucide-react";
import { PDFUpload } from "@/components/pdf-upload";
import { FlipBook } from "@/components/flipbook/FlipBook";
import {
  convertPDFToImages,
  fetchPDFAsArrayBuffer,
  type PDFPageImage,
} from "@/lib/pdf-renderer";
import { generateStandaloneHTML } from "@/lib/generate-standalone-html";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AppView = "upload" | "flipbook" | "loading-url";

export default function Home() {
  const [view, setView] = useState<AppView>("upload");
  const [pages, setPages] = useState<PDFPageImage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Share dialog
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [pdfUrlInput, setPdfUrlInput] = useState("");
  const [shareLink, setShareLink] = useState("");
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [copied, setCopied] = useState(false);

  // HTML download
  const [isGeneratingHTML, setIsGeneratingHTML] = useState(false);

  // Track current PDF URL (for ?pdf= parameter views)
  const [currentPdfUrl, setCurrentPdfUrl] = useState<string | null>(null);

  // ── Load from ?pdf= URL parameter on mount ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pdfUrl = params.get("pdf");
    if (!pdfUrl) return;

    let cancelled = false;

    (async () => {
      setView("loading-url");
      setFileName(decodeURIComponent(pdfUrl.split("/").pop() || "document.pdf"));

      try {
        // Download the PDF with progress
        setProgress(0);
        setTotal(1);

        const arrayBuffer = await fetchPDFAsArrayBuffer(pdfUrl, (loaded, t) => {
          if (t > 0) {
            setProgress(Math.round((loaded / t) * 100));
            setTotal(100);
          }
        });

        if (cancelled) return;

        // Render the pages
        setIsProcessing(true);
        setProgress(0);
        setTotal(0);

        const info = await convertPDFToImages(arrayBuffer, 1.5, (c, t) => {
          setProgress(c);
          setTotal(t);
        });

        if (cancelled) return;

        setPages(info);
        setIsProcessing(false);
        setCurrentPdfUrl(pdfUrl);
        setView("flipbook");
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load the PDF. Make sure the URL is correct and the file is publicly accessible."
        );
        setView("upload");
        setIsProcessing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleFileSelected = useCallback(async (file: File) => {
    setError(null);
    setFileName(file.name);
    setIsProcessing(true);
    setProgress(0);
    setTotal(0);
    setCurrentPdfUrl(null);

    try {
      const info = await convertPDFToImages(file, 1.5, (current, t) => {
        setProgress(current);
        setTotal(t);
      });

      setPages(info);
      setIsProcessing(false);

      setTimeout(() => {
        setView("flipbook");
      }, 300);
    } catch (err) {
      console.error("PDF conversion error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to process PDF. Please try another file."
      );
      setIsProcessing(false);
      setFileName(null);
    }
  }, []);

  const handleClear = useCallback(() => {
    setPages([]);
    setFileName(null);
    setProgress(0);
    setTotal(0);
    setError(null);
    setCurrentPdfUrl(null);
  }, []);

  const handleBack = useCallback(() => {
    if (window.location.search) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    setView("upload");
    setPages([]);
    setFileName(null);
    setProgress(0);
    setTotal(0);
    setCurrentPdfUrl(null);
  }, []);

  // ── Share: generate URL-based link ──
  const handleOpenShare = useCallback(() => {
    setShareDialogOpen(true);
    setShareLink("");
    setCopied(false);
    setIsGeneratingLink(false);
    setIsGeneratingHTML(false);

    // Pre-fill with current PDF URL if loaded from one
    if (currentPdfUrl) {
      setPdfUrlInput(currentPdfUrl);
    }
  }, [currentPdfUrl]);

  const handleGenerateLink = useCallback(() => {
    if (!pdfUrlInput.trim()) return;

    setIsGeneratingLink(true);
    const url = pdfUrlInput.trim();
    const base = window.location.origin + window.location.pathname;
    const shareUrl = `${base}?pdf=${encodeURIComponent(url)}`;
    setShareLink(shareUrl);

    // Also update the browser URL
    window.history.replaceState({}, "", `?pdf=${encodeURIComponent(url)}`);
    setCurrentPdfUrl(url);
    setIsGeneratingLink(false);
  }, [pdfUrlInput]);

  // ── Share: download standalone HTML ──
  const handleDownloadHTML = useCallback(async () => {
    if (pages.length === 0 || !fileName) return;

    setIsGeneratingHTML(true);
    try {
      const html = await generateStandaloneHTML(pages, fileName);

      // Trigger download
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName.replace(/\.pdf$/i, "") + "-flipbook.html";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error generating HTML:", err);
    }
    setIsGeneratingHTML(false);
  }, [pages, fileName]);

  const handleCopyLink = useCallback(async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = shareLink;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [shareLink]);

  // ── Loading states ──
  if (view === "loading-url") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-stone-50 via-stone-50 to-background">
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-xl bg-primary/10 p-4">
            <Globe className="h-8 w-8 text-primary animate-pulse" />
          </div>
          <div className="text-center space-y-1">
            {isProcessing && total > 0 ? (
              <>
                <p className="text-sm font-medium">
                  Rendering flipbook pages...
                </p>
                <p className="text-xs text-muted-foreground">
                  Page {progress} of {total}
                </p>
                <div className="w-48 mt-2">
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{
                        width: total > 0 ? `${(progress / total) * 100}%` : "0%",
                      }}
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm font-medium">
                  Downloading PDF...
                </p>
                <p className="text-xs text-muted-foreground">
                  Fetching from {progress}%
                </p>
                <div className="w-48 mt-2">
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{
                        width: `${progress}%`,
                      }}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-stone-50 via-stone-50 to-background">
      {/* Header */}
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-primary/10 p-1.5">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-semibold leading-tight">
                PDF to Flipbook
              </h1>
              <p className="text-[11px] text-muted-foreground leading-tight hidden sm:block">
                Interactive 3D page viewer &middot; Share anywhere
              </p>
            </div>
          </div>

          {view === "flipbook" && fileName && (
            <div className="flex-1 flex justify-end">
              <span className="text-xs text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-full truncate max-w-xs">
                {fileName}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12">
        {view === "upload" && (
          <div className="flex flex-col items-center gap-8 w-full animate-in fade-in duration-500">
            <div className="text-center space-y-2 max-w-lg">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Transform PDFs into{" "}
                <span className="text-primary">Interactive Flipbooks</span>
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base">
                Upload any PDF and enjoy a realistic, 3D page-turning
                experience. Share via link or download as a standalone HTML
                file.
              </p>
            </div>

            <PDFUpload
              onFileSelected={handleFileSelected}
              isProcessing={isProcessing}
              progress={progress}
              total={total}
              fileName={fileName}
              onClear={handleClear}
            />

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 px-4 py-2.5 rounded-lg max-w-xl">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl w-full mt-4">
              {[
                {
                  title: "Share via Link",
                  desc: "Host your PDF online and generate a shareable flipbook URL.",
                  icon: "🔗",
                },
                {
                  title: "Download HTML",
                  desc: "Get a self-contained HTML file that works anywhere, offline.",
                  icon: "📦",
                },
                {
                  title: "3D Page Curl",
                  desc: "Realistic page-turning animation with shadows and depth.",
                  icon: "📖",
                },
              ].map((f) => (
                <div
                  key={f.title}
                  className="rounded-lg border bg-card p-4 text-center space-y-1.5"
                >
                  <span className="text-xl">{f.icon}</span>
                  <p className="text-sm font-medium">{f.title}</p>
                  <p className="text-xs text-muted-foreground">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === "flipbook" && pages.length > 0 && (
          <div className="w-full animate-in fade-in duration-300">
            <FlipBook
              pages={pages}
              fileName={fileName || undefined}
              onBack={handleBack}
              onShare={handleOpenShare}
            />
          </div>
        )}
      </main>

      {/* ── Share Dialog ── */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="rounded-lg bg-primary/10 p-1.5">
                <Link2 className="h-4 w-4 text-primary" />
              </div>
              Share Flipbook
            </DialogTitle>
            <DialogDescription>
              Share your flipbook as a link or download it as a standalone HTML
              file.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="link" className="w-full">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="link" className="gap-1.5 text-xs sm:text-sm">
                <Globe className="h-3.5 w-3.5" />
                Share Link
              </TabsTrigger>
              <TabsTrigger value="download" className="gap-1.5 text-xs sm:text-sm">
                <Download className="h-3.5 w-3.5" />
                Download HTML
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: URL-based sharing */}
            <TabsContent value="link" className="space-y-4 mt-4">
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">
                    Where is your PDF hosted?
                  </label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Paste the public URL of your PDF. For GitHub Pages, use a
                    raw link like{" "}
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">
                      https://raw.githubusercontent.com/...
                    </code>
                  </p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="https://example.com/document.pdf"
                      value={pdfUrlInput}
                      onChange={(e) => setPdfUrlInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleGenerateLink();
                      }}
                    />
                    <Button
                      onClick={handleGenerateLink}
                      disabled={!pdfUrlInput.trim()}
                      size="sm"
                      className="shrink-0"
                    >
                      {isGeneratingLink ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Link2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>

                {shareLink && (
                  <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                    <label className="text-sm font-medium">Shareable link</label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 rounded-lg border bg-muted/50 px-3 py-2.5 text-xs font-mono truncate select-all">
                        {shareLink}
                      </div>
                      <Button
                        size="icon"
                        variant={copied ? "default" : "outline"}
                        onClick={handleCopyLink}
                        className="shrink-0 h-10 w-10"
                        title="Copy link"
                      >
                        {copied ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {copied && (
                      <p className="text-xs text-emerald-600">
                        ✓ Link copied to clipboard!
                      </p>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Tab 2: Download standalone HTML */}
            <TabsContent value="download" className="space-y-4 mt-4">
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-primary/10 p-2 mt-0.5">
                    <FileUp className="h-4 w-4 text-primary" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Self-contained HTML file</p>
                    <p className="text-xs text-muted-foreground">
                      Downloads a single HTML file with all pages embedded. Works
                      offline, can be hosted on GitHub Pages, shared via email,
                      or opened directly in any browser.
                    </p>
                  </div>
                </div>
                <Button
                  onClick={handleDownloadHTML}
                  disabled={isGeneratingHTML}
                  className="w-full"
                >
                  {isGeneratingHTML ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating HTML...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Download Flipbook HTML
                    </>
                  )}
                </Button>
                {isGeneratingHTML && (
                  <p className="text-xs text-muted-foreground text-center">
                    Embedding {pages.length} pages into the file...
                  </p>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <footer className="border-t bg-background/80 backdrop-blur-sm mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-10 flex items-center justify-between text-xs text-muted-foreground">
          <span>PDF to Flipbook Converter</span>
          <span>Works on GitHub Pages &middot; No server needed</span>
        </div>
      </footer>
    </div>
  );
}