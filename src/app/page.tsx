"use client";

import { useState, useCallback, useEffect } from "react";
import MushafPage from "@/components/MushafPage";
import AudioPlayer from "@/components/AudioPlayer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { Reciter, RECITERS, TOTAL_PAGES, HighlightWord, AudioMode } from "@/lib/types";
import { fetchPage, fetchTranslationPage } from "@/lib/quran-api";
import { PageData as ApiPageData } from "@/lib/types";

export default function Home() {
  const [hydrated, setHydrated] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageData, setPageData] = useState<ApiPageData | null>(null);
  const [, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [reciter, setReciter] = useState<Reciter>(RECITERS[0]);
  const [darkMode, setDarkMode] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [highlightVerseKey, setHighlightVerseKey] = useState<string | null>(null);
  const [highlightWord, setHighlightWord] = useState<HighlightWord | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [showWordByWord, setShowWordByWord] = useState(false);
  const [translationMap, setTranslationMap] = useState<Map<string, string> | null>(null);
  const [translationMapRight, setTranslationMapRight] = useState<Map<string, string> | null>(null);
  const [audioMode, setAudioMode] = useState<AudioMode>("arabic");
  const [twoPageMode, setTwoPageMode] = useState(false);

  useEffect(() => {
    const savedPage = parseInt(localStorage.getItem("quran-page") || "1");
    if (savedPage >= 1 && savedPage <= TOTAL_PAGES) setCurrentPage(savedPage);
    const savedDark = localStorage.getItem("quran-dark-mode");
    if (savedDark === "true") setDarkMode(true);
    else if (savedDark === null && window.matchMedia("(prefers-color-scheme: dark)").matches) setDarkMode(true);
    const savedTranslation = localStorage.getItem("quran-show-translation");
    if (savedTranslation === "true") setShowTranslation(true);
    const savedWordByWord = localStorage.getItem("quran-show-word-by-word");
    if (savedWordByWord === "true") setShowWordByWord(true);
    const savedTwoPage = localStorage.getItem("quran-two-page-mode");
    if (savedTwoPage === "true") {
      setTwoPageMode(true);
      if (savedPage % 2 === 0) setCurrentPage(savedPage - 1);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchPage(currentPage);
        if (!cancelled) {
          setPageData(data);
          setLoading(false);
          localStorage.setItem("quran-page", currentPage.toString());
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      } catch {
        if (!cancelled) {
          setError("പേജ് ലോഡ് ചെയ്യാൻ കഴിഞ്ഞില്ല");
          setPageData(null);
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [currentPage, retryCount]);

  useEffect(() => {
    if (!showTranslation) {
      return;
    }

    let cancelled = false;

    fetchTranslationPage(currentPage)
      .then((map) => {
        if (!cancelled) setTranslationMap(map);
      })
      .catch(() => {
        if (!cancelled) setTranslationMap(null);
      });

    if (twoPageMode && currentPage + 1 <= TOTAL_PAGES) {
      fetchTranslationPage(currentPage + 1)
        .then((map) => {
          if (!cancelled) setTranslationMapRight(map);
        })
        .catch(() => {
          if (!cancelled) setTranslationMapRight(null);
        });
    }

    return () => { cancelled = true; };
  }, [currentPage, showTranslation, twoPageMode]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("quran-dark-mode", darkMode.toString());
  }, [darkMode]);

  const toggleTranslation = useCallback(() => {
    setShowTranslation((prev) => {
      const next = !prev;
      localStorage.setItem("quran-show-translation", next.toString());
      if (!next) setTranslationMap(null);
      return next;
    });
  }, []);

  const toggleWordByWord = useCallback(() => {
    setShowWordByWord((prev) => {
      const next = !prev;
      localStorage.setItem("quran-show-word-by-word", next.toString());
      return next;
    });
  }, []);

  const toggleTwoPageMode = useCallback(() => {
    setTwoPageMode((prev) => {
      const next = !prev;
      localStorage.setItem("quran-two-page-mode", next.toString());
      if (next) {
        setCurrentPage((p) => (p % 2 === 0 ? p - 1 : p));
      }
      return next;
    });
  }, []);

  const goToPage = useCallback((page: number) => {
    if (page >= 1 && page <= TOTAL_PAGES) {
      setCurrentPage(twoPageMode ? (page % 2 === 0 ? page - 1 : page) : page);
    }
  }, [twoPageMode]);

  const goNext = useCallback(() => {
    setCurrentPage((prev) => {
      const step = twoPageMode ? 2 : 1;
      return prev + step <= TOTAL_PAGES ? prev + step : prev;
    });
  }, [twoPageMode]);

  const goPrev = useCallback(() => {
    setCurrentPage((prev) => {
      const step = twoPageMode ? 2 : 1;
      return prev - step >= 1 ? prev - step : prev;
    });
  }, [twoPageMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrev]);

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-5 h-5 border-2 border-[var(--foreground)] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-[var(--muted)]">Loading...</p>
        </div>
      </div>
    );
  }

  const ayahs = pageData?.ayahs || [];
  const surahName = pageData?.ayahs[0]?.surah.englishName;
  const juzNumber = pageData?.ayahs[0]?.juz;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-[var(--border)] bg-[var(--background)] sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-semibold tracking-tight">
              Quran <span className="font-normal text-[var(--muted)]">Easy</span>
            </h1>
          </div>

          <div className="flex items-center gap-1">
            {!twoPageMode && (
              <button
                onClick={toggleWordByWord}
                className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                  showWordByWord
                    ? "bg-[var(--foreground)] text-[var(--background)]"
                    : "hover:bg-[var(--surface)] text-[var(--muted)]"
                }`}
                aria-label="Toggle word-by-word Malayalam"
              >
                Word
              </button>
            )}
            <button
              onClick={toggleTranslation}
              className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                showTranslation
                  ? "bg-[var(--foreground)] text-[var(--background)]"
                  : "hover:bg-[var(--surface)] text-[var(--muted)]"
              }`}
              aria-label="Toggle Malayalam translation"
            >
              മലയാളം
            </button>
            <button
              onClick={toggleTwoPageMode}
              className={`p-2 rounded-md transition-colors ${
                twoPageMode
                  ? "bg-[var(--foreground)] text-[var(--background)]"
                  : "hover:bg-[var(--surface)] text-[var(--muted)]"
              }`}
              aria-label="Toggle two-page mode"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-[18px] h-[18px]">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
              </svg>
            </button>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-md hover:bg-[var(--surface)] transition-colors"
              aria-label="Toggle dark mode"
            >
              {darkMode ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-[18px] h-[18px]">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-[18px] h-[18px]">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
                </svg>
              )}
            </button>
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-md hover:bg-[var(--surface)] transition-colors"
              aria-label="Open navigation"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-[18px] h-[18px]">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <Navigation
        currentPage={currentPage}
        onPrev={goPrev}
        onNext={goNext}
        surahName={surahName}
        juzNumber={juzNumber}
        twoPageMode={twoPageMode}
      />

      <main className="flex-1 pb-28">
        {error && (
          <div className="max-w-3xl mx-auto px-4 py-4">
            <div className="border border-[var(--border)] rounded-lg p-4 text-center">
              <p className="text-sm text-[var(--muted)]">{error}</p>
              <button
                onClick={() => setRetryCount((c) => c + 1)}
                className="mt-2 px-3 py-1 text-xs font-medium border border-[var(--border)] rounded-md hover:bg-[var(--surface)] transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {twoPageMode ? (
          <div className="mushaf-spread">
            <div className="mushaf-spread-pages">
              {currentPage + 1 <= TOTAL_PAGES && (
                <>
                  <div className="mushaf-spread-page">
                    <MushafPage
                      currentPage={currentPage + 1}
                      highlightVerseKey={highlightVerseKey}
                      highlightWord={highlightWord}
                      onVerseClick={(key) => setHighlightVerseKey(key === highlightVerseKey ? null : key)}
                      showTranslation={showTranslation}
                      translationMap={translationMapRight}
                    />
                  </div>
                  <div className="mushaf-spine-line" />
                </>
              )}
              <div className="mushaf-spread-page">
                <MushafPage
                  currentPage={currentPage}
                  highlightVerseKey={highlightVerseKey}
                  highlightWord={highlightWord}
                  onVerseClick={(key) => setHighlightVerseKey(key === highlightVerseKey ? null : key)}
                  showTranslation={showTranslation}
                  translationMap={translationMap}
                />
              </div>
            </div>
          </div>
        ) : (
          <MushafPage
            currentPage={currentPage}
            highlightVerseKey={highlightVerseKey}
            highlightWord={highlightWord}
            onVerseClick={(key) => setHighlightVerseKey(key === highlightVerseKey ? null : key)}
            showTranslation={showTranslation}
            translationMap={translationMap}
            showWordByWord={showWordByWord}
          />
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-20">
        <AudioPlayer
          key={currentPage}
          ayahs={ayahs}
          reciter={reciter}
          onReciterChange={setReciter}
          onPageComplete={goNext}
          onVerseChange={(key) => setHighlightVerseKey(key)}
          onWordHighlight={(word) => setHighlightWord(word)}
          audioMode={audioMode}
          onAudioModeChange={setAudioMode}
          highlightVerseKey={highlightVerseKey}
        />
      </div>

      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onGoToPage={goToPage}
        currentPage={currentPage}
      />
    </div>
  );
}