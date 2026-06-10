"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { PageLine, loadPageFont } from "@/lib/qcf4";
import { HighlightWord } from "@/lib/types";
import { fetchMalayalamWBW } from "@/lib/malayalam-wbw";

interface MushafPageProps {
  currentPage: number;
  highlightVerseKey: string | null;
  highlightWord: HighlightWord | null;
  onVerseClick?: (verseKey: string) => void;
  showTranslation?: boolean;
  translationMap?: Map<string, string> | null;
  showWordByWord?: boolean;
}

function getWordGlobalIndex(words: PageLine["words"], verseKey: string, wordIndex: number): number | null {
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
  if (showWordByWord) {
    return wordByWordMap.get(w.code) ?? null;
  }
  return wbwData && w.type === "word" && w.verse_key
    ? findWbwMeaning(wbwData, w.verse_key, w.position)
    : null;
}

function findAdjacentGroup(
  allWords: PageLine["words"],
  tappedCode: number,
  wbwData: Record<string, string[]> | null,
  wordByWordMap: Map<number, string>,
  showWordByWord: boolean,
): Set<number> {
  const idx = allWords.findIndex((w) => w.code === tappedCode);
  if (idx === -1) return new Set([tappedCode]);

  const tappedMl = getWordMeaning(allWords[idx], wbwData, wordByWordMap, showWordByWord);
  if (!tappedMl) return new Set([tappedCode]);

  const group = new Set<number>([tappedCode]);
  for (let i = idx - 1; i >= 0; i--) {
    const w = allWords[i];
    if (w.type !== "word") break;
    if (getWordMeaning(w, wbwData, wordByWordMap, showWordByWord) === tappedMl) {
      group.add(w.code);
    } else {
      break;
    }
  }
  for (let i = idx + 1; i < allWords.length; i++) {
    const w = allWords[i];
    if (w.type !== "word") break;
    if (getWordMeaning(w, wbwData, wordByWordMap, showWordByWord) === tappedMl) {
      group.add(w.code);
    } else {
      break;
    }
  }
  return group;
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

export default function MushafPage({ currentPage, highlightVerseKey, highlightWord, onVerseClick, showTranslation = false, translationMap = null, showWordByWord = false }: MushafPageProps) {
  const [lines, setLines] = useState<PageLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [wbwData, setWbwData] = useState<Record<string, string[]> | null>(null);
  const [wordPopover, setWordPopover] = useState<{ text: string; verseKey: string; el: Element } | null>(null);
  const popoverTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const ttsAudioRef = useRef<HTMLAudioElement>(null);
  const [dataLoadingSlow, setDataLoadingSlow] = useState(false);
  const [ayahSheet, setAyahSheet] = useState<{ verseKey: string } | null>(null);
  const [tappedWordCodes, setTappedWordCodes] = useState<Set<number> | null>(null);
  const tappedTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const dismissPopover = useCallback(() => {
    setWordPopover(null);
    setTappedWordCodes(null);
    clearTimeout(popoverTimeoutRef.current);
    clearTimeout(tappedTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (!wordPopover) return;
    const handler = (e: Event) => {
      const target = e.target as Element;
      if (!target.closest?.(".mushaf-word") && !target.closest?.(".word-popover")) dismissPopover();
    };
    const scrollHandler = () => dismissPopover();
    document.addEventListener("click", handler, true);
    document.addEventListener("scroll", scrollHandler, true);
    popoverTimeoutRef.current = setTimeout(dismissPopover, 4000);
    return () => {
      document.removeEventListener("click", handler, true);
      document.removeEventListener("scroll", scrollHandler, true);
      clearTimeout(popoverTimeoutRef.current);
    };
  }, [wordPopover, dismissPopover]);

  useEffect(() => {
    let cancelled = false;
    setFontsLoaded(false);
    setLoading(true);
    setDataLoadingSlow(false);
    setError(null);

    const slowTimer = setTimeout(() => { if (!cancelled) setDataLoadingSlow(true); }, 10000);

    const url = `/api/qcf4/${currentPage.toString().padStart(3, "0")}`;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Server returned ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        setLines(data.lines || []);
        setLoading(false);

        const fonts = new Set<string>();
        fonts.add(data.font);
        for (const line of data.lines || []) {
          for (const word of line.words || []) {
            fonts.add(word.font);
          }
        }
        Promise.all([...fonts].map((f) => loadPageFont(f).catch(() => {})))
          .then(() => { if (!cancelled) setFontsLoaded(true); })
          .catch(() => {});
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

  const highlightedWordCode = useMemo(() => {
    if (!highlightWord || lines.length === 0) return null;
    const allWords = lines.flatMap((l) => l.words);
    return getWordGlobalIndex(allWords, highlightWord.verseKey, highlightWord.wordIndex);
  }, [highlightWord, lines]);

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

  const groupedLines = useMemo(() => {
    if (!showWordByWord || wordByWordMap.size === 0) return null;
    return lines.map((line) => ({
      ...line,
      groups: groupWbwWords(line.words, wordByWordMap),
    }));
  }, [showWordByWord, wordByWordMap, lines]);

  const flatWords = useMemo(() => lines.flatMap((l) => l.words), [lines]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] px-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-5 h-5 border-2 border-[var(--foreground)] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-[var(--muted)]">
            {dataLoadingSlow ? "Taking longer than expected..." : "Loading Mushaf..."}
          </p>
          {dataLoadingSlow && (
            <button
              onClick={() => window.location.reload()}
              className="mt-1 px-3 py-1 text-xs font-medium border border-[var(--border)] rounded-md hover:bg-[var(--surface)] transition-colors"
            >
              Reload page
            </button>
          )}
        </div>
      </div>
    );
  }

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

    const popoverEl = wordPopover && (
      <div className="word-popover">
        <span className="word-popover-ml">{wordPopover.text}</span>
        <button
          className="word-popover-speak"
          onClick={(e) => {
            e.stopPropagation();
            const text = wordPopover.text;
            if (!text || !ttsAudioRef.current) return;
            ttsAudioRef.current.src = "/api/tts?text=" + encodeURIComponent(text);
            ttsAudioRef.current.volume = 1;
            ttsAudioRef.current.play().catch(() => {});
          }}
          aria-label="Speak meaning"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
          </svg>
        </button>
        <audio ref={ttsAudioRef} preload="none" />
      </div>
    );

    if (showAyahByAyah) {
      return (
        <div className="mushaf-container">
          {popoverEl}
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
                    const isWordHighlighted = highlightedWordCode !== null && w.code === highlightedWordCode && w.verse_key === vk;
                    const mlTooltip = wbwData && w.type === "word" && w.verse_key
                      ? findWbwMeaning(wbwData, w.verse_key, w.position)
                      : null;

                    if (w.type === "end") {
                      return (
                        <span key={w.code} className={`mushaf-end-marker ${isHighlighted ? "highlighted" : ""}`} style={{ fontFamily: `"${w.font}", serif` }}>
                          {w.char}
                        </span>
                      );
                    }
                    if (w.type === "surah_header") {
                      return (
                        <span key={w.code} className="mushaf-surah-header" style={{ fontFamily: `"${w.font}", serif` }}>
                          {w.char}
                        </span>
                      );
                    }
                    if (w.type === "bismillah") {
                      return (
                        <span key={w.code} className="mushaf-bsml" style={{ fontFamily: `"${w.font}", serif` }}>
                          {w.char}
                        </span>
                      );
                    }

                    const isWordTapped = tappedWordCodes !== null && tappedWordCodes.has(w.code);

                    return (
                      <span
                        key={w.code}
                        className={`mushaf-word ${isHighlighted ? "highlighted" : ""} ${isWordHighlighted ? "word-highlighted" : ""} ${isWordTapped ? "word-tapped" : ""}`}
                        style={{ fontFamily: `"${w.font}", serif` }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (mlTooltip) {
                            setWordPopover({ text: mlTooltip, verseKey: vk, el: e.currentTarget });
                            setTappedWordCodes(findAdjacentGroup(flatWords, w.code, wbwData, wordByWordMap, showWordByWord));
                            clearTimeout(tappedTimeoutRef.current);
                            tappedTimeoutRef.current = setTimeout(() => setTappedWordCodes(null), 800);
                          }
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setAyahSheet({ verseKey: vk });
                        }}
                        title={mlTooltip ? `${w.text} — ${mlTooltip}` : w.text}
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
      );
    }

    let ayahSheetContent = null;
    if (ayahSheet) {
      const vk = ayahSheet.verseKey;
      const words = verseWordsMap.get(vk)?.filter((w) => w.type === "word") || [];
      const translation = translationMap?.get(vk);
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
        <div className="ayah-sheet-backdrop" onClick={() => setAyahSheet(null)}>
          <div className="ayah-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="ayah-sheet-handle" />
            <button className="ayah-sheet-close" onClick={() => setAyahSheet(null)}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="ayah-sheet-header">
              <span className="ayah-sheet-verse-ref">{vk}</span>
            </div>
            {translation && (
              <div className="ayah-sheet-translation" dir="ltr">{translation}</div>
            )}
            <div className="ayah-sheet-divider" />
            <div className="ayah-sheet-words">
              {sheetGroups.map((g, i) => {
                const groupMl = g.ml || findWbwMeaning(wbwData, vk, g.words[g.words.length - 1].position);
                return (
                  <div key={i} className="ayah-sheet-word-row">
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

    return (
    <>
    <div className="mushaf-container">
      {popoverEl}
      {groupedLines
        ? groupedLines.map((line) => (
          <div key={line.line}>
            <div className="mushaf-line wbw-active">
              {line.groups.map((group) => {
                if (group.mlText) {
                    const isGroupTapped = tappedWordCodes !== null && group.words.some((w) => tappedWordCodes.has(w.code));

                    return (
                    <span key={group.key} className={`wbw-group ${isGroupTapped ? "wbw-group-tapped" : ""}`}>
                      <span className="wbw-words-row">
                        {group.words.map((w) => {
                          const isVH = highlightVerseKey !== null && w.verse_key === highlightVerseKey;
                          const isWH = highlightedWordCode !== null && w.code === highlightedWordCode;
                          return (
                            <span
                              key={w.code}
                              className={`mushaf-word ${isVH ? "highlighted" : ""} ${isWH ? "word-highlighted" : ""}`}
                              style={{ fontFamily: `"${w.font}", serif` }}
                              onClick={(e) => {
                                if (w.verse_key) {
                                  setWordPopover({ text: group.mlText!, verseKey: w.verse_key, el: e.currentTarget });
                                  setTappedWordCodes(findAdjacentGroup(flatWords, w.code, wbwData, wordByWordMap, showWordByWord));
                                  clearTimeout(tappedTimeoutRef.current);
                                  tappedTimeoutRef.current = setTimeout(() => setTappedWordCodes(null), 1000);
                                }
                              }}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                if (w.verse_key) setAyahSheet({ verseKey: w.verse_key });
                              }}
                              title={`${w.text} — ${group.mlText}`}
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
                const isWordHighlighted = highlightedWordCode !== null && w.code === highlightedWordCode;

                if (w.type === "end") {
                  return (
                    <span
                      key={w.code}
                      className={`mushaf-end-marker ${isVerseHighlighted ? "highlighted" : ""}`}
                      style={{ fontFamily: `"${w.font}", serif` }}
                      onClick={() => w.verse_key && onVerseClick?.(w.verse_key)}
                    >
                      {w.char}
                    </span>
                  );
                }

                if (w.type === "surah_header") {
                  return (
                    <span key={w.code} className="mushaf-surah-header" style={{ fontFamily: `"${w.font}", serif` }}>
                      {w.char}
                    </span>
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
                const isWordTapped = tappedWordCodes !== null && tappedWordCodes.has(w.code);

                return (
                  <span
                    key={w.code}
                    className={`mushaf-word ${isVerseHighlighted ? "highlighted" : ""} ${isWordHighlighted ? "word-highlighted" : ""} ${isWordTapped ? "word-tapped" : ""}`}
                    style={{ fontFamily: `"${w.font}", serif` }}
                    onClick={(e) => {
                      if (w.verse_key) {
                        if (mlText) {
                          setWordPopover({ text: mlText, verseKey: w.verse_key, el: e.currentTarget });
                          setTappedWordCodes(findAdjacentGroup(flatWords, w.code, wbwData, wordByWordMap, showWordByWord));
                          clearTimeout(tappedTimeoutRef.current);
                          tappedTimeoutRef.current = setTimeout(() => setTappedWordCodes(null), 800);
                        }
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (w.verse_key) setAyahSheet({ verseKey: w.verse_key });
                    }}
                    title={mlText ? `${w.text} — ${mlText}` : w.text}
                  >
                    {w.char}
                  </span>
                );
              })}
            </div>
          </div>
        ))
        : lines.map((line) => {
        return (
          <div key={line.line}>
            <div className={`mushaf-line ${showWordByWord && wordByWordMap.size > 0 ? "wbw-active" : ""}`}>
              {line.words.map((word) => {
                const isVerseHighlighted = highlightVerseKey !== null && word.verse_key === highlightVerseKey;
                const isWordHighlighted = highlightedWordCode !== null && word.code === highlightedWordCode;

                if (word.type === "end") {
                  return (
                    <span
                      key={word.code}
                      className={`mushaf-end-marker ${isVerseHighlighted ? "highlighted" : ""}`}
                      style={{ fontFamily: `"${word.font}", serif` }}
                      onClick={() => word.verse_key && onVerseClick?.(word.verse_key)}
                    >
                      {word.char}
                    </span>
                  );
                }

                if (word.type === "surah_header") {
                  return (
                    <span key={word.code} className="mushaf-surah-header" style={{ fontFamily: `"${word.font}", serif` }}>
                      {word.char}
                    </span>
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
                const isWordTapped = tappedWordCodes !== null && tappedWordCodes.has(word.code);

                return (
                  <span
                    key={word.code}
                    className={`mushaf-word ${isVerseHighlighted ? "highlighted" : ""} ${isWordHighlighted ? "word-highlighted" : ""} ${showWordByWord && mlText ? "wbw-enabled" : ""} ${isWordTapped ? "word-tapped" : ""}`}
                    style={{ fontFamily: `"${word.font}", serif` }}
                    onClick={(e) => {
                      if (word.verse_key) {
                        if (mlTooltip) {
                          setWordPopover({ text: mlTooltip, verseKey: word.verse_key, el: e.currentTarget });
                          setTappedWordCodes(findAdjacentGroup(flatWords, word.code, wbwData, wordByWordMap, showWordByWord));
                          clearTimeout(tappedTimeoutRef.current);
                          tappedTimeoutRef.current = setTimeout(() => setTappedWordCodes(null), 800);
                        }
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (word.verse_key) setAyahSheet({ verseKey: word.verse_key });
                    }}
                    title={mlTooltip ? `${word.text} — ${mlTooltip}` : word.text}
                  >
                    {word.char}
                    {mlText && <span className="wbw-ml">{mlText}</span>}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>

    {ayahSheetContent}
    </>
  );
}