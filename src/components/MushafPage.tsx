"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { PageLine, loadPageFont, fetchPageData, getCachedPageData, isFontLoaded, SURAH_NAMES, getVocalizedSurahTitle } from "@/lib/qcf4";
import { HighlightWord, JUZ_DATA, toArabicDigits, AudioMode } from "@/lib/types";
import { fetchMalayalamWBW } from "@/lib/malayalam-wbw";
import { fetchTranslationPage } from "@/lib/quran-api";
import { fetchAyahAlignment, fetchPageAlignments, subscribeAlignments, PhraseAlignment } from "@/lib/ar-ml-alignments";
import MadaniFrame from "@/components/MadaniFrame";
import MadaniAyahMarker from "@/components/MadaniAyahMarker";
import MadaniSurahHeader from "@/components/MadaniSurahHeader";

interface MushafPageProps {
  currentPage: number;
  highlightVerseKey: string | null;
  highlightWord: HighlightWord | null;
  onVerseClick?: (verseKey: string) => void;
  showTranslation?: boolean;
  translationMap?: Map<string, string> | null;
  showWordByWord?: boolean;
  onOpenAyahSheet?: (verseKey: string) => void;
  onPlayAyah?: (verseKey: string, mode: AudioMode) => void;
  isSinglePage?: boolean;
  activeAyahSheetKey?: string | null;
  onAyahSheetChange?: (verseKey: string | null) => void;
  hoverDelay?: number;
  hoverFontSize?: number;
}

function getWordGlobalIndex(words: PageLine["words"], verseKey: string, wordIndex: number): number | null {
  for (const word of words) {
    if (word.type === "word" && word.verse_key === verseKey) {
      if (word.position - 1 === wordIndex) {
        return word.code;
      }
    }
  }
  // Fallback to sequential index if position is unavailable
  let quranWordIdx = 0;
  for (const word of words) {
    if (word.type === "word" && word.verse_key === verseKey) {
      if (quranWordIdx === wordIndex) {
        return word.code;
      }
      quranWordIdx++;
    }
  }
  return null;
}

interface WordGroup {
  key: string;
  words: PageLine["words"];
  mlText: string | null;
  verseKey: string | null;
}

function findWbwMeaning(wbwData: Record<string, string[]> | null, verseKey: string, position: number): string | null {
  if (!wbwData) return null;
  const verseWords = wbwData[verseKey];
  if (!verseWords) return null;
  for (let i = position - 1; i >= 0; i--) {
    const ml = verseWords[i];
    if (ml) return ml;
  }
  return null;
}

function getWordMeaning(
  w: PageLine["words"][0],
  wbwData: Record<string, string[]> | null,
  wordByWordMap: Map<number, string>,
  showWordByWord: boolean,
): string | null {
  if (wbwData && w.type === "word" && w.verse_key) {
    return findWbwMeaning(wbwData, w.verse_key, w.position);
  }
  if (showWordByWord) {
    return wordByWordMap.get(w.code) ?? null;
  }
  return null;
}

function findAdjacentWordBundle(
  allWords: PageLine["words"],
  targetCode: number,
  wbwData: Record<string, string[]> | null,
  wordByWordMap: Map<number, string>,
  showWordByWord: boolean,
): { codes: Set<number>; arabicText: string } {
  const idx = allWords.findIndex((w) => w.code === targetCode);
  if (idx === -1) return { codes: new Set([targetCode]), arabicText: "" };

  const targetWord = allWords[idx];
  const ml = getWordMeaning(targetWord, wbwData, wordByWordMap, showWordByWord);
  if (!ml) {
    return {
      codes: new Set([targetCode]),
      arabicText: targetWord.text || targetWord.char || "",
    };
  }

  let startIdx = idx;
  while (startIdx > 0) {
    const prev = allWords[startIdx - 1];
    if (prev.type !== "word" || prev.verse_key !== targetWord.verse_key) break;
    if (getWordMeaning(prev, wbwData, wordByWordMap, showWordByWord) === ml) {
      startIdx--;
    } else {
      break;
    }
  }

  let endIdx = idx;
  while (endIdx < allWords.length - 1) {
    const next = allWords[endIdx + 1];
    if (next.type !== "word" || next.verse_key !== targetWord.verse_key) break;
    if (getWordMeaning(next, wbwData, wordByWordMap, showWordByWord) === ml) {
      endIdx++;
    } else {
      break;
    }
  }

  const codes = new Set<number>();
  const wordsInOrder: PageLine["words"] = [];
  for (let i = startIdx; i <= endIdx; i++) {
    codes.add(allWords[i].code);
    wordsInOrder.push(allWords[i]);
  }

  const arabicText = wordsInOrder
    .map((w) => w.text || w.char)
    .filter(Boolean)
    .join(" ");

  return { codes, arabicText };
}

function findAdjacentGroup(
  allWords: PageLine["words"],
  targetCode: number,
  wbwData: Record<string, string[]> | null,
  wordByWordMap: Map<number, string>,
  showWordByWord: boolean,
): Set<number> {
  return findAdjacentWordBundle(allWords, targetCode, wbwData, wordByWordMap, showWordByWord).codes;
}

function groupWbwWords(
  words: PageLine["words"],
  wbwMap: Map<number, string>,
): WordGroup[] {
  const groups: WordGroup[] = [];
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    if (w.type !== "word") {
      groups.push({ key: `nw-${w.code}`, words: [w], mlText: null, verseKey: null });
      i++;
      continue;
    }
    const ml = wbwMap.get(w.code);
    if (ml) {
      const groupWords: PageLine["words"] = [w];
      let j = i + 1;
      while (
        j < words.length &&
        words[j].type === "word" &&
        words[j].verse_key === w.verse_key &&
        !wbwMap.has(words[j].code)
      ) {
        groupWords.push(words[j]);
        j++;
      }
      const last = groups[groups.length - 1];
      if (last && last.mlText === ml && last.verseKey === w.verse_key) {
        last.words.push(...groupWords);
      } else {
        groups.push({ key: `g-${w.code}`, words: groupWords, mlText: ml, verseKey: w.verse_key ?? null });
      }
      i = j;
    } else {
      groups.push({ key: `s-${w.code}`, words: [w], mlText: null, verseKey: w.verse_key ?? null });
      i++;
    }
  }
  return groups;
}

function MushafPageInner({
  currentPage,
  highlightVerseKey,
  highlightWord,
  onVerseClick,
  showTranslation = false,
  translationMap = null,
  showWordByWord = false,
  onOpenAyahSheet,
  onPlayAyah,
  isSinglePage = false,
  activeAyahSheetKey,
  onAyahSheetChange,
  hoverDelay = 80,
  hoverFontSize = 18,
}: MushafPageProps) {
  const cachedInitial = getCachedPageData(currentPage);
  const [lines, setLines] = useState<PageLine[]>(() => cachedInitial?.lines || []);

  const verseWordsMap = useMemo(() => {
    const map = new Map<string, PageLine["words"]>();
    for (const line of lines) {
      for (const word of line.words) {
        if (word.verse_key) {
          if (!map.has(word.verse_key)) {
            map.set(word.verse_key, []);
          }
          map.get(word.verse_key)!.push(word);
        }
      }
    }
    return map;
  }, [lines]);

  const [loading, setLoading] = useState(() => !cachedInitial);
  const [fontReady, setFontReady] = useState(() => {
    if (!cachedInitial) return false;
    const fonts = new Set<string>();
    if (cachedInitial.font) fonts.add(cachedInitial.font);
    for (const l of cachedInitial.lines || []) {
      for (const w of l.words || []) {
        if (w.font) fonts.add(w.font);
      }
    }
    for (const f of fonts) {
      if (!isFontLoaded(f)) return false;
    }
    return true;
  });
  const [error, setError] = useState<string | null>(null);
  const [wbwData, setWbwData] = useState<Record<string, string[]> | null>(null);
  const [dataLoadingSlow, setDataLoadingSlow] = useState(false);
  const [localAyahSheet, setLocalAyahSheet] = useState<{ verseKey: string } | null>(null);

  const flatWords = useMemo(() => lines.flatMap((l) => l.words), [lines]);

  const wordByWordMap = useMemo(() => {
    if (!showWordByWord || !wbwData || lines.length === 0) return new Map<number, string>();

    const result = new Map<number, string>();
    for (const line of lines) {
      for (const word of line.words) {
        if (word.type !== "word" || !word.verse_key) continue;
        const verseWords = wbwData[word.verse_key];
        if (!verseWords) continue;
        const idx = word.position - 1;
        if (idx >= 0 && idx < verseWords.length) {
          const ml = verseWords[idx];
          if (ml) result.set(word.code, ml);
        }
      }
    }

    return result;
  }, [showWordByWord, wbwData, lines]);

  const [hoverTooltip, setHoverTooltip] = useState<{
    meaning: string;
    arabic?: string;
    verseKey?: string;
    x: number;
    y: number;
    isBelow: boolean;
  } | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const warmResetTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isWarmRef = useRef(false);
  const isPinnedByClickRef = useRef(false);
  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const animFrameRef = useRef<number | null>(null);

  const [hoveredWordCodes, setHoveredWordCodes] = useState<Set<number> | null>(null);

  const computeTooltipCoords = useCallback((clientX: number, clientY: number) => {
    const isBelow = clientY < 90;
    const halfWidth = Math.min(150, Math.floor(window.innerWidth / 2) - 10);
    const clampedX = Math.max(halfWidth, Math.min(window.innerWidth - halfWidth, clientX));
    const y = isBelow ? clientY + 16 : clientY - 8;
    return { x: clampedX, y, isBelow };
  }, []);

  const dismissTooltip = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (warmResetTimerRef.current) clearTimeout(warmResetTimerRef.current);
    setHoverTooltip(null);
    setHoveredWordCodes(null);
    isWarmRef.current = false;
    isPinnedByClickRef.current = false;
  }, []);

  const handleWordClick = useCallback(
    (
      e: React.MouseEvent<HTMLElement>,
      meaning: string | null | undefined,
      wordCode: number,
      fallbackArabic?: string,
      verseKey?: string | null
    ) => {
      e.stopPropagation();
      if (!meaning) return;

      // If already open on this exact word, toggle it off
      if (isPinnedByClickRef.current && hoveredWordCodes?.has(wordCode)) {
        dismissTooltip();
        return;
      }

      if (warmResetTimerRef.current) {
        clearTimeout(warmResetTimerRef.current);
        warmResetTimerRef.current = undefined;
      }
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = undefined;
      }

      const bundle = findAdjacentWordBundle(flatWords, wordCode, wbwData, wordByWordMap, showWordByWord);
      setHoveredWordCodes(bundle.codes);

      const rect = e.currentTarget.getBoundingClientRect();
      const isBelow = rect.top < 90;
      const halfWidth = Math.min(150, Math.floor(window.innerWidth / 2) - 10);
      const centerX = rect.left + rect.width / 2;
      const clampedX = Math.max(halfWidth, Math.min(window.innerWidth - halfWidth, centerX));
      const y = isBelow ? rect.bottom + 12 : rect.top - 8;

      isWarmRef.current = true;
      isPinnedByClickRef.current = true;
      setHoverTooltip({
        meaning,
        arabic: bundle.arabicText || fallbackArabic || undefined,
        verseKey: verseKey || undefined,
        x: clampedX,
        y,
        isBelow,
      });
    },
    [hoveredWordCodes, dismissTooltip, flatWords, wbwData, wordByWordMap, showWordByWord]
  );

  const handleWordMouseEnter = useCallback(
    (
      e: React.MouseEvent<HTMLElement>,
      meaning: string | null | undefined,
      wordCode: number,
      fallbackArabic?: string,
      verseKey?: string | null
    ) => {
      if (!meaning) return;
      if (isPinnedByClickRef.current) {
        if (hoveredWordCodes?.has(wordCode)) {
          return;
        }
        isPinnedByClickRef.current = false;
      }

      lastMousePosRef.current = { x: e.clientX, y: e.clientY };

      if (warmResetTimerRef.current) {
        clearTimeout(warmResetTimerRef.current);
        warmResetTimerRef.current = undefined;
      }
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = undefined;
      }

      const bundle = findAdjacentWordBundle(flatWords, wordCode, wbwData, wordByWordMap, showWordByWord);
      setHoveredWordCodes(bundle.codes);

      const { x, y, isBelow } = computeTooltipCoords(e.clientX, e.clientY);

      const data = {
        meaning,
        arabic: bundle.arabicText || fallbackArabic || undefined,
        verseKey: verseKey || undefined,
        x,
        y,
        isBelow,
      };

      if (isWarmRef.current || hoverDelay === 0) {
        isWarmRef.current = true;
        setHoverTooltip(data);
      } else {
        hoverTimerRef.current = setTimeout(() => {
          isWarmRef.current = true;
          const latestCoords = computeTooltipCoords(lastMousePosRef.current.x, lastMousePosRef.current.y);
          setHoverTooltip({ ...data, ...latestCoords });
        }, hoverDelay);
      }
    },
    [hoverDelay, computeTooltipCoords, flatWords, wbwData, wordByWordMap, showWordByWord, hoveredWordCodes]
  );

  const handleWordMouseMove = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (
        typeof e.movementX === "number" &&
        typeof e.movementY === "number" &&
        (e.movementX !== 0 || e.movementY !== 0)
      ) {
        isPinnedByClickRef.current = false;
      }
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      if (hoverTooltip && !isPinnedByClickRef.current) {
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = requestAnimationFrame(() => {
          const coords = computeTooltipCoords(e.clientX, e.clientY);
          setHoverTooltip((prev) => (prev ? { ...prev, ...coords } : null));
        });
      }
    },
    [hoverTooltip, computeTooltipCoords]
  );

  const handleWordMouseLeave = useCallback(() => {
    if (isPinnedByClickRef.current) return;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = undefined;
    }
    if (warmResetTimerRef.current) {
      clearTimeout(warmResetTimerRef.current);
    }
    warmResetTimerRef.current = setTimeout(() => {
      isWarmRef.current = false;
      setHoverTooltip(null);
      setHoveredWordCodes(null);
    }, 250);
  }, []);

  useEffect(() => {
    const handleDocumentPointer = (e: Event) => {
      const target = e.target as Element | null;
      if (target && !target.closest?.(".mushaf-word") && !target.closest?.(".wbw-group")) {
        dismissTooltip();
      }
    };
    window.addEventListener("scroll", dismissTooltip, { passive: true });
    window.addEventListener("wheel", dismissTooltip, { passive: true });
    document.addEventListener("pointerdown", handleDocumentPointer, { passive: true });
    return () => {
      dismissTooltip();
      window.removeEventListener("scroll", dismissTooltip);
      window.removeEventListener("wheel", dismissTooltip);
      document.removeEventListener("pointerdown", handleDocumentPointer);
    };
  }, [dismissTooltip]);

  const [sheetTranslationMap, setSheetTranslationMap] = useState<Map<string, string> | null>(null);
  const [ayahAlignments, setAyahAlignments] = useState<Record<string, PhraseAlignment[]>>({});
  const [sheetSelectedPositions, setSheetSelectedPositions] = useState<Set<number> | null>(null);

  // If controlled via props (activeAyahSheetKey !== undefined), only open if this page contains this verseKey!
  const currentSheetVk: string | null =
    activeAyahSheetKey !== undefined
      ? activeAyahSheetKey && verseWordsMap.has(activeAyahSheetKey)
        ? activeAyahSheetKey
        : null
      : localAyahSheet?.verseKey ?? null;

  const openAyahSheet = useCallback(
    (verseKey: string) => {
      dismissTooltip();
      if (onAyahSheetChange) {
        onAyahSheetChange(verseKey);
      } else {
        setLocalAyahSheet({ verseKey });
      }
    },
    [onAyahSheetChange, dismissTooltip]
  );

  const closeAyahSheet = useCallback(() => {
    if (onAyahSheetChange) {
      onAyahSheetChange(null);
    } else {
      setLocalAyahSheet(null);
    }
    setSheetSelectedPositions(null);
  }, [onAyahSheetChange]);

  // When uncontrolled and audio plays next ayah, auto-advance local sheet
  useEffect(() => {
    if (activeAyahSheetKey !== undefined) return;
    if (!localAyahSheet || !highlightVerseKey) return;
    if (localAyahSheet.verseKey !== highlightVerseKey && verseWordsMap.has(highlightVerseKey)) {
      setLocalAyahSheet({ verseKey: highlightVerseKey });
      setSheetSelectedPositions(null);
    }
  }, [highlightVerseKey, localAyahSheet, verseWordsMap, activeAyahSheetKey]);

  // When currentSheetVk changes, reset selected word positions
  useEffect(() => {
    setSheetSelectedPositions(null);
  }, [currentSheetVk]);

  // Subscribe to real-time alignments loaded during playback or batch sync
  useEffect(() => {
    return subscribeAlignments((newAlignments) => {
      setAyahAlignments((prev) => ({ ...prev, ...newAlignments }));
    });
  }, []);

  // When viewing/turning page: ONLY load already cached alignments from Supabase (0 Gemini calls!)
  useEffect(() => {
    fetchPageAlignments(currentPage, false).then((res) => {
      if (res && Object.keys(res).length > 0) {
        setAyahAlignments((prev) => ({ ...prev, ...res }));
      }
    });
  }, [currentPage]);

  // When sheet opens: only read from cache without triggering per-ayah Gemini calls
  useEffect(() => {
    if (!currentSheetVk) return;
    const vk = currentSheetVk;
    if (ayahAlignments[vk]) return;

    const [s, a] = vk.split(":").map(Number);
    fetchAyahAlignment(s, a, currentPage, false).then((phrases) => {
      if (phrases && phrases.length > 0) {
        setAyahAlignments((prev) => ({ ...prev, [vk]: phrases }));
      }
    });
  }, [currentSheetVk, ayahAlignments, currentPage]);

  useEffect(() => {
    if (!currentSheetVk) return;
    const vk = currentSheetVk;
    if (translationMap?.get(vk) || sheetTranslationMap?.get(vk)) return;

    let cancelled = false;
    fetchTranslationPage(currentPage)
      .then((map) => {
        if (!cancelled) setSheetTranslationMap(map);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [currentSheetVk, currentPage, translationMap, sheetTranslationMap]);


  useEffect(() => {
    let cancelled = false;
    const cached = getCachedPageData(currentPage);
    if (cached) {
      setLines(cached.lines || []);
      setLoading(false);
      const fonts = new Set<string>();
      if (cached.font) fonts.add(cached.font);
      for (const l of cached.lines || []) {
        for (const w of l.words || []) {
          if (w.font) fonts.add(w.font);
        }
      }
      let allLoaded = true;
      for (const f of fonts) {
        if (!isFontLoaded(f)) {
          allLoaded = false;
          break;
        }
      }
      setFontReady(allLoaded);
      if (!allLoaded) {
        Promise.all([...fonts].map((f) => loadPageFont(f).catch(() => {}))).then(() => {
          if (!cancelled) setFontReady(true);
        });
      }
    } else {
      setLoading(true);
      setFontReady(false);
    }
    setDataLoadingSlow(false);
    setError(null);

    const slowTimer = setTimeout(() => { if (!cancelled) setDataLoadingSlow(true); }, 10000);

    fetchPageData(currentPage)
      .then(async (data) => {
        if (cancelled) return;
        setLines(data.lines || []);
        setLoading(false);

        const fonts = new Set<string>();
        if (data.font) fonts.add(data.font);
        for (const line of data.lines || []) {
          for (const word of line.words || []) {
            if (word.font) fonts.add(word.font);
          }
        }
        await Promise.all([...fonts].map((f) => loadPageFont(f).catch(() => {})));
        if (!cancelled) {
          setFontReady(true);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load page data");
        setLoading(false);
      });

    return () => {
      cancelled = true;
      clearTimeout(slowTimer);
    };
  }, [currentPage]);

  useEffect(() => {
    if (wbwData) return;
    let cancelled = false;
    fetchMalayalamWBW()
      .then((data) => {
        if (!cancelled) setWbwData(data);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [wbwData]);

  const highlightedWordCodes = useMemo(() => {
    if (!highlightWord || lines.length === 0) return null;
    const allWords = flatWords;

    // When explicit wordIndices are provided (e.g. Malayalam spoken clause bundle),
    // highlight all matching Arabic words simultaneously!
    if (highlightWord.wordIndices && highlightWord.wordIndices.length > 0) {
      const codeSet = new Set<number>();
      for (const idx of highlightWord.wordIndices) {
        const code = getWordGlobalIndex(allWords, highlightWord.verseKey, idx);
        if (code !== null) codeSet.add(code);
      }
      if (codeSet.size > 0) return codeSet;
    }

    const targetCode = getWordGlobalIndex(allWords, highlightWord.verseKey, highlightWord.wordIndex);
    if (targetCode === null) return null;

    // When bundle is requested (e.g. Malayalam audio playback), highlight the entire
    // adjacent bundle of Arabic words that share this same meaning!
    if (highlightWord.bundle) {
      return findAdjacentGroup(allWords, targetCode, wbwData, wordByWordMap, showWordByWord);
    }

    return new Set<number>([targetCode]);
  }, [highlightWord, lines, flatWords, wbwData, wordByWordMap, showWordByWord]);


  const verseWordsOrder = useMemo(() => {
    const order: string[] = [];
    const seen = new Set<string>();
    for (const line of lines) {
      for (const word of line.words) {
        if (word.type === "word" && word.verse_key && !seen.has(word.verse_key)) {
          seen.add(word.verse_key);
          order.push(word.verse_key);
        }
      }
    }
    return order;
  }, [lines]);


  const groupedLines = useMemo(() => {
    if (!showWordByWord || wordByWordMap.size === 0) return null;
    return lines.map((line) => ({
      ...line,
      groups: groupWbwWords(line.words, wordByWordMap),
    }));
  }, [showWordByWord, wordByWordMap, lines]);

  const currentJuzObj = useMemo(() => {
    return JUZ_DATA.slice().reverse().find((j) => currentPage >= j.startPage) || JUZ_DATA[0];
  }, [currentPage]);

  const firstVerseKey = useMemo(() => {
    for (const line of lines) {
      for (const w of line.words) {
        if (w.verse_key) return w.verse_key;
      }
    }
    return null;
  }, [lines]);

  const isContentReady = !loading && fontReady && lines.length > 0;

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] px-4">
        <div className="flex flex-col items-center gap-3 text-center max-w-sm">
          <p className="text-sm text-[var(--muted)]">{error}</p>
          <div className="flex gap-2 mt-1">
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-1 text-xs font-medium border border-[var(--border)] rounded-md hover:bg-[var(--surface)] transition-colors"
            >
              Retry
            </button>
            <button
              onClick={() => { window.location.search = "simple=1"; }}
              className="px-3 py-1 text-xs font-medium border border-[var(--border)] rounded-md hover:bg-[var(--surface)] transition-colors"
            >
              Simple mode
            </button>
          </div>
        </div>
      </div>
    );
  }

    const showAyahByAyah = showTranslation && !showWordByWord && translationMap && verseWordsOrder.length > 0;


    const hoverTooltipPortal = typeof document !== "undefined" && hoverTooltip ? createPortal(
      <div
        className={`word-hover-tooltip ${hoverTooltip.isBelow ? "is-below" : "is-above"}`}
        style={{
          left: `${hoverTooltip.x}px`,
          top: `${hoverTooltip.y}px`,
        }}
      >
        <div className="word-hover-tooltip-content">
          <div className="word-hover-tooltip-ml" style={{ fontSize: `${hoverFontSize}px` }}>
            {hoverTooltip.meaning}
          </div>
          {hoverTooltip.arabic && (
            <div className="word-hover-tooltip-ar">
              {hoverTooltip.arabic}
            </div>
          )}
        </div>
      </div>,
      document.body
    ) : null;

    if (showAyahByAyah) {
      return (
        <>
          <div className="mushaf-container">
          {verseWordsOrder.map((vk) => {
            const words = verseWordsMap.get(vk) || [];
            const translation = translationMap.get(vk);
            const isHighlighted = highlightVerseKey === vk;

            return (
              <div
                key={vk}
                className={`verse-block ${isHighlighted ? "verse-block-highlighted" : ""}`}
                onClick={() => onVerseClick?.(vk)}
              >
                <div className="verse-block-arabic">
                  {words.map((w) => {
                    const isWordHighlighted = highlightedWordCodes !== null && highlightedWordCodes.has(w.code) && w.verse_key === vk;

                    const mlTooltip = wbwData && w.type === "word" && w.verse_key
                      ? findWbwMeaning(wbwData, w.verse_key, w.position)
                      : null;

                    if (w.type === "end") {
                      return (
                        <MadaniAyahMarker
                          key={w.code}
                          char={w.char}
                          verseKey={w.verse_key}
                          highlighted={isHighlighted}
                          onClick={() => w.verse_key && onVerseClick?.(w.verse_key)}
                        />
                      );
                    }
                    if (w.type === "surah_header") {
                      return (
                        <MadaniSurahHeader
                          key={w.code}
                          char={w.char}
                          font={w.font}
                          title={w.text}
                        />
                      );
                    }
                    if (w.type === "bismillah") {
                      return (
                        <span key={w.code} className="mushaf-bsml" style={{ fontFamily: `"${w.font}", serif` }}>
                          {w.char}
                        </span>
                      );
                    }

                    const isWordHovered = hoveredWordCodes !== null && hoveredWordCodes.has(w.code);

                    return (
                      <span
                        key={w.code}
                        className={`mushaf-word ${isHighlighted ? "highlighted" : ""} ${isWordHighlighted ? (highlightWord?.bundle ? "word-highlighted-ml" : "word-highlighted") : ""} ${isWordHovered ? "word-hovered" : ""}`}
                        style={{ fontFamily: `"${w.font}", serif` }}
                        onClick={(e) => handleWordClick(e, mlTooltip, w.code, w.text, vk)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          openAyahSheet(vk);
                        }}
                        onMouseEnter={(e) => handleWordMouseEnter(e, mlTooltip, w.code, w.text, vk)}
                        onMouseMove={handleWordMouseMove}
                        onMouseLeave={handleWordMouseLeave}
                      >
                        {w.char}
                      </span>
                    );
                  })}
                </div>
                {translation && (
                  <div className="verse-block-translation" dir="ltr">
                    <span className="verse-block-verse-num">{vk.replace(":", ":")}</span>
                    {translation}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {hoverTooltipPortal}
        </>
      );
    }

    let ayahSheetContent = null;
    if (currentSheetVk) {
      const vk = currentSheetVk;
      const words = verseWordsMap.get(vk)?.filter((w) => w.type === "word") || [];
      const translation = translationMap?.get(vk) || sheetTranslationMap?.get(vk);
      const sheetGroups: { words: typeof words; ml: string | null }[] = [];
      let i = 0;
      while (i < words.length) {
        const w = words[i];
        const ml = wbwData?.[vk]?.[w.position - 1] || null;
        if (ml) {
          const groupWords = [w];
          let j = i + 1;
          while (j < words.length) {
            const nextMl = wbwData?.[vk]?.[words[j].position - 1] || null;
            if (nextMl) break;
            groupWords.push(words[j]);
            j++;
          }
          sheetGroups.push({ words: groupWords, ml });
          i = j;
        } else {
          sheetGroups.push({ words: [w], ml: null });
          i++;
        }
      }
      ayahSheetContent = (
        <div className="ayah-sheet-backdrop" onClick={closeAyahSheet}>
          <div className="ayah-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="ayah-sheet-handle" />
            <button className="ayah-sheet-close" onClick={closeAyahSheet}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="ayah-sheet-header flex items-center justify-between">
              <span className="ayah-sheet-verse-ref">{vk}</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => onPlayAyah ? onPlayAyah(vk, "arabic") : onOpenAyahSheet?.(vk)}
                  className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)]/20 transition-colors"
                  aria-label="Play Arabic audio"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                  </svg>
                  <span>العربية Audio</span>
                </button>
                <button
                  onClick={() => onPlayAyah ? onPlayAyah(vk, "malayalam") : onOpenAyahSheet?.(vk)}
                  className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)]/20 transition-colors"
                  aria-label="Play Malayalam audio"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                  </svg>
                  <span>മലയാളം Audio</span>
                </button>
              </div>
            </div>
            {(() => {
              const effectiveAlignments: { phrase: string; arabicPositions: number[] }[] = (() => {
                if (ayahAlignments[vk] && ayahAlignments[vk].length > 0) {
                  return ayahAlignments[vk];
                }
                if (!translation || words.length === 0) return [];
                const mlTokens = translation.trim().split(/\s+/).filter(Boolean);
                if (mlTokens.length === 0) return [];
                const result: { phrase: string; arabicPositions: number[] }[] = [];
                if (sheetGroups.length > 0) {
                  const tokensPerGroup = mlTokens.length / sheetGroups.length;
                  let startIdx = 0;
                  sheetGroups.forEach((g, gIdx) => {
                    const endIdx = gIdx === sheetGroups.length - 1 ? mlTokens.length : Math.round((gIdx + 1) * tokensPerGroup);
                    const chunk = mlTokens.slice(startIdx, endIdx).join(" ");
                    startIdx = endIdx;
                    if (chunk) {
                      result.push({
                        phrase: chunk,
                        arabicPositions: g.words.map((w) => w.position),
                      });
                    }
                  });
                } else {
                  const tokensPerWord = mlTokens.length / words.length;
                  let startIdx = 0;
                  words.forEach((w, wIdx) => {
                    const endIdx = wIdx === words.length - 1 ? mlTokens.length : Math.round((wIdx + 1) * tokensPerWord);
                    const chunk = mlTokens.slice(startIdx, endIdx).join(" ");
                    startIdx = endIdx;
                    if (chunk) {
                      result.push({
                        phrase: chunk,
                        arabicPositions: [w.position],
                      });
                    }
                  });
                }
                return result;
              })();

              return translation ? (
                <div className="ayah-sheet-translation leading-relaxed" dir="ltr">
                  {effectiveAlignments.length > 0 ? (
                    effectiveAlignments.map((item, idx) => {
                      const positions = Array.isArray(item.arabicPositions) ? item.arabicPositions : [];
                      const activeWordPositions = new Set<number>();
                      if (highlightWord && highlightWord.verseKey === vk) {
                        if (highlightWord.wordIndices && highlightWord.wordIndices.length > 0) {
                          for (const wIdx of highlightWord.wordIndices) activeWordPositions.add(wIdx + 1);
                        } else {
                          activeWordPositions.add(highlightWord.wordIndex + 1);
                        }
                      }
                      const isPosActive = (pos: number) => {
                        if (activeWordPositions.has(pos)) return true;
                        if (sheetSelectedPositions !== null && sheetSelectedPositions.has(pos)) return true;
                        return false;
                      };
                      const isPhraseActive = positions.some((pos) => isPosActive(pos));

                      return (
                        <span
                          key={idx}
                          onClick={() => {
                            if (positions.length === 0) return;
                            setSheetSelectedPositions((prev) => {
                              if (prev && positions.every((pos) => prev.has(pos))) {
                                return null;
                              }
                              return new Set(positions);
                            });
                          }}
                          className={`transition-all duration-150 rounded px-1.5 py-0.5 mx-0.5 inline-block cursor-pointer ${
                            isPhraseActive
                              ? (highlightWord?.bundle
                                  ? "bg-blue-500/25 text-blue-900 dark:text-blue-100 font-semibold ring-1 ring-blue-500/50 shadow-sm"
                                  : "bg-amber-400/35 text-amber-950 dark:text-amber-100 font-semibold ring-1 ring-amber-500/60 shadow-sm")
                              : "hover:bg-amber-500/10 text-[var(--foreground)]"
                          }`}
                          title="Click to highlight corresponding Arabic words"
                        >
                          {item.phrase}
                        </span>
                      );
                    })
                  ) : (
                    translation
                  )}
                </div>
              ) : (
                <div className="ayah-sheet-translation text-[var(--muted)] text-xs italic py-1 animate-pulse" dir="ltr">വിവർത്തനം ലഭ്യമാക്കുന്നു...</div>
              );
            })()}
            <div className="ayah-sheet-divider" />
            <div className="ayah-sheet-words">
              {sheetGroups.map((g, i) => {
                const groupMl = g.ml || findWbwMeaning(wbwData, vk, g.words[g.words.length - 1].position);
                const activeWordPositions = new Set<number>();
                if (highlightWord && highlightWord.verseKey === vk) {
                  if (highlightWord.wordIndices && highlightWord.wordIndices.length > 0) {
                    for (const wIdx of highlightWord.wordIndices) activeWordPositions.add(wIdx + 1);
                  } else {
                    activeWordPositions.add(highlightWord.wordIndex + 1);
                  }
                }
                const isPosActive = (pos: number) => {
                  if (activeWordPositions.has(pos)) return true;
                  if (sheetSelectedPositions !== null && sheetSelectedPositions.has(pos)) return true;
                  return false;
                };
                const wordPositions = g.words.map((w) => w.position);
                const isRowActive = wordPositions.some((pos) => isPosActive(pos));
                const rowActiveClass = isRowActive
                  ? (highlightWord?.bundle ? "ayah-sheet-row-active" : "ayah-sheet-row-active-ar")
                  : "";

                return (
                  <div
                    key={i}
                    onClick={() => {
                      if (wordPositions.length === 0) return;
                      setSheetSelectedPositions((prev) => {
                        if (prev && wordPositions.every((pos) => prev.has(pos))) {
                          return null;
                        }
                        return new Set(wordPositions);
                      });
                    }}
                    className={`ayah-sheet-word-row cursor-pointer ${rowActiveClass}`}
                    title="Click to highlight corresponding Malayalam phrase"
                  >
                    <span className="ayah-sheet-ml">{groupMl || ""}</span>
                    <span className="ayah-sheet-col" />
                    <span className="ayah-sheet-arabic">
                      {[...g.words].reverse().map((gw, j) => (
                        <span key={j} style={{ fontFamily: `"${gw.font}", serif` }}>{gw.char}{j < g.words.length - 1 ? " " : ""}</span>
                      ))}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    const currentSurahNumber = firstVerseKey ? parseInt(firstVerseKey.split(":")[0], 10) : 1;
    const surahHeaderArabic = getVocalizedSurahTitle(currentSurahNumber);
    const juzHeaderArabic = currentJuzObj.name;
    const pageNumberArabic = toArabicDigits(currentPage);
    const isSpecialPage = currentPage === 1 || currentPage === 2;

    return (
    <>
    <div className="madani-mushaf-page-container relative w-full h-full">
      {/* Ornate Madani Frame Layer with authentic white page margins */}
      <MadaniFrame
        isSinglePage={isSinglePage}
        header={
          <div className="madani-header-bar flex items-center justify-between w-full h-full select-none" dir="rtl">
            {/* Authentic Mushaf Layout:
                In RTL:
                - Right Page (Odd): Outer is on RIGHT (Surah), Spine is on LEFT (Juz)
                - Left Page (Even): Spine is on RIGHT (Juz), Outer is on LEFT (Surah) */}
            {currentPage % 2 === 1 ? (
              <>
                <span className="madani-surah-title">{surahHeaderArabic}</span>
                <span className="madani-juz-title">{juzHeaderArabic}</span>
              </>
            ) : (
              <>
                <span className="madani-juz-title">{juzHeaderArabic}</span>
                <span className="madani-surah-title">{surahHeaderArabic}</span>
              </>
            )}
          </div>
        }
        footer={
          <div className="madani-footer-bar flex items-center justify-center w-full h-full select-none">
            <span className="madani-page-number">
              {pageNumberArabic}
            </span>
          </div>
        }
      >
        {loading && lines.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="w-5 h-5 border-2 border-[#C59B27] border-t-transparent rounded-full animate-spin opacity-40" />
          </div>
        )}
        <div
          className={`mushaf-container ${isSpecialPage ? "special-page" : ""}`}
        >
          {groupedLines
            ? groupedLines.map((line) => {
              const isSurahHeader = line.words.some((w) => w.type === "surah_header");
              const isBismillah = line.words.some((w) => w.type === "bismillah");
              const isShortEndLine = line.words.length <= 5 && line.words.some((w) => w.type === "end");
              const isCentered = isSpecialPage || isSurahHeader || isBismillah || isShortEndLine;

              return (
                <div
                  key={line.line}
                  className={`mushaf-line wbw-active ${isCentered ? "mushaf-line-centered" : ""} ${isSurahHeader ? "mushaf-line-surah-header" : ""}`}
                >
                  {line.groups.map((group) => {
                    if (group.mlText) {
                        const isGroupActive =
                          highlightedWordCodes !== null &&
                          group.words.some((w) => highlightedWordCodes.has(w.code));
                        const groupHClass = isGroupActive
                          ? (highlightWord?.bundle ? "wbw-group-ml-highlighted" : "wbw-group-ar-highlighted")
                          : "";

                        const isGroupHovered = hoveredWordCodes !== null && group.words.some((w) => hoveredWordCodes.has(w.code));

                        return (
                        <span key={group.key} className={`wbw-group ${isGroupHovered ? "wbw-group-hovered" : ""} ${groupHClass}`}>
                          <span className="wbw-words-row">
                            {group.words.map((w) => {
                              const isVH = highlightVerseKey !== null && w.verse_key === highlightVerseKey;
                              const isWH = highlightedWordCodes !== null && highlightedWordCodes.has(w.code);
                              const wordHClass = isWH ? (highlightWord?.bundle ? "word-highlighted-ml" : "word-highlighted") : "";
                              const isWordHovered = hoveredWordCodes !== null && hoveredWordCodes.has(w.code);
                              return (
                                <span
                                  key={w.code}
                                  className={`mushaf-word ${isVH ? "highlighted" : ""} ${wordHClass} ${isWordHovered ? "word-hovered" : ""}`}
                                  style={{ fontFamily: `"${w.font}", serif` }}
                                  onClick={(e) => handleWordClick(e, group.mlText, w.code, w.text, w.verse_key)}
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    if (w.verse_key) openAyahSheet(w.verse_key);
                                  }}
                                  onMouseEnter={(e) => handleWordMouseEnter(e, group.mlText, w.code, w.text, w.verse_key)}
                                  onMouseMove={handleWordMouseMove}
                                  onMouseLeave={handleWordMouseLeave}
                                >
                                  {w.char}
                                </span>
                              );
                            })}
                          </span>
                          <span className="wbw-ml">{group.mlText}</span>
                        </span>
                        );
                    }
                    const w = group.words[0];
                    const isVerseHighlighted = highlightVerseKey !== null && w.verse_key === highlightVerseKey;
                    const isWordHighlighted = highlightedWordCodes !== null && highlightedWordCodes.has(w.code);


                    if (w.type === "end") {
                      return (
                        <MadaniAyahMarker
                          key={w.code}
                          char={w.char}
                          verseKey={w.verse_key}
                          highlighted={isVerseHighlighted}
                          onClick={() => w.verse_key && onVerseClick?.(w.verse_key)}
                        />
                      );
                    }

                    if (w.type === "surah_header") {
                      return (
                        <MadaniSurahHeader
                          key={w.code}
                          char={w.char}
                          font={w.font}
                          title={w.text}
                        />
                      );
                    }

                    if (w.type === "bismillah") {
                      return (
                        <span key={w.code} className="mushaf-bsml" style={{ fontFamily: `"${w.font}", serif` }}>
                          {w.char}
                        </span>
                      );
                    }

                    const mlText = w.verse_key ? findWbwMeaning(wbwData, w.verse_key, w.position) : null;
                    const isWordHovered = hoveredWordCodes !== null && hoveredWordCodes.has(w.code);

                    return (
                      <span
                        key={w.code}
                        className={`mushaf-word ${isVerseHighlighted ? "highlighted" : ""} ${isWordHighlighted ? (highlightWord?.bundle ? "word-highlighted-ml" : "word-highlighted") : ""} ${isWordHovered ? "word-hovered" : ""}`}
                        style={{ fontFamily: `"${w.font}", serif` }}
                        onClick={(e) => handleWordClick(e, mlText, w.code, w.text, w.verse_key)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          if (w.verse_key) openAyahSheet(w.verse_key);
                        }}
                        onMouseEnter={(e) => handleWordMouseEnter(e, mlText, w.code, w.text, w.verse_key)}
                        onMouseMove={handleWordMouseMove}
                        onMouseLeave={handleWordMouseLeave}
                      >
                        {w.char}
                      </span>
                    );
                  })}
                </div>
              );
            })
            : lines.map((line) => {
              const isSurahHeader = line.words.some((w) => w.type === "surah_header");
              const isBismillah = line.words.some((w) => w.type === "bismillah");
              const isShortEndLine = line.words.length <= 5 && line.words.some((w) => w.type === "end");
              const isCentered = isSpecialPage || isSurahHeader || isBismillah || isShortEndLine;

              return (
                <div
                  key={line.line}
                  className={`mushaf-line ${showWordByWord && wordByWordMap.size > 0 ? "wbw-active" : ""} ${isCentered ? "mushaf-line-centered" : ""} ${isSurahHeader ? "mushaf-line-surah-header" : ""}`}
                >
                  {line.words.map((word) => {
                    const isVerseHighlighted = highlightVerseKey !== null && word.verse_key === highlightVerseKey;
                    const isWordHighlighted = highlightedWordCodes !== null && highlightedWordCodes.has(word.code);


                    if (word.type === "end") {
                      return (
                        <MadaniAyahMarker
                          key={word.code}
                          char={word.char}
                          verseKey={word.verse_key}
                          highlighted={isVerseHighlighted}
                          onClick={() => word.verse_key && onVerseClick?.(word.verse_key)}
                        />
                      );
                    }

                    if (word.type === "surah_header") {
                      return (
                        <MadaniSurahHeader
                          key={word.code}
                          char={word.char}
                          font={word.font}
                          title={word.text}
                        />
                      );
                    }

                    if (word.type === "bismillah") {
                      return (
                        <span key={word.code} className="mushaf-bsml" style={{ fontFamily: `"${word.font}", serif` }}>
                          {word.char}
                        </span>
                      );
                    }

                    const mlText = showWordByWord ? wordByWordMap.get(word.code) : undefined;
                    const mlTooltip = wbwData && word.type === "word" && word.verse_key
                      ? findWbwMeaning(wbwData, word.verse_key, word.position)
                      : null;
                    const isWordHovered = hoveredWordCodes !== null && hoveredWordCodes.has(word.code);

                    return (
                      <span
                        key={word.code}
                        className={`mushaf-word ${isVerseHighlighted ? "highlighted" : ""} ${isWordHighlighted ? (highlightWord?.bundle ? "word-highlighted-ml" : "word-highlighted") : ""} ${showWordByWord && mlText ? "wbw-enabled" : ""} ${isWordHovered ? "word-hovered" : ""}`}
                        style={{ fontFamily: `"${word.font}", serif` }}
                        onClick={(e) => handleWordClick(e, mlTooltip, word.code, word.text, word.verse_key)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          if (word.verse_key) openAyahSheet(word.verse_key);
                        }}
                        onMouseEnter={(e) => handleWordMouseEnter(e, mlTooltip, word.code, word.text, word.verse_key)}
                        onMouseMove={handleWordMouseMove}
                        onMouseLeave={handleWordMouseLeave}
                      >
                        {word.char}
                        {mlText && <span className="wbw-ml">{mlText}</span>}
                      </span>
                    );
                  })}
                </div>
              );
            })}
        </div>
      </MadaniFrame>
    </div>

    {typeof document !== "undefined" && ayahSheetContent ? createPortal(ayahSheetContent, document.body) : null}
    {hoverTooltipPortal}
    </>
  );
}

const MushafPage = React.memo(MushafPageInner, (prev, next) => {
  const sameHighlight =
    prev.highlightWord === next.highlightWord ||
    (prev.highlightWord?.wordIndex === next.highlightWord?.wordIndex &&
      prev.highlightWord?.verseKey === next.highlightWord?.verseKey &&
      prev.highlightWord?.bundle === next.highlightWord?.bundle &&
      prev.highlightWord?.wordIndices?.join(",") === next.highlightWord?.wordIndices?.join(","));

  return (
    prev.currentPage === next.currentPage &&
    prev.isSinglePage === next.isSinglePage &&
    prev.showTranslation === next.showTranslation &&
    prev.showWordByWord === next.showWordByWord &&
    prev.highlightVerseKey === next.highlightVerseKey &&
    prev.activeAyahSheetKey === next.activeAyahSheetKey &&
    prev.hoverDelay === next.hoverDelay &&
    prev.hoverFontSize === next.hoverFontSize &&
    sameHighlight &&
    (prev.showTranslation ? prev.translationMap === next.translationMap : true)
  );
});
export default MushafPage;