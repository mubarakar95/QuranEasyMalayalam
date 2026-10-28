"use client";

import { useState, useEffect } from "react";

interface ShortcutLegendProps {
  audioVisible?: boolean;
}

export default function ShortcutLegend({ audioVisible = true }: ShortcutLegendProps) {
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const saved = localStorage.getItem("quran-shortcut-legend-open");
      if (saved !== null) return saved === "true";
    } catch {}
    return true;
  });
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [bottomOffset, setBottomOffset] = useState<number>(() => audioVisible ? 106 : 64);

  useEffect(() => {
    const updateOffset = () => {
      if (audioVisible) {
        const playerEl = document.querySelector(".mobile-player") || document.querySelector(".audio-player");
        if (playerEl) {
          const rect = playerEl.getBoundingClientRect();
          if (rect.height > 0) {
            setBottomOffset(Math.round(rect.height + 16));
            return;
          }
        }
        setBottomOffset(106);
      } else {
        const bottomBar = document.querySelector(".bottom-bar");
        if (bottomBar) {
          const rect = bottomBar.getBoundingClientRect();
          if (rect.height > 0) {
            setBottomOffset(Math.round(rect.height + 16));
            return;
          }
        }
        setBottomOffset(64);
      }
    };

    updateOffset();
    const timer = setTimeout(updateOffset, 150);

    const playerEl = document.querySelector(".mobile-player");
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && playerEl) {
      ro = new ResizeObserver(() => updateOffset());
      ro.observe(playerEl);
    }

    window.addEventListener("resize", updateOffset);
    return () => {
      clearTimeout(timer);
      if (ro) ro.disconnect();
      window.removeEventListener("resize", updateOffset);
    };
  }, [audioVisible]);

  const handleToggle = () => {
    setIsOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("quran-shortcut-legend-open", String(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      let keyId: string | null = null;
      if (e.code === "Space") keyId = "space";
      else if (e.key === "ArrowUp") keyId = "arrowup";
      else if (e.key === "ArrowDown") keyId = "arrowdown";
      else if (e.key === "ArrowLeft") keyId = "arrowleft";
      else if (e.key === "ArrowRight") keyId = "arrowright";
      else if (e.key.toLowerCase() === "w") keyId = "w";
      else if (e.key.toLowerCase() === "s") keyId = "s";
      else if (e.key.toLowerCase() === "r") keyId = "r";
      else if (e.key.toLowerCase() === "p") keyId = "p";
      else if (e.key.toLowerCase() === "e") keyId = "e";

      if (keyId) {
        setActiveKey(keyId);
        const timer = setTimeout(() => setActiveKey(null), 200);
        return () => clearTimeout(timer);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const kbdClass = (keyId: string) =>
    `inline-flex items-center justify-center min-w-[1.25rem] px-1.5 py-0.5 rounded text-[10px] font-mono font-medium shadow-xs border transition-all duration-150 ${
      activeKey === keyId
        ? "bg-emerald-500 text-white border-emerald-500 scale-105 shadow-sm"
        : "bg-[var(--background)] border-[var(--border)] text-[var(--foreground)]"
    }`;

  return (
    <aside
      aria-label="Keyboard Shortcuts Legend"
      className="hidden md:block fixed left-4 z-20 pointer-events-auto transition-all duration-200 select-none"
      style={{
        bottom: `${bottomOffset}px`,
      }}
    >
      {isOpen ? (
        <div className="w-56 rounded-xl bg-[var(--surface)]/95 backdrop-blur-md border border-[var(--border)] shadow-lg p-3 text-xs">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--border)]/70">
            <div className="flex items-center gap-1.5 font-semibold text-[11px] text-[var(--foreground)]">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h12A2.25 2.25 0 0 1 20.25 6v12A2.25 2.25 0 0 1 18 20.25H6A2.25 2.25 0 0 1 3.75 18V6ZM6.75 7.5v1.5m0 3v1.5m0 3v1.5m3.75-9v1.5m0 3v1.5m0 3v1.5m3.75-9v1.5m0 3v1.5m0 3v1.5m3.75-9v1.5m0 3v1.5m0 3v1.5" />
              </svg>
              <span>Shortcuts</span>
            </div>
            <button
              onClick={handleToggle}
              className="p-0.5 rounded text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--background)] transition-colors cursor-pointer"
              title="Minimize shortcuts legend"
              aria-label="Minimize shortcuts legend"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
              </svg>
            </button>
          </div>

          <div className="space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-[var(--muted)]">Play / Pause</span>
              <kbd className={kbdClass("space")}>Space</kbd>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--muted)]">Arabic Ayah</span>
              <div className="flex items-center gap-1">
                <kbd className={kbdClass("w")}>W</kbd>
                <kbd className={kbdClass("s")}>S</kbd>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--muted)]">Malayalam Ayah</span>
              <div className="flex items-center gap-1">
                <kbd className={kbdClass("arrowup")}>↑</kbd>
                <kbd className={kbdClass("arrowdown")}>↓</kbd>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--muted)]">Repeat Switch</span>
              <kbd className={kbdClass("r")}>R</kbd>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--muted)]">Playback Speed</span>
              <kbd className={kbdClass("p")}>P</kbd>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--muted)]">Switch Voice</span>
              <kbd className={kbdClass("e")}>E</kbd>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--muted)]">Turn Page</span>
              <div className="flex items-center gap-1">
                <kbd className={kbdClass("arrowleft")}>←</kbd>
                <kbd className={kbdClass("arrowright")}>→</kbd>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={handleToggle}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--surface)]/95 backdrop-blur-md border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--foreground)]/40 shadow-md text-[11px] font-medium transition-all cursor-pointer"
          title="Show keyboard shortcuts"
          aria-label="Show keyboard shortcuts"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h12A2.25 2.25 0 0 1 20.25 6v12A2.25 2.25 0 0 1 18 20.25H6A2.25 2.25 0 0 1 3.75 18V6ZM6.75 7.5v1.5m0 3v1.5m0 3v1.5m3.75-9v1.5m0 3v1.5m0 3v1.5m3.75-9v1.5m0 3v1.5m0 3v1.5m3.75-9v1.5m0 3v1.5m0 3v1.5" />
          </svg>
          <span>Shortcuts</span>
        </button>
      )}
    </aside>
  );
}
