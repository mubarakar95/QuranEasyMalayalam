"use client";

import { useState, useEffect, useMemo } from "react";
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

  return (
    <div className="mushaf-container">
      {lines.map((line) => {
        const endMarkersInLine = line.words.filter((w) => w.type === "end" && w.verse_key);
        const translationLines: { verseKey: string; text: string }[] = [];
        if (showTranslation && !showWordByWord && translationMap && endMarkersInLine.length > 0) {
          for (const em of endMarkersInLine) {
            const text = translationMap.get(em.verse_key!);
            if (text) {
              translationLines.push({ verseKey: em.verse_key!, text });
            }
          }
        }

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
                    onClick={() => word.verse_key && onVerseClick?.(word.verse_key)}
                    title={mlTooltip ? `${word.text} — ${mlTooltip}` : word.text}
                  >
                    {word.char}
                    {mlText && <span className="wbw-ml">{mlText}</span>}
                  </span>
                );
              })}
            </div>
            {translationLines.map((tl) => (
              <div key={tl.verseKey} className="translation-line" dir="ltr">
                {tl.text}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}