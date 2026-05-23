"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { PageLine, fetchPageData, loadPageFont } from "@/lib/qcf4";
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

export default function MushafPage({ currentPage, highlightVerseKey, highlightWord, onVerseClick, showTranslation = false, translationMap = null, showWordByWord = false }: MushafPageProps) {
  const [lines, setLines] = useState<PageLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wbwData, setWbwData] = useState<Record<string, string[]> | null>(null);
  const [wordPopover, setWordPopover] = useState<{ text: string; verseKey: string; el: Element } | null>(null);
  const popoverTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const ttsAudioRef = useRef<HTMLAudioElement>(null);

  const dismissPopover = useCallback(() => {
    setWordPopover(null);
    clearTimeout(popoverTimeoutRef.current);
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

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchPageData(currentPage);
        if (cancelled) return;

        const fontsToLoad = new Set<string>();
        fontsToLoad.add(data.font);
        for (const line of data.lines) {
          for (const word of line.words) {
            fontsToLoad.add(word.font);
          }
        }
        await Promise.all([...fontsToLoad].map((f) => loadPageFont(f)));

        if (cancelled) return;
        setLines(data.lines);
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load page");
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-5 h-5 border-2 border-[var(--foreground)] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-[var(--muted)]">Loading Mushaf...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-sm text-[var(--muted)]">{error}</p>
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
                      ? (wbwData[w.verse_key]?.[w.position - 1] ?? null)
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

                    return (
                      <span
                        key={w.code}
                        className={`mushaf-word ${isHighlighted ? "highlighted" : ""} ${isWordHighlighted ? "word-highlighted" : ""}`}
                        style={{ fontFamily: `"${w.font}", serif` }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onVerseClick?.(vk);
                          if (mlTooltip) {
                            setWordPopover({ text: mlTooltip, verseKey: vk, el: e.currentTarget });
                          }
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

    return (
    <div className="mushaf-container">
      {popoverEl}
      {lines.map((line) => {
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
                  ? (wbwData[word.verse_key]?.[word.position - 1] ?? null)
                  : null;

                return (
                  <span
                    key={word.code}
                    className={`mushaf-word ${isVerseHighlighted ? "highlighted" : ""} ${isWordHighlighted ? "word-highlighted" : ""} ${showWordByWord && mlText ? "wbw-enabled" : ""}`}
                    style={{ fontFamily: `"${word.font}", serif` }}
                    onClick={(e) => {
                      if (word.verse_key) {
                        onVerseClick?.(word.verse_key);
                        if (mlTooltip) {
                          setWordPopover({ text: mlTooltip, verseKey: word.verse_key, el: e.currentTarget });
                        }
                      }
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
  );
}