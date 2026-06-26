"use client";

import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from "react";
import {
  useMotionValue,
  useSpring,
  animate,
  type MotionValue,
} from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RotateCcw,
  ChevronsLeft,
  ChevronsRight,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { PDFPageImage } from "@/lib/pdf-renderer";

/* ============================================================
   CONSTANTS
   ============================================================ */

const PAGE_W = 420;
const PAGE_H = 595;
const NUM_STRIPS = 18;
const CURL_SHARPNESS = 8;
const SPRING_STIFFNESS = 70;
const SPRING_DAMPING = 16;
const FLIP_THRESHOLD = 0.25;

/* ============================================================
   TYPES
   ============================================================ */

interface FlipBookProps {
  pages: PDFPageImage[];
  fileName?: string;
  onBack: () => void;
  onShare?: () => void;
}

interface SpreadPages {
  left: PDFPageImage | null;
  right: PDFPageImage | null;
}

/* ============================================================
   HELPERS
   ============================================================ */

/** Hermite smoothstep — gives a natural S-curve transition */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/* ============================================================
   HOOK — useDragFlip
   ============================================================ */

function useDragFlip(pageWidth: number) {
  const progress = useMotionValue(0);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const direction = useRef<"forward" | "backward">("forward");

  const spring = useSpring(progress, {
    stiffness: SPRING_STIFFNESS,
    damping: SPRING_DAMPING,
  });

  const startDrag = useCallback(
    (clientX: number, dir: "forward" | "backward") => {
      isDragging.current = true;
      direction.current = dir;
      startX.current = clientX;
      spring.set(0);
      progress.set(0);
    },
    [spring, progress]
  );

  const moveDrag = useCallback(
    (clientX: number) => {
      if (!isDragging.current) return;
      const delta = startX.current - clientX;
      const raw = Math.abs(delta) / pageWidth;
      const clamped = Math.max(0, Math.min(1, raw));
      progress.set(clamped);
    },
    [pageWidth, progress]
  );

  const endDrag = useCallback(
    (onCommit: () => void, onCancel: () => void) => {
      if (!isDragging.current) return;
      isDragging.current = false;
      const current = progress.get();
      if (current > FLIP_THRESHOLD) {
        return animate(progress, 1, {
          type: "spring",
          stiffness: SPRING_STIFFNESS,
          damping: SPRING_DAMPING,
          onComplete: onCommit,
        });
      } else {
        return animate(progress, 0, {
          type: "spring",
          stiffness: SPRING_STIFFNESS * 1.5,
          damping: SPRING_DAMPING * 1.2,
          onComplete: onCancel,
        });
      }
    },
    [progress]
  );

  const animateFlip = useCallback(
    (onComplete: () => void) => {
      progress.set(0);
      return animate(progress, 1, {
        type: "spring",
        stiffness: SPRING_STIFFNESS * 0.65,
        damping: SPRING_DAMPING * 0.85,
        onComplete,
      });
    },
    [progress]
  );

  return {
    progress,
    spring,
    isDragging,
    direction,
    startDrag,
    moveDrag,
    endDrag,
    animateFlip,
  };
}

/* ============================================================
   COMPONENT — CurledPage
   Segmented page-curl with cumulative 3D positioning.
   Each vertical strip rotates independently, creating a
   smooth paper-like bend instead of a rigid board rotation.
   ============================================================ */

function CurledPage({
  frontPage,
  backPage,
  flipSpring,
  isForward,
  shadowRef,
  highlightRef,
  edgeRef,
  dropRef,
}: {
  frontPage: PDFPageImage | null;
  backPage: PDFPageImage | null;
  flipSpring: MotionValue<number>;
  isForward: boolean;
  shadowRef: React.RefObject<HTMLDivElement | null>;
  highlightRef: React.RefObject<HTMLDivElement | null>;
  edgeRef: React.RefObject<HTMLDivElement | null>;
  dropRef: React.RefObject<HTMLDivElement | null>;
}) {
  const stripRefs = useRef<(HTMLDivElement | null)[]>([]);
  const N = NUM_STRIPS;
  const pxStripW = PAGE_W / N;

  useEffect(() => {
    const update = (t: number) => {
      let cumX: number, cumZ: number;
      let curlX = 0;
      let maxCurv = 0;
      const intensity = Math.sin(t * Math.PI);
      const lift = intensity * -2;

      // Process strips in the appropriate order
      // Forward: spine→edge (i=0→N-1), origin at left edge of each strip
      // Backward: edge→spine (i=N-1→0), origin at right edge of each strip
      if (isForward) {
        cumX = 0;
        cumZ = 0;

        for (let i = 0; i < N; i++) {
          const el = stripRefs.current[i];
          if (!el) continue;

          const x = i / N;
          // Curl sweeps from edge (x=1) to spine (x=0) as t goes 0→1
          const sweepParam = 1 - x;
          const normalized = (t * 1.4 - sweepParam) / 0.5;
          const angle = smoothstep(0, 1, normalized) * 180;
          const angleRad = (angle * Math.PI) / 180;

          // Track curl position (where curvature is highest)
          const d = Math.abs(normalized);
          const curv = d < 1 ? 6 * d * (1 - d) : 0; // derivative of smoothstep
          if (curv > maxCurv) {
            maxCurv = curv;
            curlX = cumX + pxStripW * 0.5;
          }

          el.style.transform = `translate3d(${cumX}px, ${lift}px, ${cumZ}px) rotateY(${-angle}deg)`;

          // Cumulative: next strip's left edge = this strip's right edge
          cumX += pxStripW * Math.cos(angleRad);
          cumZ += pxStripW * Math.sin(angleRad);
        }
      } else {
        // BACKWARD: process from spine (right) to edge (left)
        cumX = PAGE_W;
        cumZ = 0;

        for (let i = N - 1; i >= 0; i--) {
          const el = stripRefs.current[i];
          if (!el) continue;

          const x = i / N;
          // Curl sweeps from left edge (x=0) to spine (x=1) as t goes 0→1
          const sweepParam = x;
          const normalized = (t * 1.4 - sweepParam) / 0.5;
          const angle = smoothstep(0, 1, normalized) * 180;
          const angleRad = (angle * Math.PI) / 180;

          const d = Math.abs(normalized);
          const curv = d < 1 ? 6 * d * (1 - d) : 0;
          if (curv > maxCurv) {
            maxCurv = curv;
            curlX = cumX - pxStripW * 0.5;
          }

          // Position so right edge is at (cumX, cumZ)
          // With transform-origin: 100% 50%
          el.style.transform = `translate3d(${cumX - pxStripW}px, ${lift}px, ${cumZ}px) rotateY(${angle}deg)`;

          // Cumulative: next strip (to the left) connects here
          cumX -= pxStripW * Math.cos(angleRad);
          cumZ += pxStripW * Math.sin(angleRad);
        }
      }

      // ── Update shadow / highlight / edge overlays ──
      if (shadowRef.current) {
        const shadowW = 50 + intensity * 30;
        shadowRef.current.style.opacity = String(intensity * 0.55);
        shadowRef.current.style.width = `${shadowW}px`;
        shadowRef.current.style.transform = isForward
          ? `translateX(${curlX - shadowW * 0.3}px)`
          : `translateX(${curlX - shadowW * 0.7}px)`;
      }
      if (highlightRef.current) {
        const hlW = 25 + intensity * 20;
        highlightRef.current.style.opacity = String(intensity * 0.2);
        highlightRef.current.style.width = `${hlW}px`;
        highlightRef.current.style.transform = isForward
          ? `translateX(${curlX - hlW * 0.6}px)`
          : `translateX(${curlX - hlW * 0.4}px)`;
      }
      if (edgeRef.current) {
        edgeRef.current.style.opacity = String(intensity * 0.7);
        edgeRef.current.style.transform = `translateX(${curlX - 1.5}px)`;
      }
      if (dropRef.current) {
        dropRef.current.style.opacity = String(intensity * 0.25);
        dropRef.current.style.transform = `translateX(${curlX - 30}px) translateY(3px)`;
      }
    };

    const unsub = flipSpring.on("change", update);
    update(flipSpring.get());
    return unsub;
  }, [flipSpring, isForward, shadowRef, highlightRef, edgeRef, dropRef]);

  const originX = isForward ? "0%" : "100%";

  return (
    <div
      className="absolute top-0 pointer-events-none"
      style={{
        left: isForward ? "50%" : "0",
        width: "50%",
        height: PAGE_H,
        maxWidth: "45vw",
        perspective: "2800px",
        zIndex: 60,
      }}
    >
      {/* 3D strip container */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transformStyle: "preserve-3d",
        }}
      >
        {Array.from({ length: N }, (_, i) => (
          <div
            key={i}
            ref={(el) => {
              stripRefs.current[i] = el;
            }}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: `${100 / N + 0.4}%`, // slight overlap to prevent seams
              height: "100%",
              transformOrigin: `${originX} 50%`,
              transformStyle: "preserve-3d",
              willChange: "transform",
            }}
          >
            {/* ─── Front face ─── */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  width: `${PAGE_W}px`,
                  left: `${-i * pxStripW}px`,
                  backgroundImage: frontPage
                    ? `url(${frontPage.dataUrl})`
                    : undefined,
                  backgroundSize: `${PAGE_W}px ${PAGE_H}px`,
                  backgroundRepeat: "no-repeat",
                }}
              />
            </div>

            {/* ─── Back face ─── */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
                transform: "rotateY(180deg)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  width: `${PAGE_W}px`,
                  // Show mirrored portion: strip i shows back image portion (N-1-i)
                  left: `${-(N - 1 - i) * pxStripW}px`,
                  backgroundImage: backPage
                    ? `url(${backPage.dataUrl})`
                    : undefined,
                  backgroundSize: `${PAGE_W}px ${PAGE_H}px`,
                  backgroundRepeat: "no-repeat",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   COMPONENT — PageImage
   ============================================================ */

function PageImage({
  page,
  alt,
  className,
}: {
  page: PDFPageImage | null;
  alt: string;
  className?: string;
}) {
  if (!page) {
    return (
      <div
        className={cn(
          "w-full h-full bg-gradient-to-br from-stone-100 to-stone-200/80 flex items-center justify-center",
          className
        )}
      >
        <span className="text-stone-400 text-xs select-none">blank</span>
      </div>
    );
  }
  return (
    <img
      src={page.dataUrl}
      alt={alt}
      className={cn("w-full h-full object-contain select-none", className)}
      draggable={false}
    />
  );
}

/* ============================================================
   COMPONENT — BookIcon
   ============================================================ */

function BookIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-stone-300"
    >
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
    </svg>
  );
}

/* ============================================================
   MAIN FLIPBOOK COMPONENT
   ============================================================ */

export function FlipBook({ pages, fileName, onBack, onShare }: FlipBookProps) {
  const [currentSpread, setCurrentSpread] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const animControlsRef = useRef<ReturnType<typeof animate> | null>(null);

  // Shadow overlay refs (one set per direction)
  const fwdShadowRef = useRef<HTMLDivElement>(null);
  const fwdHighlightRef = useRef<HTMLDivElement>(null);
  const fwdEdgeRef = useRef<HTMLDivElement>(null);
  const fwdDropRef = useRef<HTMLDivElement>(null);

  const bwdShadowRef = useRef<HTMLDivElement>(null);
  const bwdHighlightRef = useRef<HTMLDivElement>(null);
  const bwdEdgeRef = useRef<HTMLDivElement>(null);
  const bwdDropRef = useRef<HTMLDivElement>(null);

  const totalSpreads = useMemo(
    () => Math.ceil(pages.length / 2),
    [pages.length]
  );

  const getSpread = useCallback(
    (s: number): SpreadPages => ({
      left: s * 2 < pages.length ? pages[s * 2] : null,
      right: s * 2 + 1 < pages.length ? pages[s * 2 + 1] : null,
    }),
    [pages]
  );

  const current = useMemo(
    () => getSpread(currentSpread),
    [currentSpread, getSpread]
  );
  const nextSpread = useMemo(
    () => getSpread(currentSpread + 1),
    [currentSpread, getSpread]
  );
  const prevSpread = useMemo(
    () => getSpread(currentSpread - 1),
    [currentSpread, getSpread]
  );

  /* ---- drag hooks ---- */
  const fwd = useDragFlip(PAGE_W);
  const bwd = useDragFlip(PAGE_W);

  const [activeFlip, setActiveFlip] = useState<"forward" | "backward" | null>(
    null
  );

  /* ---- flip commit / cancel ---- */
  const commitFlip = useCallback(
    (dir: "forward" | "backward") => {
      if (dir === "forward") {
        setCurrentSpread((s) => Math.min(s + 1, totalSpreads - 1));
      } else {
        setCurrentSpread((s) => Math.max(s - 1, 0));
      }
      setActiveFlip(null);
      setIsAnimating(false);
      setTimeout(() => {
        if (dir === "forward") fwd.progress.set(0);
        else bwd.progress.set(0);
      }, 50);
    },
    [totalSpreads, fwd.progress, bwd.progress]
  );

  const cancelFlip = useCallback(() => {
    setActiveFlip(null);
    setIsAnimating(false);
  }, []);

  /* ---- programmatic flip (buttons / keyboard) ---- */
  const goNext = useCallback(() => {
    if (isAnimating || currentSpread >= totalSpreads - 1) return;
    setIsAnimating(true);
    setActiveFlip("forward");
    animControlsRef.current = fwd.animateFlip(() => commitFlip("forward"));
  }, [isAnimating, currentSpread, totalSpreads, fwd, commitFlip]);

  const goPrev = useCallback(() => {
    if (isAnimating || currentSpread <= 0) return;
    setIsAnimating(true);
    setActiveFlip("backward");
    animControlsRef.current = bwd.animateFlip(() => commitFlip("backward"));
  }, [isAnimating, currentSpread, bwd, commitFlip]);

  /* ---- pointer (drag) events ---- */
  const onPointerDown = useCallback(
    (e: React.PointerEvent, dir: "forward" | "backward") => {
      if (isAnimating) return;
      if (dir === "forward" && currentSpread >= totalSpreads - 1) return;
      if (dir === "backward" && currentSpread <= 0) return;

      setIsAnimating(true);
      setActiveFlip(dir);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      if (dir === "forward") fwd.startDrag(e.clientX, "forward");
      else bwd.startDrag(e.clientX, "backward");
    },
    [isAnimating, currentSpread, totalSpreads, fwd, bwd]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!activeFlip) return;
      if (activeFlip === "forward") fwd.moveDrag(e.clientX);
      else bwd.moveDrag(e.clientX);
    },
    [fwd, bwd, activeFlip]
  );

  const onPointerUp = useCallback(() => {
    if (!activeFlip) return;
    if (activeFlip === "forward") {
      animControlsRef.current = fwd.endDrag(
        () => commitFlip("forward"),
        cancelFlip
      );
    } else {
      animControlsRef.current = bwd.endDrag(
        () => commitFlip("backward"),
        cancelFlip
      );
    }
  }, [fwd, bwd, commitFlip, cancelFlip, activeFlip]);

  /* ---- keyboard ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "Home") {
        e.preventDefault();
        if (currentSpread > 0) goPrev();
      } else if (e.key === "End") {
        e.preventDefault();
        if (currentSpread < totalSpreads - 1) goNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, currentSpread, totalSpreads]);

  /* ---- touch swipe (fallback) ---- */
  const touchX = useRef<number | null>(null);
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchX.current = e.touches[0].clientX;
  }, []);
  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchX.current === null) return;
      const diff = touchX.current - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 50) {
        if (diff > 0) goNext();
        else goPrev();
      }
      touchX.current = null;
    },
    [goNext, goPrev]
  );

  /* ---- fullscreen ---- */
  const toggleFs = useCallback(async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      /* noop */
    }
  }, []);
  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  /* ---- zoom ---- */
  const onWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom((z) => Math.min(Math.max(z - e.deltaY * 0.002, 0.4), 2.5));
    }
  }, []);

  /* ---- derived ---- */
  const leftPageNum = currentSpread * 2 + 1;
  const rightPageNum = currentSpread * 2 + 2;
  const canGoPrev = currentSpread > 0 && !isAnimating;
  const canGoNext = currentSpread < totalSpreads - 1 && !isAnimating;
  const isForwardFlip = activeFlip === "forward";
  const isBackwardFlip = activeFlip === "backward";

  return (
    <div
      ref={containerRef}
      className="w-full flex flex-col items-center gap-3 select-none"
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 w-full max-w-5xl">
        <Button
          variant="outline"
          size="sm"
          onClick={onBack}
          className="gap-1.5"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">New PDF</span>
        </Button>

        {/* Share button */}
        {onShare && (
          <Button
            variant="outline"
            size="sm"
            onClick={onShare}
            className="gap-1.5"
          >
            <Share2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Share</span>
          </Button>
        )}

        <div className="flex-1" />

        {/* Zoom controls */}
        <div className="flex items-center gap-1 bg-muted/60 rounded-lg px-2.5 py-1.5 backdrop-blur-sm">
          <ZoomOut className="h-3.5 w-3.5 text-muted-foreground" />
          <Slider
            value={[zoom * 100]}
            min={40}
            max={250}
            step={5}
            onValueChange={([v]) => setZoom(v / 100)}
            className="w-20 h-1"
          />
          <ZoomIn className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground w-8 text-right tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setZoom(1)}
          title="Reset zoom"
          className="h-8 w-8"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleFs}
          title="Fullscreen"
          className="h-8 w-8"
        >
          {isFullscreen ? (
            <Minimize2 className="h-3.5 w-3.5" />
          ) : (
            <Maximize2 className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {/* ── Book ── */}
      <div
        className="relative w-full flex items-center justify-center overflow-visible py-4"
        style={{ perspective: "2800px" }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Book surface shadow */}
        <div
          className="absolute rounded-lg pointer-events-none"
          style={{
            width: PAGE_W * 2 + 40,
            height: PAGE_H + 30,
            top: 15,
            left: "50%",
            transform: `translateX(-50%) scale(${zoom})`,
            background:
              "radial-gradient(ellipse at center, rgba(0,0,0,0.15) 0%, transparent 70%)",
            filter: "blur(20px)",
          }}
        />

        <div
          className="relative flex rounded-sm overflow-visible"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "center center",
            boxShadow:
              "0 25px 60px -15px rgba(0,0,0,0.2), 0 10px 25px -10px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)",
          }}
        >
          {/* ═══════════════════════════════════════════
              LEFT PAGE
              ═══════════════════════════════════════════ */}
          <div
            className="relative bg-white overflow-hidden cursor-pointer"
            style={{
              width: PAGE_W,
              height: PAGE_H,
              maxWidth: "45vw",
              aspectRatio: `${PAGE_W} / ${PAGE_H}`,
              borderTopLeftRadius: 3,
              borderBottomLeftRadius: 3,
            }}
            onPointerDown={(e) => onPointerDown(e, "backward")}
          >
            {/* Static left page */}
            {!isBackwardFlip && (
              <PageImage page={current.left} alt={`Page ${leftPageNum}`} />
            )}

            {/* Prev left revealed during backward flip */}
            {isBackwardFlip && (
              <div className="absolute inset-0">
                <PageImage
                  page={prevSpread.left}
                  alt={`Page ${leftPageNum - 2}`}
                />
              </div>
            )}

            {/* No-page placeholder */}
            {!current.left && !isBackwardFlip && (
              <div className="absolute inset-0 bg-gradient-to-br from-stone-50 to-stone-100 flex flex-col items-center justify-center gap-2">
                <BookIcon />
                <span className="text-stone-400 text-xs">Cover</span>
              </div>
            )}

            {/* Hover indicator */}
            {canGoPrev && !isAnimating && (
              <div className="absolute inset-y-0 left-0 w-14 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-200 bg-gradient-to-r from-black/[0.06] to-transparent pointer-events-none">
                <ChevronLeft className="h-5 w-5 text-stone-500" />
              </div>
            )}

            {/* Spine shadow (right edge) */}
            <div className="absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-black/[0.12] to-transparent pointer-events-none z-20" />

            {/* Backward curl drop shadow overlay */}
            {isBackwardFlip && (
              <div
                ref={bwdDropRef}
                className="absolute top-2 bottom-2 pointer-events-none z-10"
                style={{
                  width: 60,
                  left: 0,
                  background: "rgba(0,0,0,0.3)",
                  filter: "blur(18px)",
                  opacity: 0,
                }}
              />
            )}
            {/* Backward curl inner shadow */}
            {isBackwardFlip && (
              <div
                ref={bwdShadowRef}
                className="absolute top-0 bottom-0 pointer-events-none z-30"
                style={{
                  width: 50,
                  left: 0,
                  opacity: 0,
                  background:
                    "linear-gradient(to right, rgba(0,0,0,0.45), transparent)",
                }}
              />
            )}
            {/* Backward curl highlight */}
            {isBackwardFlip && (
              <div
                ref={bwdHighlightRef}
                className="absolute top-0 bottom-0 pointer-events-none z-30"
                style={{
                  width: 30,
                  left: 0,
                  opacity: 0,
                  background:
                    "linear-gradient(to left, rgba(255,255,255,0.12), transparent)",
                }}
              />
            )}
            {/* Backward curl edge line */}
            {isBackwardFlip && (
              <div
                ref={bwdEdgeRef}
                className="absolute top-1 bottom-1 pointer-events-none z-30"
                style={{
                  width: 3,
                  left: 0,
                  opacity: 0,
                  borderRadius: 1.5,
                  background:
                    "linear-gradient(to bottom, transparent 5%, #e8e4de 15%, #d6d0c6 50%, #e8e4de 85%, transparent 95%)",
                }}
              />
            )}
          </div>

          {/* ═══ SPINE ═══ */}
          <div
            className="relative z-30 flex-shrink-0"
            style={{
              width: 6,
              height: PAGE_H,
              maxWidth: "1vw",
              background:
                "linear-gradient(to right, #d4cfc6, #c8c2b6, #d4cfc6)",
              boxShadow:
                "inset 1px 0 3px rgba(0,0,0,0.15), inset -1px 0 3px rgba(0,0,0,0.1)",
            }}
          />

          {/* ═══════════════════════════════════════════
              RIGHT PAGE
              ═══════════════════════════════════════════ */}
          <div
            className="relative bg-white overflow-hidden cursor-pointer"
            style={{
              width: PAGE_W,
              height: PAGE_H,
              maxWidth: "45vw",
              aspectRatio: `${PAGE_W} / ${PAGE_H}`,
              borderTopRightRadius: 3,
              borderBottomRightRadius: 3,
            }}
            onPointerDown={(e) => onPointerDown(e, "forward")}
          >
            {/* Static right page */}
            {!isForwardFlip && (
              <PageImage
                page={current.right}
                alt={`Page ${rightPageNum}`}
              />
            )}

            {/* Next right revealed during forward flip */}
            {isForwardFlip && (
              <div className="absolute inset-0">
                <PageImage
                  page={nextSpread.right}
                  alt={`Page ${rightPageNum + 2}`}
                />
              </div>
            )}

            {/* No-page placeholder */}
            {!current.right && !isForwardFlip && (
              <div className="absolute inset-0 bg-gradient-to-bl from-stone-50 to-stone-100 flex flex-col items-center justify-center gap-2">
                <BookIcon />
                <span className="text-stone-400 text-xs">End</span>
              </div>
            )}

            {/* Hover indicator */}
            {canGoNext && !isAnimating && (
              <div className="absolute inset-y-0 right-0 w-14 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-200 bg-gradient-to-l from-black/[0.06] to-transparent pointer-events-none">
                <ChevronRight className="h-5 w-5 text-stone-500" />
              </div>
            )}

            {/* Spine shadow (left edge) */}
            <div className="absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-black/[0.08] to-transparent pointer-events-none z-20" />

            {/* Page stack edge (right side) */}
            <div
              className="absolute top-1 right-0 bottom-1 w-[3px] pointer-events-none z-20"
              style={{
                background:
                  "linear-gradient(to bottom, transparent, #e8e4de 10%, #ddd8d0 50%, #e8e4de 90%, transparent)",
                borderRadius: 1,
              }}
            />

            {/* Forward curl drop shadow overlay */}
            {isForwardFlip && (
              <div
                ref={fwdDropRef}
                className="absolute top-2 bottom-2 pointer-events-none z-10"
                style={{
                  width: 60,
                  right: 0,
                  background: "rgba(0,0,0,0.3)",
                  filter: "blur(18px)",
                  opacity: 0,
                }}
              />
            )}
            {/* Forward curl inner shadow */}
            {isForwardFlip && (
              <div
                ref={fwdShadowRef}
                className="absolute top-0 bottom-0 pointer-events-none z-30"
                style={{
                  width: 50,
                  right: 0,
                  opacity: 0,
                  background:
                    "linear-gradient(to left, rgba(0,0,0,0.45), transparent)",
                }}
              />
            )}
            {/* Forward curl highlight */}
            {isForwardFlip && (
              <div
                ref={fwdHighlightRef}
                className="absolute top-0 bottom-0 pointer-events-none z-30"
                style={{
                  width: 30,
                  right: 0,
                  opacity: 0,
                  background:
                    "linear-gradient(to right, rgba(255,255,255,0.12), transparent)",
                }}
              />
            )}
            {/* Forward curl edge line */}
            {isForwardFlip && (
              <div
                ref={fwdEdgeRef}
                className="absolute top-1 bottom-1 pointer-events-none z-30"
                style={{
                  width: 3,
                  right: 0,
                  opacity: 0,
                  borderRadius: 1.5,
                  background:
                    "linear-gradient(to bottom, transparent 5%, #e8e4de 15%, #d6d0c6 50%, #e8e4de 85%, transparent 95%)",
                }}
              />
            )}
          </div>

          {/* ═══ FLIP ANIMATIONS ═══ */}
          {isForwardFlip && (
            <CurledPage
              frontPage={current.right}
              backPage={nextSpread.left}
              flipSpring={fwd.spring}
              isForward
              shadowRef={fwdShadowRef}
              highlightRef={fwdHighlightRef}
              edgeRef={fwdEdgeRef}
              dropRef={fwdDropRef}
            />
          )}
          {isBackwardFlip && (
            <CurledPage
              frontPage={current.left}
              backPage={prevSpread.right}
              flipSpring={bwd.spring}
              isForward={false}
              shadowRef={bwdShadowRef}
              highlightRef={bwdHighlightRef}
              edgeRef={bwdEdgeRef}
              dropRef={bwdDropRef}
            />
          )}
        </div>
      </div>

      {/* ── Navigation Bar ── */}
      <div className="flex items-center gap-3 w-full max-w-5xl justify-center">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCurrentSpread(0)}
          disabled={currentSpread === 0 || isAnimating}
          title="First page"
          className="h-8 w-8"
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>

        <Button
          variant="outline"
          size="lg"
          onClick={goPrev}
          disabled={!canGoPrev}
          className="gap-1.5 rounded-full px-5"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline text-sm">Prev</span>
        </Button>

        {/* Page indicator */}
        <div className="flex items-center gap-1.5 min-w-[140px] justify-center">
          <span className="text-sm font-semibold tabular-nums">
            {leftPageNum}
            {current.right ? (
              <span className="text-muted-foreground font-normal mx-0.5">
                –
              </span>
            ) : null}
            {current.right ? <span>{rightPageNum}</span> : null}
          </span>
          <span className="text-muted-foreground text-sm">
            / {pages.length}
          </span>
        </div>

        <Button
          variant="outline"
          size="lg"
          onClick={goNext}
          disabled={!canGoNext}
          className="gap-1.5 rounded-full px-5"
        >
          <span className="hidden sm:inline text-sm">Next</span>
          <ChevronRight className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCurrentSpread(totalSpreads - 1)}
          disabled={currentSpread === totalSpreads - 1 || isAnimating}
          title="Last page"
          className="h-8 w-8"
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Hints */}
      <p className="text-[11px] text-muted-foreground/70 text-center">
        <span className="inline-flex items-center gap-1">
          <kbd className="px-1 py-0.5 rounded bg-muted/80 text-[10px] font-mono">
            ←
          </kbd>
          <kbd className="px-1 py-0.5 rounded bg-muted/80 text-[10px] font-mono">
            →
          </kbd>
          flip
        </span>
        <span className="mx-1.5">·</span>
        <span>drag pages to curl</span>
        <span className="mx-1.5">·</span>
        <span className="inline-flex items-center gap-1">
          <kbd className="px-1 py-0.5 rounded bg-muted/80 text-[10px] font-mono">
            Ctrl
          </kbd>
          +scroll zoom
        </span>
      </p>
    </div>
  );
}