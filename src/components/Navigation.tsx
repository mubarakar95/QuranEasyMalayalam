"use client";

import { TOTAL_PAGES } from "@/lib/types";

interface NavigationProps {
  currentPage: number;
  onPrev: () => void;
  onNext: () => void;
  surahName?: string;
  juzNumber?: number;
  twoPageMode?: boolean;
}

export default function Navigation({
  currentPage,
  onPrev,
  onNext,
  surahName,
  juzNumber,
  twoPageMode = false,
}: NavigationProps) {
  const canPrev = currentPage > 1;
  const canNext = twoPageMode ? currentPage + 1 < TOTAL_PAGES : currentPage < TOTAL_PAGES;

  const pageLabel = twoPageMode && currentPage + 1 <= TOTAL_PAGES
    ? `${currentPage}-${currentPage + 1}`
    : `${currentPage}`;

  return (
    <div className="navigation-bar max-w-3xl mx-auto" suppressHydrationWarning>
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
        <span className="hidden sm:inline text-xs" suppressHydrationWarning>Next</span>
      </button>

      <div className="flex flex-col items-center" suppressHydrationWarning>
        <span className="text-sm font-medium tabular-nums" suppressHydrationWarning>
          {pageLabel} <span className="text-[var(--muted)] font-normal">/ {TOTAL_PAGES}</span>
        </span>
        {surahName && (
          <span className="text-[10px] text-[var(--muted)] mt-0.5">
            {surahName} · Juz {juzNumber}
          </span>
        )}
      </div>

      <button
        onClick={onPrev}
        disabled={!canPrev}
        className="nav-btn"
        aria-label="Previous page"
        suppressHydrationWarning
      >
        <span className="hidden sm:inline text-xs" suppressHydrationWarning>Prev</span>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </button>
    </div>
  );
}