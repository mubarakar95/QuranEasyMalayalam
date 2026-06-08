"use client";

import { TOTAL_PAGES } from "@/lib/types";

interface NavigationProps {
  currentPage: number;
  onPrev: () => void;
  onNext: () => void;
  surahName?: string;
  juzNumber?: number;
  twoPageMode?: boolean;
  mlFontSize?: number;
  onMlFontSizeChange?: (fn: (prev: number) => number) => void;
}

export default function Navigation({
  currentPage,
  onPrev,
  onNext,
  surahName,
  juzNumber,
  twoPageMode = false,
  mlFontSize,
  onMlFontSizeChange,
}: NavigationProps) {
  const canPrev = currentPage > 1;
  const canNext = twoPageMode ? currentPage + 1 < TOTAL_PAGES : currentPage < TOTAL_PAGES;

  const pageLabel = twoPageMode && currentPage + 1 <= TOTAL_PAGES
    ? `${currentPage}-${currentPage + 1}`
    : `${currentPage}`;

  return (
    <div className="navigation-bar max-w-[600px] mx-auto" suppressHydrationWarning>
      <button
        onClick={onNext}
        disabled={!canNext}
        className="nav-btn"
        aria-label="Next page"
        suppressHydrationWarning
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
      </button>

      <div className="flex items-center gap-3 min-w-0" suppressHydrationWarning>
        <div className="flex flex-col items-center min-w-0" suppressHydrationWarning>
          <span className="text-xs font-medium tabular-nums" suppressHydrationWarning>
            {pageLabel}<span className="text-[var(--muted)]">/{TOTAL_PAGES}</span>
          </span>
          {surahName && (
            <span className="text-[9px] text-[var(--muted)] truncate max-w-full">
              {surahName} · {juzNumber ? `Juz ${juzNumber}` : ""}
            </span>
          )}
        </div>

        {onMlFontSizeChange && mlFontSize && (
          <div className="flex items-center gap-1 border border-[var(--border)] rounded-full px-1.5 py-0.5">
            <button
              onClick={() => onMlFontSizeChange((s) => Math.max(60, s - 10))}
              className="flex items-center justify-center w-4 h-4 rounded-full hover:bg-[var(--surface)] transition-colors text-[var(--muted)] hover:text-[var(--foreground)]"
              aria-label="Decrease font size"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
              </svg>
            </button>
            <span className="text-[9px] tabular-nums text-[var(--muted)] min-w-[1.8rem] text-center font-medium">{mlFontSize}%</span>
            <button
              onClick={() => onMlFontSizeChange((s) => Math.min(200, s + 10))}
              className="flex items-center justify-center w-4 h-4 rounded-full hover:bg-[var(--surface)] transition-colors text-[var(--muted)] hover:text-[var(--foreground)]"
              aria-label="Increase font size"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7H5" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <button
        onClick={onPrev}
        disabled={!canPrev}
        className="nav-btn"
        aria-label="Previous page"
        suppressHydrationWarning
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </button>
    </div>
  );
}
