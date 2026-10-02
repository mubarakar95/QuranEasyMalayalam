"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { TOTAL_PAGES } from "@/lib/types";
import { prefetchPage } from "@/lib/qcf4";

interface PageFlipBookProps {
  currentPage: number;
  twoPageMode: boolean;
  onPageChange: (page: number) => void;
  renderPage: (page: number) => React.ReactNode;
  className?: string;
}

const TOTAL_TURN_PAGES = 606; // Cover (1) + Quran 1..604 (2..605) + Back Cover (606)

function loadTurnScripts(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const w = window as any;
  if (w.$ && w.$.fn && w.$.fn.turn) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    function loadTurn() {
      if ((window as any).$ && (window as any).$.fn && (window as any).$.fn.turn) {
        resolve();
        return;
      }
      if (document.querySelector('script[src="/turn/turn.js"]')) {
        const interval = setInterval(() => {
          if ((window as any).$ && (window as any).$.fn && (window as any).$.fn.turn) {
            clearInterval(interval);
            resolve();
          }
        }, 30);
        return;
      }
      const sTurn = document.createElement("script");
      sTurn.src = "/turn/turn.js";
      sTurn.async = false;
      sTurn.onload = () => resolve();
      sTurn.onerror = (e) => reject(new Error("Failed to load /turn/turn.js"));
      document.body.appendChild(sTurn);
    }

    if (!(window as any).jQuery) {
      if (document.querySelector('script[src="/turn/jquery.js"]')) {
        const interval = setInterval(() => {
          if ((window as any).jQuery) {
            clearInterval(interval);
            loadTurn();
          }
        }, 30);
        return;
      }
      const sJquery = document.createElement("script");
      sJquery.src = "/turn/jquery.js";
      sJquery.async = false;
      sJquery.onload = () => loadTurn();
      sJquery.onerror = (e) => reject(new Error("Failed to load /turn/jquery.js"));
      document.body.appendChild(sJquery);
    } else {
      loadTurn();
    }
  });
}

export default function PageFlipBook({
  currentPage,
  twoPageMode,
  onPageChange,
  renderPage,
  className = "",
}: PageFlipBookProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const flipbookRef = useRef<HTMLDivElement | null>(null);
  const bookRef = useRef<any>(null);
  const slotMapRef = useRef<Map<number, HTMLDivElement>>(new Map());

  const [ready, setReady] = useState(false);
  const [activeWindow, setActiveWindow] = useState<number[]>(() => {
    const win: number[] = [];
    const minP = Math.max(1, currentPage - 4);
    const maxP = Math.min(TOTAL_PAGES, currentPage + 5);
    for (let p = minP; p <= maxP; p++) win.push(p);
    return win;
  });

  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;

  // Prefetch adjacent pages
  useEffect(() => {
    for (let p = Math.max(1, currentPage - 6); p <= Math.min(TOTAL_PAGES, currentPage + 6); p++) {
      prefetchPage(p);
    }
  }, [currentPage]);

  // Dimensions helper
  const computeDimensions = useCallback((isDouble: boolean) => {
    const containerW =
      containerRef.current?.clientWidth ||
      (typeof window !== "undefined" ? window.innerWidth : 1000);
    const windowH = typeof window !== "undefined" ? window.innerHeight : 800;
    const maxAvailableH = Math.max(380, Math.min(windowH - 120, 880));

    if (isDouble) {
      const spreadRatio = 1.2734; // Authentic Madani Mushaf spread ratio (2 * 652 / 1024)
      const maxSpreadW = Math.min(containerW - 24, 1150);
      let h = maxAvailableH;
      let w = Math.round(h * spreadRatio);
      if (w > maxSpreadW) {
        w = maxSpreadW;
        h = Math.round(w / spreadRatio);
      }
      return { width: w, height: h };
    } else {
      const singleRatio = 0.6367; // Authentic Madani single page ratio (652 / 1024)
      const maxSingleW = Math.min(containerW - 16, 580);
      let h = maxAvailableH;
      let w = Math.round(h * singleRatio);
      if (w > maxSingleW) {
        w = maxSingleW;
        h = Math.round(w / singleRatio);
      }
      return { width: w, height: h };
    }
  }, []);

  // Initialize Turn.js
  useEffect(() => {
    let cancelled = false;

    loadTurnScripts().then(() => {
      if (cancelled) return;
      const target = flipbookRef.current;
      if (!target) return;

      // Clear existing children
      target.innerHTML = "";
      slotMapRef.current.clear();

      // Create 606 page slots
      for (let i = 1; i <= TOTAL_TURN_PAGES; i++) {
        const slot = document.createElement("div");
        if (i === 1) {
          slot.className = "hard turn-hard-cover";
          slot.innerHTML = `
            <div class="turn-cover-ornament">
              <div class="turn-cover-title-ar">المصحف الشريف</div>
              <div class="turn-cover-title-en">Holy Quran</div>
              <div class="turn-cover-sub">Easy Malayalam</div>
            </div>
          `;
        } else if (i === TOTAL_TURN_PAGES) {
          slot.className = "hard turn-hard-cover";
          slot.innerHTML = `
            <div class="turn-cover-ornament">
              <div class="turn-cover-title-ar">صَدَقَ اللَّهُ العَظِيمُ</div>
              <div class="turn-cover-title-en">End of Quran</div>
            </div>
          `;
        } else {
          const isRight = i % 2 === 0;
          slot.className = `turn-page-slot ${isRight ? "quran-page-right" : "quran-page-left"}`;
        }
        slot.id = `quran-slot-${i}`;
        target.appendChild(slot);
        slotMapRef.current.set(i, slot);
      }

      const { width, height } = computeDimensions(twoPageMode);
      const $book = (window as any).$(target);
      bookRef.current = $book;

      $book.turn({
        width,
        height,
        autoCenter: true,
        elevation: 50,
        gradients: true,
        direction: "rtl",
        display: twoPageMode ? "double" : "single",
        duration: 380,
        acceleration: true,
      });

      // Navigate to current page
      const initialTurnPage = twoPageMode
        ? currentPage % 2 === 1
          ? currentPage + 1
          : currentPage
        : currentPage + 1;

      $book.turn("page", initialTurnPage);

      // Track drag state to disable hover/click interactions while moving
      $book.bind("start", () => {
        containerRef.current?.classList.add("is-page-flipping");
      });
      $book.bind("end", () => {
        containerRef.current?.classList.remove("is-page-flipping");
      });

      // turning event: Do NOT mutate activeWindow during active animation to preserve 60/120fps GPU performance
      $book.bind("turning", () => {
        // Zero React reconciliations during active drag/animation!
      });

      // turned event: Flip completed
      $book.bind("turned", (_event: any, page: number, view: number[]) => {
        containerRef.current?.classList.remove("is-page-flipping");
        const isDouble = $book.turn("display") === "double";
        let newQuranPage: number;
        if (isDouble && Array.isArray(view) && view.length > 0) {
          const validSlot = view.find((p) => p > 1 && p % 2 === 0) || (view[0] > 1 ? view[0] : 2);
          newQuranPage = validSlot - 1;
        } else {
          newQuranPage = page - 1;
        }

        const clampedQuranPage = Math.max(1, Math.min(TOTAL_PAGES, newQuranPage));
        onPageChangeRef.current(clampedQuranPage);

        // Defer portal window adjustment until after the browser finishes painting the settled spread:
        setTimeout(() => {
          setActiveWindow((prev) => {
            if (
              prev.length > 0 &&
              clampedQuranPage >= prev[0] + 2 &&
              clampedQuranPage <= prev[prev.length - 1] - 2
            ) {
              return prev;
            }
            const minP = Math.max(1, clampedQuranPage - 5);
            const maxP = Math.min(TOTAL_PAGES, clampedQuranPage + 6);
            if (prev[0] === minP && prev[prev.length - 1] === maxP) {
              return prev;
            }
            const win: number[] = [];
            for (let p = minP; p <= maxP; p++) win.push(p);
            return win;
          });
        }, 150);
      });

      setReady(true);
    });

    return () => {
      cancelled = true;
      if (bookRef.current) {
        try {
          bookRef.current.turn("destroy");
        } catch (_) {}
        bookRef.current = null;
      }
    };
  }, []);

  // Sync twoPageMode prop changes
  useEffect(() => {
    if (!ready || !bookRef.current) return;
    const $book = bookRef.current;
    const targetDisplay = twoPageMode ? "double" : "single";
    if ($book.turn("display") !== targetDisplay) {
      const { width, height } = computeDimensions(twoPageMode);
      $book.turn("display", targetDisplay);
      $book.turn("size", width, height);

      const targetTurnPage = twoPageMode
        ? currentPage % 2 === 1
          ? currentPage + 1
          : currentPage
        : currentPage + 1;

      $book.turn("page", targetTurnPage);
    }
  }, [twoPageMode, ready, currentPage, computeDimensions]);

  // Sync external currentPage changes (e.g. audio player, surah jump, keyboard arrows)
  useEffect(() => {
    if (!ready || !bookRef.current) return;

    const targetTurnPage = twoPageMode
      ? currentPage % 2 === 1
        ? currentPage + 1
        : currentPage
      : currentPage + 1;

    const currentView: number[] = bookRef.current.turn("view") || [];
    const isAlreadyOnPage = twoPageMode
      ? currentView.includes(targetTurnPage)
      : bookRef.current.turn("page") === targetTurnPage;

    if (!isAlreadyOnPage) {
      if (bookRef.current.turn("animating")) {
        try {
          bookRef.current.turn("stop");
        } catch (_) {}
      }
      try {
        bookRef.current.turn("page", targetTurnPage);
      } catch (_) {}
    }

    // Ensure window includes current spread with generous buffer and hysteresis
    setActiveWindow((prev) => {
      if (
        prev.length > 0 &&
        currentPage >= prev[0] + 2 &&
        currentPage <= prev[prev.length - 1] - 2
      ) {
        return prev;
      }
      const minP = Math.max(1, currentPage - 5);
      const maxP = Math.min(TOTAL_PAGES, currentPage + 6);
      if (prev[0] === minP && prev[prev.length - 1] === maxP) return prev;
      const win: number[] = [];
      for (let p = minP; p <= maxP; p++) win.push(p);
      return win;
    });
  }, [currentPage, ready, twoPageMode]);

  // Responsive resize
  useEffect(() => {
    if (!ready || !bookRef.current) return;
    const container = containerRef.current;
    if (!container) return;

    let resizeTimer: any = null;
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!bookRef.current) return;
        const { width, height } = computeDimensions(twoPageMode);
        const curSize = bookRef.current.turn("size");
        if (
          Math.abs(curSize.width - width) > 4 ||
          Math.abs(curSize.height - height) > 4
        ) {
          bookRef.current.turn("size", width, height);
        }
      }, 100);
    });

    ro.observe(container);
    return () => {
      clearTimeout(resizeTimer);
      ro.disconnect();
    };
  }, [ready, twoPageMode, computeDimensions]);

  // Prevent drag interaction when tapping words or interactive controls
  const handleCaptureInteraction = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest?.(".mushaf-word, .madani-ayah-marker, button, a, input, select")) {
      e.stopPropagation();
    }
  }, []);

  // Render React portals into active slots
  const portals: React.ReactNode[] = [];
  if (ready) {
    for (const qp of activeWindow) {
      const turnSlotIdx = qp + 1;
      const slotEl = slotMapRef.current.get(turnSlotIdx);
      if (slotEl) {
        portals.push(
          createPortal(
            <div key={`portal-${qp}`} className="h-full w-full">
              {renderPage(qp)}
            </div>,
            slotEl
          )
        );
      }
    }
  }

  return (
    <div
      ref={containerRef}
      className={`quran-flipbook-wrapper relative ${
        twoPageMode ? "flipbook-stage-spread" : "flipbook-stage-single"
      } ${className}`}
      onPointerDownCapture={handleCaptureInteraction}
    >
      <div ref={flipbookRef} id="quran-flipbook" />
      {portals}
    </div>
  );
}
