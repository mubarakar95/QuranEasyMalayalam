"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import MushafPage from "@/components/MushafPage";
import AudioPlayer from "@/components/AudioPlayer";
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
  const [arFontSize, setArFontSize] = useState(100);
  const [showSwipeWBW, setShowSwipeWBW] = useState(false);
  const [currentAyahIndex, setCurrentAyahIndex] = useState(0);
  const [audioVisible, setAudioVisible] = useState(true);
  const [lineHeight, setLineHeight] = useState(100);

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
      const savedArSize = parseInt(localStorage.getItem("quran-ar-font-size") || "100");
      if (savedArSize >= 60 && savedArSize <= 200) setArFontSize(savedArSize);
      const savedLineHeight = parseInt(localStorage.getItem("quran-line-height") || "100");
      if (savedLineHeight >= 60 && savedLineHeight <= 200) setLineHeight(savedLineHeight);
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
    document.documentElement.style.setProperty("--ar-font-scale", `${arFontSize / 100}`);
    try { localStorage.setItem("quran-ar-font-size", arFontSize.toString()); } catch {}
  }, [arFontSize]);

  useEffect(() => {
    document.documentElement.style.setProperty("--lh-scale", `${lineHeight / 100}`);
    try { localStorage.setItem("quran-line-height", lineHeight.toString()); } catch {}
  }, [lineHeight]);

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
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrev]);

  const [scrolledDown, setScrolledDown] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const getScrollY = () => window.scrollY || document.documentElement.scrollTop || 0;
    const handleScroll = () => {
      const y = getScrollY();
      const goingDown = y > lastScrollY.current;
      const goingUp = y < lastScrollY.current;
      if (y < 30) {
        setScrolledDown(false);
      } else if (goingDown) {
        setScrolledDown(true);
      } else if (goingUp) {
        setScrolledDown(false);
      }
      lastScrollY.current = y;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const ayahs = pageData?.ayahs || [];
  const surahName = pageData?.ayahs[0]?.surah.englishName;
  const juzNumber = pageData?.ayahs[0]?.juz;

  const pageLabel = twoPageMode && currentPage + 1 <= TOTAL_PAGES
    ? `${currentPage}–${currentPage + 1}`
    : `${currentPage}`;

  return (
    <ErrorBoundary>
    <header
      className="border-b border-[var(--border)] bg-[var(--background)] z-30"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        transform: scrolledDown ? "translateY(-100%)" : "translateY(0)",
        transition: "transform 0.3s ease-in-out",
      }}
    >
      <div className="max-w-3xl mx-auto px-4 h-11 grid grid-cols-[auto_1fr_auto] items-center">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 rounded-md hover:text-[var(--foreground)] text-[var(--muted)] transition-colors"
          aria-label="Open menu"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>

        <h1 className="text-sm font-semibold tracking-tight text-center">
          Quran <span className="font-normal text-[var(--muted)]">Easy</span>
        </h1>

        <button
          onClick={() => setDarkMode(!darkMode)}
          className="p-2 rounded-md hover:text-[var(--foreground)] text-[var(--muted)] transition-colors"
          aria-label="Toggle dark mode"
        >
          {darkMode ? (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
            </svg>
          )}
        </button>
      </div>
    </header>

    <main className="flex-1" style={{ paddingTop: "2.75rem", paddingBottom: audioVisible ? "10rem" : "3.5rem" }}>
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

      <div
        className="bottom-bar"
        style={{ transform: scrolledDown ? "translateY(100%)" : "translateY(0)", transition: "transform 0.3s ease-in-out" }}
      >
        <button
          onClick={goNext}
          disabled={twoPageMode ? currentPage + 1 >= TOTAL_PAGES : currentPage >= TOTAL_PAGES}
          className="bottom-nav-btn"
          aria-label="Next page"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <span className="text-xs font-medium tabular-nums text-[var(--muted)]">
          {pageLabel} / {TOTAL_PAGES}
        </span>
        <button
          onClick={goPrev}
          disabled={currentPage <= 1}
          className="bottom-nav-btn"
          aria-label="Previous page"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>

      {audioVisible && (
      <div
        className="fixed left-0 right-0 z-20 overflow-hidden"
        style={{ bottom: "2.75rem", transform: scrolledDown ? "translateY(calc(100% + 3rem))" : "translateY(0)", transition: "transform 0.3s ease-in-out" }}
      >
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
      showWordByWord={showWordByWord}
      onToggleWordByWord={toggleWordByWord}
      showSwipeWBW={showSwipeWBW}
      onToggleSwipe={toggleSwipe}
      showTranslation={showTranslation}
      onToggleTranslation={toggleTranslation}
      audioVisible={audioVisible}
      onToggleAudioVisible={() => setAudioVisible((v) => !v)}
      twoPageMode={twoPageMode}
      onToggleTwoPageMode={toggleTwoPageMode}
      mlFontSize={mlFontSize}
      onMlFontSizeChange={setMlFontSize}
      arFontSize={arFontSize}
      onArFontSizeChange={setArFontSize}
      lineHeight={lineHeight}
      onLineHeightChange={setLineHeight}
      surahName={surahName}
      juzNumber={juzNumber}
    />
    </ErrorBoundary>
  );
}
