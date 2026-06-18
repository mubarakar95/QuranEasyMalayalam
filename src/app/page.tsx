"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import MushafPage from "@/components/MushafPage";
import AudioPlayer from "@/components/AudioPlayer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { Reciter, RECITERS, TOTAL_PAGES, HighlightWord, AudioMode } from "@/lib/types";
import { fetchPage, fetchTranslationPage } from "@/lib/quran-api";
import { PageData as ApiPageData } from "@/lib/types";
import ErrorBoundary from "@/components/ErrorBoundary";
import QuranPage from "@/components/QuranPage";
import SwipeWBWView from "@/components/SwipeWBWView";

export default function Home() {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageData, setPageData] = useState<ApiPageData | null>(null);
  const [, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [simpleMode, setSimpleMode] = useState(false);
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
  const [mlFontSize, setMlFontSize] = useState(100);
  const [showSwipeWBW, setShowSwipeWBW] = useState(false);
  const [currentAyahIndex, setCurrentAyahIndex] = useState(0);
  const [audioVisible, setAudioVisible] = useState(true);

  useEffect(() => {
    try {
      if (window.location.search.includes("simple=1")) setSimpleMode(true);
      const savedPage = parseInt(localStorage.getItem("quran-page") || "1");
      if (savedPage >= 1 && savedPage <= TOTAL_PAGES) setCurrentPage(savedPage);
      const savedDark = localStorage.getItem("quran-dark-mode");
      if (savedDark === "true") setDarkMode(true);
      else if (savedDark === null && window.matchMedia("(prefers-color-scheme: dark)").matches) setDarkMode(true);
      const savedTranslation = localStorage.getItem("quran-show-translation");
      if (savedTranslation === "true") setShowTranslation(true);
      const savedWordByWord = localStorage.getItem("quran-show-word-by-word");
      if (savedWordByWord === "true") setShowWordByWord(true);
      const savedSwipeWBW = localStorage.getItem("quran-show-swipe-wbw");
      if (savedSwipeWBW === "true") setShowSwipeWBW(true);
      const savedTwoPage = localStorage.getItem("quran-two-page-mode");
      if (savedTwoPage === "true") {
        setTwoPageMode(true);
        if (savedPage % 2 === 0) setCurrentPage(savedPage - 1);
      }
      const savedMlSize = parseInt(localStorage.getItem("quran-ml-font-size") || "100");
      if (savedMlSize >= 60 && savedMlSize <= 200) setMlFontSize(savedMlSize);
    } catch {
      /* localStorage unavailable (e.g. Safari private) */
    }
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
          try { localStorage.setItem("quran-page", currentPage.toString()); } catch {}
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
  }, [currentPage, showTranslation, showSwipeWBW, twoPageMode]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    try { localStorage.setItem("quran-dark-mode", darkMode.toString()); } catch {}
  }, [darkMode]);

  useEffect(() => {
    document.documentElement.style.setProperty("--ml-font-size", `${mlFontSize}%`);
    const labelSpace = `${1.5 * (mlFontSize / 100)}rem`;
    document.documentElement.style.setProperty("--ml-label-space", labelSpace);
    try { localStorage.setItem("quran-ml-font-size", mlFontSize.toString()); } catch {}
  }, [mlFontSize]);

  useEffect(() => {
    setCurrentAyahIndex(0);
    if (showSwipeWBW) setAudioVisible(false);
  }, [currentPage, showSwipeWBW]);

  const toggleTranslation = useCallback(() => {
    setShowTranslation((prev) => {
      const next = !prev;
      try { localStorage.setItem("quran-show-translation", next.toString()); } catch {}
      if (!next) setTranslationMap(null);
      return next;
    });
  }, []);

  const toggleWordByWord = useCallback(() => {
    const next = !showWordByWord;
    setShowWordByWord(next);
    if (next) {
      setShowSwipeWBW(false);
      try { localStorage.setItem("quran-show-swipe-wbw", "false"); } catch {}
    }
    try { localStorage.setItem("quran-show-word-by-word", next.toString()); } catch {}
  }, [showWordByWord]);

  const toggleSwipe = useCallback(() => {
    const next = !showSwipeWBW;
    setShowSwipeWBW(next);
    if (next) {
      setShowWordByWord(false);
      try { localStorage.setItem("quran-show-word-by-word", "false"); } catch {}
    }
    try { localStorage.setItem("quran-show-swipe-wbw", next.toString()); } catch {}
  }, [showSwipeWBW]);
  const toggleTwoPageMode = useCallback(() => {
    setTwoPageMode((prev) => {
      const next = !prev;
      try { localStorage.setItem("quran-two-page-mode", next.toString()); } catch {}
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

  const ayahs = pageData?.ayahs || [];
  const surahName = pageData?.ayahs[0]?.surah.englishName;
  const juzNumber = pageData?.ayahs[0]?.juz;
  return (
    <ErrorBoundary>
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-[var(--border)] bg-[var(--background)] sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 h-14 grid grid-cols-[1fr_auto_1fr] items-center">
          <div className="flex items-center gap-1">
            <button
              onClick={toggleWordByWord}
              className={`p-2 rounded-md transition-colors ${
                showWordByWord
                  ? "text-[var(--foreground)]"
                  : "hover:text-[var(--foreground)] text-[var(--muted)]"
              }`}
              aria-label="Toggle word-by-word"
              title={showWordByWord ? "Word-by-word on" : "Word-by-word off"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-[18px] h-[18px]">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h12M4 18h8" />
              </svg>
            </button>
            <button
              onClick={toggleSwipe}
              className={`p-2 rounded-md transition-colors ${
                showSwipeWBW
                  ? "text-[var(--foreground)]"
                  : "hover:text-[var(--foreground)] text-[var(--muted)]"
              }`}
              aria-label="Toggle swipe word-by-word"
              title={showSwipeWBW ? "Swipe mode on" : "Swipe mode off"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-[18px] h-[18px]">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
              </svg>
            </button>
            <button
              onClick={toggleTranslation}
              className={`p-2 rounded-md transition-colors ${
                showTranslation
                  ? "text-[var(--foreground)]"
                  : "hover:text-[var(--foreground)] text-[var(--muted)]"
              }`}
              aria-label="Toggle Malayalam translation"
              title={showTranslation ? "On" : "Off"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-[18px] h-[18px]">
                <path strokeLinecap="round" strokeLinejoin="round" d="m10.5 21 5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 0 1 6-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.78.147 2.653.255" />
              </svg>
            </button>
          </div>

          <h1 className="text-base font-semibold tracking-tight">
            Quran <span className="font-normal text-[var(--muted)]">Easy</span>
          </h1>

          <div className="flex items-center gap-1 justify-self-end">
            <button
              onClick={() => setAudioVisible((v) => !v)}
              className={`p-2 rounded-md transition-colors ${
                audioVisible
                  ? "hover:text-[var(--foreground)] text-[var(--muted)]"
                  : "text-[var(--foreground)]"
              }`}
              aria-label={audioVisible ? "Hide audio player" : "Show audio player"}
              title={audioVisible ? "Hide audio" : "Show audio"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-[18px] h-[18px]">
                {audioVisible ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                )}
              </svg>
            </button>
            <button
              onClick={toggleTwoPageMode}
              className={`hidden sm:inline-flex p-2 rounded-md transition-colors ${
                twoPageMode
                  ? "text-[var(--foreground)]"
                  : "hover:text-[var(--foreground)] text-[var(--muted)]"
              }`}
              aria-label="Toggle two-page mode"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-[18px] h-[18px]">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
              </svg>
            </button>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-md hover:text-[var(--foreground)] text-[var(--muted)] transition-colors"
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
              className="p-2 rounded-md hover:text-[var(--foreground)] text-[var(--muted)] transition-colors"
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
        mlFontSize={mlFontSize}
        onMlFontSizeChange={setMlFontSize}
      />

      <main className={`flex-1 ${audioVisible ? "pb-28" : "pb-0"}`}>
        <div style={{ display: simpleMode ? "none" : "block" }}>
          <div style={{ display: showSwipeWBW ? "block" : "none" }}>
            <SwipeWBWView
              ayahs={ayahs}
              currentPage={currentPage}
              mlFontSize={mlFontSize}
              currentAyahIndex={currentAyahIndex}
              onAyahIndexChange={setCurrentAyahIndex}
              translationMap={translationMap}
            />
          </div>
          <div style={{ display: twoPageMode && !showSwipeWBW ? "block" : "none" }} className="mushaf-spread">
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
          <div style={{ display: !twoPageMode && !showSwipeWBW ? "block" : "none" }}>
            <MushafPage
              currentPage={currentPage}
              highlightVerseKey={highlightVerseKey}
              highlightWord={highlightWord}
              onVerseClick={(key) => setHighlightVerseKey(key === highlightVerseKey ? null : key)}
              showTranslation={showTranslation}
              translationMap={translationMap}
              showWordByWord={showWordByWord}
            />
          </div>
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
        </div>
        <div style={{ display: simpleMode ? "block" : "none" }}>
          <QuranPage pageData={pageData} currentPage={currentPage} loading={false} />
        </div>
      </main>

      {audioVisible && (
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
      )}

      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onGoToPage={goToPage}
        currentPage={currentPage}
      />
    </div>
    </ErrorBoundary>
  );
}