"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import MushafPage from "@/components/MushafPage";
import AudioPlayer from "@/components/AudioPlayer";
import Sidebar from "@/components/Sidebar";
import { Reciter, RECITERS, TOTAL_PAGES, HighlightWord, AudioMode, RepeatMode } from "@/lib/types";
import { fetchPage, fetchTranslationPage } from "@/lib/quran-api";
import { preloadNeighborPages } from "@/lib/qcf4";
import { PageData as ApiPageData } from "@/lib/types";
import ErrorBoundary from "@/components/ErrorBoundary";
import QuranPage from "@/components/QuranPage";
import SwipeWBWView from "@/components/SwipeWBWView";
import PageFlipBook from "@/components/PageFlipBook";
import GeminiToast from "@/components/GeminiToast";
import ShortcutLegend from "@/components/ShortcutLegend";

export default function Home() {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageData, setPageData] = useState<ApiPageData | null>(null);
  const [pageDataRight, setPageDataRight] = useState<ApiPageData | null>(null);
  const [, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [simpleMode, setSimpleMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [reciter, setReciter] = useState<Reciter>(RECITERS[0]);
  const [theme, setTheme] = useState<"light" | "creme" | "dark">("light");
  const [retryCount, setRetryCount] = useState(0);
  const [highlightVerseKey, setHighlightVerseKey] = useState<string | null>(null);
  const [highlightWord, setHighlightWord] = useState<HighlightWord | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [showWordByWord, setShowWordByWord] = useState(false);
  const [translationMap, setTranslationMap] = useState<Map<string, string> | null>(null);
  const [translationMapRight, setTranslationMapRight] = useState<Map<string, string> | null>(null);
  const [audioMode, setAudioMode] = useState<AudioMode>("arabic");
  const [twoPageMode, setTwoPageMode] = useState(() => {
    if (typeof window === "undefined") return false;
    const isDesktop = !/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) && window.innerWidth >= 768;
    try {
      const saved = localStorage.getItem("quran-two-page-mode");
      if (saved !== null) return saved === "true";
      return isDesktop;
    } catch {
      return isDesktop;
    }
  });
  const [isMobileScreen, setIsMobileScreen] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  });
  const [mlFontSize, setMlFontSize] = useState(100);
  const [arFontSize, setArFontSize] = useState(100);
  const [showSwipeWBW, setShowSwipeWBW] = useState(false);
  const [currentAyahIndex, setCurrentAyahIndex] = useState(0);
  const [audioVisible, setAudioVisible] = useState(true);
  const [lineHeight, setLineHeight] = useState(100);
  const [playerArabicPlaybackRate, setPlayerArabicPlaybackRate] = useState(1);
  const [playerMalayalamPlaybackRate, setPlayerMalayalamPlaybackRate] = useState(1);
  const [playerRepeatMode, setPlayerRepeatMode] = useState<RepeatMode>("none");
  const [playMalayalamRequest, setPlayMalayalamRequest] = useState<{ verseKey: string; mode?: AudioMode; timestamp: number } | null>(null);
  const [activeAyahSheetKey, setActiveAyahSheetKey] = useState<string | null>(null);
  const [hoverDelay, setHoverDelay] = useState(80);
  const [hoverFontSize, setHoverFontSize] = useState(18);

  const handleArabicPlaybackRateChange = useCallback((rate: number) => {
    setPlayerArabicPlaybackRate(rate);
    try { localStorage.setItem("quran-playback-rate-arabic", rate.toString()); } catch {}
  }, []);

  const handleMalayalamPlaybackRateChange = useCallback((rate: number) => {
    setPlayerMalayalamPlaybackRate(rate);
    try { localStorage.setItem("quran-playback-rate-malayalam", rate.toString()); } catch {}
  }, []);

  const handleRepeatModeChange = useCallback((mode: RepeatMode) => {
    setPlayerRepeatMode(mode);
    try { localStorage.setItem("quran-repeat-mode", mode); } catch {}
  }, []);

  const handleHoverDelayChange = useCallback((delay: number) => {
    setHoverDelay(delay);
    try {
      localStorage.setItem("quran-hover-delay", delay.toString());
    } catch {}
  }, []);

  const handleHoverFontSizeChange = useCallback((size: number) => {
    setHoverFontSize(size);
    try {
      localStorage.setItem("quran-hover-size", size.toString());
    } catch {}
  }, []);

  // Two-page spread is strictly disabled on mobile devices / screens (< 768px)
  const effectiveTwoPageMode = twoPageMode && !isMobileScreen;

  const handleOpenAyahSheet = useCallback((verseKey: string) => {
    setActiveAyahSheetKey(verseKey);
  }, []);

  const handlePlayAyah = useCallback((verseKey: string, mode: AudioMode) => {
    setAudioMode(mode);
    setPlayMalayalamRequest({ verseKey, mode, timestamp: Date.now() });
    setActiveAyahSheetKey(verseKey);
  }, []);

  useEffect(() => {
    const checkMobile = () => {
      const isMobile = window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      setIsMobileScreen(isMobile);
      if (!isMobile) {
        try {
          const saved = localStorage.getItem("quran-two-page-mode");
          if (saved === null) {
            setTwoPageMode(true);
          }
        } catch {}
      }
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const urlPage = parseInt(searchParams.get("page") || "");
      const savedPage = parseInt(localStorage.getItem("quran-page") || "1");
      const targetPage = (!isNaN(urlPage) && urlPage >= 1 && urlPage <= TOTAL_PAGES) ? urlPage : savedPage;
      if (targetPage >= 1 && targetPage <= TOTAL_PAGES) setCurrentPage(targetPage);
      const savedTheme = localStorage.getItem("quran-theme") as "light" | "creme" | "dark" | null;
      if (savedTheme && ["light", "creme", "dark"].includes(savedTheme)) {
        setTheme(savedTheme);
      } else {
        // Light theme is the default enabled
        setTheme("light");
      }
      const savedTranslation = localStorage.getItem("quran-show-translation");
      if (savedTranslation === "true") setShowTranslation(true);
      const savedWordByWord = localStorage.getItem("quran-show-word-by-word");
      if (savedWordByWord === "true") setShowWordByWord(true);
      const savedSwipeWBW = localStorage.getItem("quran-show-swipe-wbw");
      if (savedSwipeWBW === "true") setShowSwipeWBW(true);

      const isDesktop = !/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) && window.innerWidth >= 768;
      const savedTwoPage = localStorage.getItem("quran-two-page-mode");
      const shouldEnableTwoPage = savedTwoPage !== null ? savedTwoPage === "true" : isDesktop;
      if (shouldEnableTwoPage) {
        setTwoPageMode(true);
        if (targetPage % 2 === 0 && isDesktop) {
          setCurrentPage(Math.max(1, targetPage - 1));
        }
      } else {
        setTwoPageMode(false);
      }
      const savedMlSize = parseInt(localStorage.getItem("quran-ml-font-size") || "100");
      if (savedMlSize >= 60 && savedMlSize <= 200) setMlFontSize(savedMlSize);
      const savedArSize = parseInt(localStorage.getItem("quran-ar-font-size") || "100");
      if (savedArSize >= 60 && savedArSize <= 200) setArFontSize(savedArSize);
      const savedLineHeight = parseInt(localStorage.getItem("quran-line-height") || "100");
      if (savedLineHeight >= 60 && savedLineHeight <= 200) setLineHeight(savedLineHeight);
      const savedReciterId = localStorage.getItem("quran-reciter");
      if (savedReciterId) {
        const found = RECITERS.find((r) => r.id === savedReciterId);
        if (found) setReciter(found);
      }
      const savedArabicRate = parseFloat(localStorage.getItem("quran-playback-rate-arabic") || localStorage.getItem("quran-playback-rate") || "1");
      if ([1, 1.25, 1.5, 2].includes(savedArabicRate)) setPlayerArabicPlaybackRate(savedArabicRate);
      const savedMalayalamRate = parseFloat(localStorage.getItem("quran-playback-rate-malayalam") || localStorage.getItem("quran-playback-rate") || "1");
      if ([1, 1.25, 1.5, 2].includes(savedMalayalamRate)) setPlayerMalayalamPlaybackRate(savedMalayalamRate);
      const savedRepeatMode = localStorage.getItem("quran-repeat-mode") as RepeatMode | null;
      if (savedRepeatMode && ["none", "ayah", "page"].includes(savedRepeatMode)) setPlayerRepeatMode(savedRepeatMode);
      const savedHoverDelay = localStorage.getItem("quran-hover-delay");
      if (savedHoverDelay !== null) {
        const parsed = parseInt(savedHoverDelay, 10);
        if (!isNaN(parsed) && [0, 80, 200].includes(parsed)) setHoverDelay(parsed);
      }
      const savedHoverSize = localStorage.getItem("quran-hover-size");
      if (savedHoverSize !== null) {
        const parsed = parseInt(savedHoverSize, 10);
        if (!isNaN(parsed) && [14, 18, 22].includes(parsed)) setHoverFontSize(parsed);
      }
    } catch {
      /* localStorage unavailable (e.g. Safari private) */
    }
  }, []);

  useEffect(() => {
    preloadNeighborPages(currentPage);
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
          if (simpleMode) {
            window.scrollTo({ top: 0, behavior: "smooth" });
          }
        }
      } catch (e) {
        if (!cancelled) {
          const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
          setError(isOffline
            ? "Offline — this page hasn't been downloaded yet. Open Menu → Settings → Downloads to download pages for offline use."
            : "പേജ് ലോഡ് ചെയ്യാൻ കഴിഞ്ഞില്ല");
          setPageData(null);
          setLoading(false);
        }
      }

      if (effectiveTwoPageMode && currentPage + 1 <= TOTAL_PAGES) {
        fetchPage(currentPage + 1)
          .then((rightData) => {
            if (!cancelled) setPageDataRight(rightData);
          })
          .catch(() => {
            if (!cancelled) setPageDataRight(null);
          });
      } else {
        setPageDataRight(null);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [currentPage, retryCount, effectiveTwoPageMode]);

  useEffect(() => {
    let cancelled = false;

    fetchTranslationPage(currentPage)
      .then((map) => {
        if (!cancelled) setTranslationMap(map);
      })
      .catch(() => {
        if (!cancelled) setTranslationMap(null);
      });

    if (effectiveTwoPageMode && currentPage + 1 <= TOTAL_PAGES) {
      fetchTranslationPage(currentPage + 1)
        .then((map) => {
          if (!cancelled) setTranslationMapRight(map);
        })
        .catch(() => {
          if (!cancelled) setTranslationMapRight(null);
        });
    }

    return () => { cancelled = true; };
  }, [currentPage, effectiveTwoPageMode]);

  useEffect(() => {
    document.documentElement.classList.remove("dark", "creme");
    if (theme !== "light") document.documentElement.classList.add(theme);
    try { localStorage.setItem("quran-theme", theme); } catch {}
  }, [theme]);

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
    try { localStorage.setItem("quran-reciter", reciter.id); } catch {}
  }, [reciter]);

  useEffect(() => {
    try {
      localStorage.setItem("quran-playback-rate-arabic", playerArabicPlaybackRate.toString());
      localStorage.setItem("quran-playback-rate", playerArabicPlaybackRate.toString());
    } catch {}
  }, [playerArabicPlaybackRate]);

  useEffect(() => {
    try {
      localStorage.setItem("quran-playback-rate-malayalam", playerMalayalamPlaybackRate.toString());
    } catch {}
  }, [playerMalayalamPlaybackRate]);

  useEffect(() => {
    try { localStorage.setItem("quran-repeat-mode", playerRepeatMode); } catch {}
  }, [playerRepeatMode]);

  useEffect(() => {
    setCurrentAyahIndex(0);
    if (showSwipeWBW) setAudioVisible(false);
  }, [currentPage, showSwipeWBW]);

  const toggleTranslation = useCallback(() => {
    setShowTranslation((prev) => {
      const next = !prev;
      try { localStorage.setItem("quran-show-translation", next.toString()); } catch {}
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
    if (isMobileScreen) return;
    setTwoPageMode((prev) => {
      const next = !prev;
      try { localStorage.setItem("quran-two-page-mode", next.toString()); } catch {}
      if (next) {
        setCurrentPage((p) => (p % 2 === 0 ? p - 1 : p));
      }
      return next;
    });
  }, [isMobileScreen]);

  const goToPage = useCallback((page: number) => {
    if (page >= 1 && page <= TOTAL_PAGES) {
      setHighlightVerseKey(null);
      setHighlightWord(null);
      setCurrentPage(effectiveTwoPageMode ? (page % 2 === 0 ? page - 1 : page) : page);
    }
  }, [effectiveTwoPageMode]);

  const goNext = useCallback(() => {
    setHighlightVerseKey(null);
    setHighlightWord(null);
    setCurrentPage((prev) => {
      const step = effectiveTwoPageMode ? 2 : 1;
      return prev + step <= TOTAL_PAGES ? prev + step : prev;
    });
  }, [effectiveTwoPageMode]);

  const goPrev = useCallback(() => {
    setHighlightVerseKey(null);
    setHighlightWord(null);
    setCurrentPage((prev) => {
      const step = effectiveTwoPageMode ? 2 : 1;
      return prev - step >= 1 ? prev - step : prev;
    });
  }, [effectiveTwoPageMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrev]);

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (effectiveTwoPageMode) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      // In RTL (Arabic Mushaf), swiping right turns the page forward (increases page)
      if (dx > 0) goNext();
      else goPrev();
    }
  }, [effectiveTwoPageMode, goNext, goPrev]);

  const handleVerseChange = useCallback((key: string | null) => {
    setHighlightVerseKey(key);
    if (key) {
      setActiveAyahSheetKey((prev) => (prev !== null ? key : null));
    }
  }, []);

  const ayahs = useMemo(() => {
    const leftAyahs = pageData?.ayahs || [];
    const rightAyahs = pageDataRight?.ayahs;
    if (!effectiveTwoPageMode || !rightAyahs) return leftAyahs;
    return [...leftAyahs, ...rightAyahs];
  }, [effectiveTwoPageMode, pageData?.ayahs, pageDataRight?.ayahs]);

  const surahName = pageData?.ayahs[0]?.surah.englishName;
  const juzNumber = pageData?.ayahs[0]?.juz;

  const pageLabel = effectiveTwoPageMode && currentPage + 1 <= TOTAL_PAGES
    ? `${currentPage}–${currentPage + 1}`
    : `${currentPage}`;

  const handleVerseClick = useCallback((key: string) => {
    setHighlightVerseKey((prev) => (prev === key ? null : key));
  }, []);

  const renderMushafPage = useCallback(
    (pageNum: number, isSingle: boolean = !effectiveTwoPageMode) => (
      <MushafPage
        key={`${pageNum}-${isSingle ? "single" : "double"}`}
        currentPage={pageNum}
        isSinglePage={isSingle}
        highlightVerseKey={highlightVerseKey}
        highlightWord={highlightWord}
        onVerseClick={handleVerseClick}
        showTranslation={showTranslation}
        translationMap={pageNum === currentPage ? translationMap : translationMapRight}
        showWordByWord={showWordByWord}
        onOpenAyahSheet={handleOpenAyahSheet}
        onPlayAyah={handlePlayAyah}
        activeAyahSheetKey={activeAyahSheetKey}
        onAyahSheetChange={setActiveAyahSheetKey}
        hoverDelay={hoverDelay}
        hoverFontSize={hoverFontSize}
      />
    ),
    [
      effectiveTwoPageMode,
      highlightVerseKey,
      highlightWord,
      handleVerseClick,
      showTranslation,
      currentPage,
      translationMap,
      translationMapRight,
      showWordByWord,
      handleOpenAyahSheet,
      handlePlayAyah,
      activeAyahSheetKey,
      hoverDelay,
      hoverFontSize,
    ]
  );

  const isMushafMode = !showSwipeWBW && !simpleMode && (!showTranslation || showWordByWord);

  return (
    <ErrorBoundary>
    <div className="mobile-layout">
      <header
        className="mobile-header border-b border-[var(--border)] bg-[var(--background)]/85 backdrop-blur-md z-30"
        style={{
          position: "sticky",
          top: 0,
          left: 0,
          right: 0,
        }}
      >
        <div className="max-w-4xl mx-auto px-4 h-10 grid grid-cols-[auto_1fr_auto] items-center">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg hover:bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            aria-label="Open menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>

          <h1 className="text-xs font-semibold tracking-wider uppercase text-center">
            Quran <span className="font-normal text-[var(--muted)] lowercase">Easy Malayalam</span>
          </h1>

          <div className="flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-4 h-4 text-[var(--muted)]" aria-label={currentPage % 2 === 1 ? "Right page (Page " + currentPage + ")" : "Left page (Page " + currentPage + ")"}>
              <title>{currentPage % 2 === 1 ? `Right page (Page ${currentPage})` : `Left page (Page ${currentPage})`}</title>
              <path d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" fill="none" stroke="currentColor" strokeWidth={1.25} />
              <line x1="12" y1="4" x2="12" y2="20" stroke="currentColor" strokeWidth={1} strokeDasharray="2 1.5" opacity={0.5} />
              {currentPage % 2 === 1 ? (
                /* Odd page: Right page in RTL */
                <path d="M12 6.042a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292V6.042Z" fill="currentColor" />
              ) : (
                /* Even page: Left page in RTL */
                <path d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292V6.042Z" fill="currentColor" />
              )}
            </svg>
            <button
              onClick={() => setTheme((t) => t === "light" ? "creme" : t === "creme" ? "dark" : "light")}
              className="p-1.5 rounded-lg hover:bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
              title={`Theme: ${theme === "light" ? "Light" : theme === "creme" ? "Parchment" : "Dark"}`}
              aria-label="Toggle theme"
            >
            {theme === "dark" ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-amber-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
              </svg>
            ) : theme === "creme" ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-amber-700">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
              </svg>
            )}
          </button>
          </div>
        </div>
      </header>

      <main
        className={`mobile-content ${isMushafMode ? "mushaf-mode" : ""}`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="w-full h-full flex-1 flex flex-col justify-center items-center min-h-0" style={{ display: simpleMode ? "none" : "flex" }}>
          <div style={{ display: showSwipeWBW ? "block" : "none" }}>
            <SwipeWBWView
              ayahs={ayahs}
              currentPage={currentPage}
              mlFontSize={mlFontSize}
              currentAyahIndex={currentAyahIndex}
              onAyahIndexChange={setCurrentAyahIndex}
              translationMap={translationMap}
              highlightVerseKey={highlightVerseKey}
              highlightWord={highlightWord}
            />
          </div>
          {!showSwipeWBW && (
            effectiveTwoPageMode ? (
              <PageFlipBook
                currentPage={currentPage}
                twoPageMode={true}
                onPageChange={goToPage}
                renderPage={(p) => renderMushafPage(p, false)}
              />
            ) : (
              <div className="quran-single-page-wrapper">
                <div className="quran-single-page-container">
                  {renderMushafPage(currentPage, true)}
                </div>
              </div>
            )
          )}
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
        className="mobile-player"
        style={{
          display: audioVisible ? "block" : "none",
        }}
      >
        <AudioPlayer
          ayahs={ayahs}
          reciter={reciter}
          onReciterChange={setReciter}
          onVerseChange={handleVerseChange}
          onWordHighlight={(word) => setHighlightWord(word)}
          audioMode={audioMode}
          onAudioModeChange={setAudioMode}
          highlightVerseKey={highlightVerseKey}
          compact={true}
          pageLabel={pageLabel}
          currentPage={currentPage}
          onGoNext={goNext}
          onGoPrev={goPrev}
          onPageComplete={goNext}
          canGoNext={effectiveTwoPageMode ? currentPage + 1 < TOTAL_PAGES : currentPage < TOTAL_PAGES}
          canGoPrev={currentPage > 1}
          arabicPlaybackRate={playerArabicPlaybackRate}
          onArabicPlaybackRateChange={handleArabicPlaybackRateChange}
          malayalamPlaybackRate={playerMalayalamPlaybackRate}
          onMalayalamPlaybackRateChange={handleMalayalamPlaybackRateChange}
          repeatMode={playerRepeatMode}
          onRepeatModeChange={handleRepeatModeChange}
          playRequest={playMalayalamRequest}
        />
      </div>

      <ShortcutLegend audioVisible={audioVisible} />

      <div
        className="bottom-bar"
        style={{ display: audioVisible ? "none" : "flex" }}
      >
        <button
          onClick={goNext}
          disabled={effectiveTwoPageMode ? currentPage + 1 >= TOTAL_PAGES : currentPage >= TOTAL_PAGES}
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
    </div>

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
      twoPageMode={effectiveTwoPageMode}
      disableTwoPageMode={isMobileScreen}
      onToggleTwoPageMode={toggleTwoPageMode}
      mlFontSize={mlFontSize}
      onMlFontSizeChange={setMlFontSize}
      arFontSize={arFontSize}
      onArFontSizeChange={setArFontSize}
      lineHeight={lineHeight}
      onLineHeightChange={setLineHeight}
      surahName={surahName}
      juzNumber={juzNumber}
      reciter={reciter}
      onReciterChange={setReciter}
      theme={theme}
      onThemeChange={setTheme}
      hoverDelay={hoverDelay}
      onHoverDelayChange={handleHoverDelayChange}
      hoverFontSize={hoverFontSize}
      onHoverFontSizeChange={handleHoverFontSizeChange}
    />
    <GeminiToast />
    </ErrorBoundary>
  );
}
