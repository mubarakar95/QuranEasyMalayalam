"use client";

import { useState, useEffect, useRef } from "react";
import { TOTAL_PAGES, JUZ_DATA, Reciter, RECITERS } from "@/lib/types";
import DownloadManager from "@/components/DownloadManager";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onGoToPage: (page: number) => void;
  currentPage: number;
  showWordByWord: boolean;
  onToggleWordByWord: () => void;
  showSwipeWBW: boolean;
  onToggleSwipe: () => void;
  showTranslation: boolean;
  onToggleTranslation: () => void;
  audioVisible: boolean;
  onToggleAudioVisible: () => void;
  twoPageMode: boolean;
  onToggleTwoPageMode: () => void;
  mlFontSize: number;
  onMlFontSizeChange: (fn: (prev: number) => number) => void;
  arFontSize: number;
  onArFontSizeChange: (fn: (prev: number) => number) => void;
  lineHeight: number;
  onLineHeightChange: (fn: (prev: number) => number) => void;
  surahName?: string;
  juzNumber?: number;
  reciter?: Reciter;
  onReciterChange?: (reciter: Reciter) => void;
}

interface SurahItem {
  number: number;
  name: string;
  englishName: string;
  englishNameTranslation: string;
  numberOfAyahs: number;
  revelationType: string;
}

const surahPageMap: Record<number, number> = {
  1: 1, 2: 2, 3: 22, 4: 77, 5: 106, 6: 128, 7: 151, 8: 177, 9: 187,
  10: 208, 11: 221, 12: 235, 13: 250, 14: 255, 15: 262, 16: 267, 17: 282,
  18: 293, 19: 305, 20: 312, 21: 322, 22: 332, 23: 342, 24: 350, 25: 359,
  26: 367, 27: 377, 28: 385, 29: 394, 30: 404, 31: 411, 32: 415, 33: 418,
  34: 428, 35: 434, 36: 440, 37: 446, 38: 453, 39: 458, 40: 467, 41: 477,
  42: 483, 43: 489, 44: 496, 45: 499, 46: 502, 47: 507, 48: 511, 49: 515,
  50: 518, 51: 522, 52: 526, 53: 528, 54: 531, 55: 531, 56: 534, 57: 537,
  58: 540, 59: 543, 60: 545, 61: 548, 62: 549, 63: 551, 64: 552, 65: 554,
  66: 555, 67: 557, 68: 559, 69: 562, 70: 564, 71: 567, 72: 569, 73: 571,
  74: 573, 75: 577, 76: 578, 77: 580, 78: 582, 79: 584, 80: 585, 81: 587,
  82: 588, 83: 589, 84: 591, 85: 592, 86: 593, 87: 594, 88: 594, 89: 595,
  90: 596, 91: 597, 92: 597, 93: 598, 94: 598, 95: 599, 96: 599, 97: 600,
  98: 600, 99: 600, 100: 600, 101: 601, 102: 601, 103: 601, 104: 601,
  105: 601, 106: 602, 107: 602, 108: 602, 109: 603, 110: 603, 111: 603,
  112: 604, 113: 604, 114: 604,
};

export default function Sidebar({
  isOpen,
  onClose,
  onGoToPage,
  currentPage,
  showWordByWord,
  onToggleWordByWord,
  showSwipeWBW,
  onToggleSwipe,
  showTranslation,
  onToggleTranslation,
  audioVisible,
  onToggleAudioVisible,
  twoPageMode,
  onToggleTwoPageMode,
  mlFontSize,
  onMlFontSizeChange,
  arFontSize,
  onArFontSizeChange,
  lineHeight,
  onLineHeightChange,
  surahName,
  juzNumber,
  reciter,
  onReciterChange,
}: SidebarProps) {
  const [activeTab, setActiveTab] = useState<"navigate" | "settings">("navigate");
  const [navTab, setNavTab] = useState<"surah" | "juz" | "page">("surah");
  const [surahs, setSurahs] = useState<SurahItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [pageInput, setPageInput] = useState(currentPage.toString());
  const fetchedRef = useRef(false);
  const [showDownloads, setShowDownloads] = useState(false);

  useEffect(() => {
    if (isOpen && !fetchedRef.current) {
      setLoading(true);
      fetch("https://api.alquran.cloud/v1/surah")
        .then((res) => res.json())
        .then((data) => {
          setSurahs(data.data);
          fetchedRef.current = true;
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  const handleGoToPage = (page: number) => {
    onGoToPage(page);
    onClose();
  };

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      )}

      <div
        className={`fixed top-0 right-0 h-full w-80 max-w-[85vw] bg-[var(--background)] border-l border-[var(--border)] z-50 transform transition-transform duration-200 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        } overflow-y-auto`}
      >
        <div className="sticky top-0 bg-[var(--background)] border-b border-[var(--border)] px-4 py-3 z-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold tracking-tight">Menu</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-[var(--surface)] transition-colors"
              aria-label="Close sidebar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex gap-0.5 bg-[var(--surface)] rounded-lg p-0.5">
            {(["navigate", "settings"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-all ${
                  activeTab === tab
                    ? "bg-[var(--foreground)] text-[var(--background)]"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {tab === "navigate" ? "Navigate" : "Settings"}
              </button>
            ))}
          </div>
        </div>

        <div className="px-2 py-2">
          {activeTab === "navigate" && (
            <>
              <div className="flex gap-0.5 bg-[var(--surface)] rounded-lg p-0.5 mb-2">
                {(["surah", "juz", "page"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setNavTab(tab)}
                    className={`flex-1 py-1.5 px-2 rounded-md text-[10px] font-medium transition-all ${
                      navTab === tab
                        ? "bg-[var(--foreground)] text-[var(--background)]"
                        : "text-[var(--muted)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    {tab === "surah" ? "Surah" : tab === "juz" ? "Juz" : "Page"}
                  </button>
                ))}
              </div>

              {navTab === "surah" && (
                <div className="space-y-px">
                  {loading ? (
                    <div className="flex justify-center py-12">
                      <div className="w-4 h-4 border-2 border-[var(--foreground)] border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (
                    surahs.map((surah) => (
                      <button
                        key={surah.number}
                        onClick={() => handleGoToPage(surahPageMap[surah.number] || 1)}
                        className={`w-full text-right flex items-center justify-between gap-3 px-3 py-2 rounded-md transition-colors ${
                          surahPageMap[surah.number] === currentPage
                            ? "bg-[var(--surface)]"
                            : "hover:bg-[var(--surface)]"
                        }`}
                      >
                        <span className="flex items-center gap-2.5">
                          <span className="w-5 text-[10px] text-[var(--muted)] tabular-nums">
                            {surah.number}
                          </span>
                          <span className="text-xs text-[var(--muted)]">
                            {surah.englishName}
                          </span>
                        </span>
                        <span className="font-semibold text-sm">
                          {surah.name}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}

              {navTab === "juz" && (
                <div className="space-y-px">
                  {JUZ_DATA.map((juz) => (
                    <button
                      key={juz.number}
                      onClick={() => handleGoToPage(juz.startPage)}
                      className={`w-full text-right flex items-center justify-between gap-3 px-3 py-2.5 rounded-md transition-colors ${
                        currentPage >= juz.startPage &&
                        currentPage <
                          (JUZ_DATA.find((j) => j.number === juz.number + 1)
                            ?.startPage || TOTAL_PAGES + 1)
                          ? "bg-[var(--surface)]"
                          : "hover:bg-[var(--surface)]"
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <span className="w-5 text-[10px] text-[var(--muted)] tabular-nums">
                          {juz.number}
                        </span>
                        <span className="text-xs text-[var(--muted)]">
                          {juz.nameEn}
                        </span>
                      </span>
                      <span className="font-semibold text-sm">
                        {juz.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {navTab === "page" && (
                <div className="flex flex-col items-center gap-4 py-8">
                  <label className="text-xs text-[var(--muted)]">
                    Go to page (1–{TOTAL_PAGES})
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={TOTAL_PAGES}
                    value={pageInput}
                    onChange={(e) => setPageInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const page = parseInt(pageInput);
                        if (page >= 1 && page <= TOTAL_PAGES) {
                          handleGoToPage(page);
                        }
                      }
                    }}
                    className="w-24 px-3 py-2 text-center text-sm rounded-md border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-1 focus:ring-[var(--foreground)]"
                  />
                  <button
                    onClick={() => {
                      const page = parseInt(pageInput);
                      if (page >= 1 && page <= TOTAL_PAGES) {
                        handleGoToPage(page);
                      }
                    }}
                    className="px-4 py-1.5 text-xs font-medium bg-[var(--foreground)] text-[var(--background)] rounded-md hover:opacity-90 transition-opacity"
                  >
                    Go
                  </button>
                </div>
              )}
            </>
          )}

          {activeTab === "settings" && (
            <div className="space-y-1">
              {surahName && (
                <div className="px-3 py-2 mb-2">
                  <span className="text-xs font-medium text-[var(--foreground)]">{surahName}</span>
                  {juzNumber && <span className="text-[10px] text-[var(--muted)] ml-2">Juz {juzNumber}</span>}
                </div>
              )}

              <div className="px-3 py-2">
                <label className="text-xs text-[var(--muted)] mb-1.5 block">Reciter</label>
                <select
                  value={reciter?.id}
                  onChange={(e) => {
                    const selected = RECITERS.find((r) => r.id === e.target.value);
                    if (selected && onReciterChange) {
                      onReciterChange(selected);
                    }
                  }}
                  className="w-full px-3 py-2 text-xs rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] cursor-pointer focus:outline-none focus:ring-1 focus:ring-[var(--foreground)]"
                >
                  {RECITERS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => setShowDownloads(true)}
                className="sidebar-toggle-btn"
              >
                <span className="sidebar-toggle-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                </span>
                <span>Downloads</span>
              </button>

              <button
                onClick={onToggleWordByWord}
                className="sidebar-toggle-btn"
              >
                <span className="sidebar-toggle-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h12M4 18h8" />
                  </svg>
                </span>
                <span>Word by Word</span>
                <span className={`sidebar-toggle-indicator ${showWordByWord ? "active" : ""}`}>
                  <span className="sidebar-toggle-dot" />
                </span>
              </button>

              <button
                onClick={onToggleSwipe}
                className="sidebar-toggle-btn"
              >
                <span className="sidebar-toggle-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                  </svg>
                </span>
                <span>Swipe Mode</span>
                <span className={`sidebar-toggle-indicator ${showSwipeWBW ? "active" : ""}`}>
                  <span className="sidebar-toggle-dot" />
                </span>
              </button>

              <button
                onClick={onToggleTranslation}
                className="sidebar-toggle-btn"
              >
                <span className="sidebar-toggle-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m10.5 21 5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 0 1 6-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.78.147 2.653.255" />
                  </svg>
                </span>
                <span>Translation</span>
                <span className={`sidebar-toggle-indicator ${showTranslation ? "active" : ""}`}>
                  <span className="sidebar-toggle-dot" />
                </span>
              </button>

              <button
                onClick={onToggleAudioVisible}
                className="sidebar-toggle-btn"
              >
                <span className="sidebar-toggle-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                  </svg>
                </span>
                <span>Audio Player</span>
                <span className={`sidebar-toggle-indicator ${audioVisible ? "active" : ""}`}>
                  <span className="sidebar-toggle-dot" />
                </span>
              </button>

              <button
                onClick={onToggleTwoPageMode}
                className="sidebar-toggle-btn"
              >
                <span className="sidebar-toggle-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                  </svg>
                </span>
                <span>Two Page Mode</span>
                <span className={`sidebar-toggle-indicator ${twoPageMode ? "active" : ""}`}>
                  <span className="sidebar-toggle-dot" />
                </span>
              </button>

              <div className="px-3 py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-[var(--muted)]">Arabic Font Size</span>
                  <span className="text-xs font-medium tabular-nums">{arFontSize}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => onArFontSizeChange((s) => Math.max(60, s - 10))}
                    className="flex items-center justify-center w-8 h-8 rounded-full border border-[var(--border)] hover:bg-[var(--surface)] transition-colors text-[var(--muted)] hover:text-[var(--foreground)]"
                    aria-label="Decrease Arabic font size"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
                    </svg>
                  </button>
                  <div className="flex-1 h-1 bg-[var(--surface)] rounded-full relative">
                    <div
                      className="absolute left-0 top-0 h-full bg-[var(--foreground)] rounded-full opacity-30"
                      style={{ width: `${((arFontSize - 60) / 140) * 100}%` }}
                    />
                  </div>
                  <button
                    onClick={() => onArFontSizeChange((s) => Math.min(200, s + 10))}
                    className="flex items-center justify-center w-8 h-8 rounded-full border border-[var(--border)] hover:bg-[var(--surface)] transition-colors text-[var(--muted)] hover:text-[var(--foreground)]"
                    aria-label="Increase Arabic font size"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7H5" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="px-3 py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-[var(--muted)]">Malayalam Font Size</span>
                  <span className="text-xs font-medium tabular-nums">{mlFontSize}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => onMlFontSizeChange((s) => Math.max(60, s - 10))}
                    className="flex items-center justify-center w-8 h-8 rounded-full border border-[var(--border)] hover:bg-[var(--surface)] transition-colors text-[var(--muted)] hover:text-[var(--foreground)]"
                    aria-label="Decrease font size"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
                    </svg>
                  </button>
                  <div className="flex-1 h-1 bg-[var(--surface)] rounded-full relative">
                    <div
                      className="absolute left-0 top-0 h-full bg-[var(--foreground)] rounded-full opacity-30"
                      style={{ width: `${((mlFontSize - 60) / 140) * 100}%` }}
                    />
                  </div>
                  <button
                    onClick={() => onMlFontSizeChange((s) => Math.min(200, s + 10))}
                    className="flex items-center justify-center w-8 h-8 rounded-full border border-[var(--border)] hover:bg-[var(--surface)] transition-colors text-[var(--muted)] hover:text-[var(--foreground)]"
                    aria-label="Increase font size"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7H5" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="px-3 py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-[var(--muted)]">Line Height</span>
                  <span className="text-xs font-medium tabular-nums">{lineHeight}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => onLineHeightChange((s) => Math.max(60, s - 5))}
                    className="flex items-center justify-center w-8 h-8 rounded-full border border-[var(--border)] hover:bg-[var(--surface)] transition-colors text-[var(--muted)] hover:text-[var(--foreground)]"
                    aria-label="Decrease line height"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
                    </svg>
                  </button>
                  <div className="flex-1 h-1 bg-[var(--surface)] rounded-full relative">
                    <div
                      className="absolute left-0 top-0 h-full bg-[var(--foreground)] rounded-full opacity-30"
                      style={{ width: `${((lineHeight - 60) / 140) * 100}%` }}
                    />
                  </div>
                  <button
                    onClick={() => onLineHeightChange((s) => Math.min(200, s + 5))}
                    className="flex items-center justify-center w-8 h-8 rounded-full border border-[var(--border)] hover:bg-[var(--surface)] transition-colors text-[var(--muted)] hover:text-[var(--foreground)]"
                    aria-label="Increase line height"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7H5" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Learn Vocabulary Link */}
          <a
            href="/learn"
            onClick={onClose}
            className="flex items-center gap-2 px-3 py-2.5 mx-2 mb-2 rounded-lg bg-[var(--surface)] hover:bg-[var(--border)] transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-[var(--accent)]">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
            </svg>
            <span className="text-xs font-medium">Learn Vocabulary</span>
          </a>

          <a
            href="/mushtabihat"
            onClick={onClose}
            className="flex items-center gap-2 px-3 py-2.5 mx-2 mb-2 rounded-lg bg-[var(--surface)] hover:bg-[var(--border)] transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-[var(--accent)]">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
            </svg>
            <span className="text-xs font-medium">Mushtabihat</span>
          </a>
        </div>
      </div>

      {showDownloads && (
        <DownloadManager isOpen={showDownloads} onClose={() => setShowDownloads(false)} />
      )}
    </>
  );
}
