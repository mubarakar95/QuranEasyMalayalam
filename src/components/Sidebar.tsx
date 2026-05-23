"use client";

import { useState, useEffect, useRef } from "react";
import { TOTAL_PAGES, JUZ_DATA } from "@/lib/types";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onGoToPage: (page: number) => void;
  currentPage: number;
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

export default function Sidebar({ isOpen, onClose, onGoToPage, currentPage }: SidebarProps) {
  const [activeTab, setActiveTab] = useState<"surah" | "juz" | "page">("surah");
  const [surahs, setSurahs] = useState<SurahItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [pageInput, setPageInput] = useState(currentPage.toString());
  const fetchedRef = useRef(false);

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
        <div className="sticky top-0 bg-[var(--background)] border-b border-[var(--border)] px-4 py-4 z-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold tracking-tight">Navigate</h2>
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
            {(["surah", "juz", "page"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-all ${
                  activeTab === tab
                    ? "bg-[var(--foreground)] text-[var(--background)]"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {tab === "surah" ? "Surah" : tab === "juz" ? "Juz" : "Page"}
              </button>
            ))}
          </div>
        </div>

        <div className="px-2 py-2">
          {activeTab === "surah" && (
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

          {activeTab === "juz" && (
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

          {activeTab === "page" && (
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
        </div>
      </div>
    </>
  );
}