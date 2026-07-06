"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { AyahInfo } from "@/lib/types";
import { fetchMalayalamWBW } from "@/lib/malayalam-wbw";
import { loadPageFont, fetchPageData, PageLine } from "@/lib/qcf4";

interface SwipeWBWViewProps {
  ayahs: AyahInfo[];
  currentPage: number;
  mlFontSize: number;
  currentAyahIndex: number;
  onAyahIndexChange: (index: number) => void;
  translationMap?: Map<string, string> | null;
}

interface WordGroup {
  arabicWords: string[];
  meaning: string | null;
}

// Quranic pause/annotation marks (ۣۖۗۘۙۚۛۜ۟۠ۡۢۤۥۦۧۨ۩۪ۭ۫۬)
// These appear as standalone tokens in Uthmani text and must not consume a meaning slot.
const QURAN_ANNOTATION = /^[\u0656-\u065C\u06D6-\u06ED]+$/;

function groupAyahWords(arabicText: string, meanings: string[]): WordGroup[] {
  const tokens = arabicText.split(/\s+/);
  const groups: WordGroup[] = [];
  let meaningIdx = 0;

  for (const token of tokens) {
    // Skip Quranic annotation marks — they don't correspond to a meaning slot
    if (QURAN_ANNOTATION.test(token)) {
      if (groups.length > 0) {
        groups[groups.length - 1].arabicWords.push(token);
      } else {
        groups.push({ arabicWords: [token], meaning: null });
      }
      continue;
    }

    const meaning = meaningIdx < meanings.length ? meanings[meaningIdx] : null;
    meaningIdx++;

    if (meaning) {
      groups.push({ arabicWords: [token], meaning });
    } else {
      if (groups.length > 0) {
        groups[groups.length - 1].arabicWords.push(token);
      } else {
        groups.push({ arabicWords: [token], meaning: null });
      }
    }
  }
  return groups;
}

export default function SwipeWBWView({ ayahs, currentPage, mlFontSize, currentAyahIndex, onAyahIndexChange, translationMap }: SwipeWBWViewProps) {
  const [wbwData, setWbwData] = useState<Record<string, string[]> | null>(null);
  const [prevIndex, setPrevIndex] = useState<number | null>(null);
  const [slideDir, setSlideDir] = useState<"next" | "prev">("next");
  const [pageLines, setPageLines] = useState<PageLine[]>([]);
  const touchRef = useRef<{ startX: number; startY: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const maleVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const minimapTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [minimapVisible, setMinimapVisible] = useState(false);
  const [minimapPinned, setMinimapPinned] = useState(false);

  const showMinimap = useCallback(() => {
    setMinimapVisible(true);
    clearTimeout(minimapTimerRef.current);
    if (!minimapPinned) {
      minimapTimerRef.current = setTimeout(() => setMinimapVisible(false), 6000);
    }
  }, [minimapPinned]);

  useEffect(() => {
    return () => clearTimeout(minimapTimerRef.current);
  }, []);

  useEffect(() => {
    const load = () => {
      maleVoiceRef.current =
        window.speechSynthesis.getVoices().find(
          (v) => v.lang.startsWith("ml") && v.name.toLowerCase().includes("male")
        ) || null;
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  const speakMalayalam = useCallback((e: React.PointerEvent, text: string) => {
    e.stopPropagation();
    if (!text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ml-IN";
    utterance.rate = 0.85;
    if (maleVoiceRef.current) utterance.voice = maleVoiceRef.current;
    window.speechSynthesis.speak(utterance);
  }, []);

  useEffect(() => {
    loadPageFont("QCF4_Hafs_01").catch(() => {});
    showMinimap();
  }, [showMinimap]);

  useEffect(() => {
    let cancelled = false;
    fetchMalayalamWBW()
      .then((data) => { if (!cancelled) setWbwData(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchPageData(currentPage)
      .then((data) => { if (!cancelled) setPageLines(data.lines || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currentPage]);

  useEffect(() => {
    setPrevIndex(currentAyahIndex);
    const timer = setTimeout(() => setPrevIndex(null), 350);
    return () => clearTimeout(timer);
  }, [currentAyahIndex]);

  const ayah = ayahs[currentAyahIndex];
  const prevAyah = prevIndex !== null && prevIndex !== currentAyahIndex ? ayahs[prevIndex] : null;
  const verseKey = ayah ? `${ayah.surah.number}:${ayah.numberInSurah}` : null;
  const meanings = (verseKey && wbwData?.[verseKey]) || null;
  const groups = ayah && meanings ? groupAyahWords(ayah.text, meanings) : null;

  const lineLayout = useMemo(() => {
    if (pageLines.length === 0) return null;
    let maxChars = 0;
    const info: {
      line: number;
      widthPct: number;
      isSurah: boolean;
      isBsml: boolean;
      highlight: { startPct: number; widthPct: number } | null;
    }[] = [];

    for (const line of pageLines) {
      let chars = 0;
      let isSurah = false;
      let isBsml = false;
      for (const w of line.words) {
        chars += w.char.length;
        if (w.type === "surah_header") isSurah = true;
        if (w.type === "bismillah") isBsml = true;
      }
      if (chars > maxChars) maxChars = chars;
      info.push({ line: line.line, widthPct: 0, isSurah, isBsml, highlight: null });
    }

    // Second pass: compute widths and highlight segments
    for (let i = 0; i < pageLines.length; i++) {
      const line = pageLines[i];
      const inf = info[i];
      let chars = 0;
      let ayahChars = 0;
      let charsBeforeAyah = 0;
      let ayahStarted = false;

      for (const w of line.words) {
        const len = w.char.length;
        chars += len;
        if (verseKey && w.verse_key === verseKey) {
          ayahChars += len;
          if (!ayahStarted) {
            ayahStarted = true;
            charsBeforeAyah = chars - len;
          }
        } else if (!ayahStarted) {
          // keep counting
        }
      }

      inf.widthPct = maxChars > 0 ? (chars / maxChars) * 100 : 100;
      if (ayahChars > 0 && chars > 0) {
        const startPct = (charsBeforeAyah / chars) * 100;
        const wPct = (ayahChars / chars) * 100;
        inf.highlight = { startPct, widthPct: wPct };
      }
    }

    return info;
  }, [verseKey, pageLines]);

  const goNext = useCallback(() => {
    if (currentAyahIndex < ayahs.length - 1) {
      setSlideDir("next");
      onAyahIndexChange(currentAyahIndex + 1);
      showMinimap();
    }
  }, [currentAyahIndex, ayahs.length, onAyahIndexChange, showMinimap]);

  const goPrev = useCallback(() => {
    if (currentAyahIndex > 0) {
      setSlideDir("prev");
      onAyahIndexChange(currentAyahIndex - 1);
      showMinimap();
    }
  }, [currentAyahIndex, onAyahIndexChange, showMinimap]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    touchRef.current = { startX: e.clientX, startY: e.clientY };
    if (containerRef.current) containerRef.current.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const t = touchRef.current;
    if (!t) return;
    const dx = e.clientX - t.startX;
    const dy = e.clientY - t.startY;
    touchRef.current = null;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx < 0) goNext();
      else goPrev();
    }
  }, [goNext, goPrev]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      // RTL: right/down → next, left/up → prev
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); goNext(); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); goPrev(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrev]);

  function renderAyahContent(a: AyahInfo, groupsArr: WordGroup[] | null, isPrev: boolean) {
    const isSingle = isPrev;
    const aVK = `${a.surah.number}:${a.numberInSurah}`;
    const fullTranslation = translationMap?.get(aVK) || null;
    return (
      <div className={`swipe-ayah-card ${isSingle ? "swipe-ayah-card-prev" : ""}`}>
        {fullTranslation && (
          <div className="swipe-full-translation" dir="ltr">
            <span className="swipe-ayah-verse-num">{aVK}</span>
            {fullTranslation}
          </div>
        )}
        {groupsArr ? (
          groupsArr.map((group, gi) => (
            <div key={gi} className="swipe-word-row">
              <div className="swipe-ml-wrap" style={{ fontSize: `${mlFontSize}%` }}>
                {group.meaning ? (
                  <button
                    className="swipe-speaker"
                    onPointerDown={(e) => speakMalayalam(e, group.meaning!)}
                    aria-label="Speak meaning"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                    </svg>
                  </button>
                ) : (
                  <span className="swipe-speaker-placeholder" />
                )}
                <span className="swipe-ml">
                  {group.meaning || ""}
                </span>
              </div>
              <span className="swipe-col-divider" />
              <span className="swipe-arabic" dir="rtl">
                {group.arabicWords.join(" ")}
              </span>
            </div>
          ))
        ) : (
          <div className="swipe-word-row">
            <span className="swipe-ml" />
            <span className="swipe-col-divider" />
            <span className="swipe-arabic" dir="rtl">{a.text}</span>
            {!wbwData && <span className="swipe-loading-hint">Loading meanings...</span>}
          </div>
        )}
      </div>
    );
  }

  if (!ayah || ayahs.length === 0) {
    return (
      <div className="swipe-wbw-empty">
        <p>No ayahs available</p>
      </div>
    );
  }

  const currentGroups = groups;
  const prevAyahData = prevAyah;
  const prevGroups = prevAyahData && wbwData
    ? groupAyahWords(prevAyahData.text, wbwData[`${prevAyahData.surah.number}:${prevAyahData.numberInSurah}`] || [])
    : null;

  return (
    <>
    <div
      className="swipe-wbw-container"
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      <div className="swipe-header">
        <button
          className="swipe-nav-btn"
          disabled={currentAyahIndex === 0}
          onClick={goPrev}
          aria-label="Previous ayah"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <div className="swipe-header-info">
          <span className="swipe-surah-name">
            <span className="swipe-surah-arabic">{ayah.surah.name}</span>
            <span className="swipe-surah-sep">&middot;</span>
            <span>{ayah.surah.englishName}</span>
          </span>
          <span className="swipe-ayah-num">Ayah {ayah.numberInSurah}</span>
        </div>
        <button
          className="swipe-nav-btn"
          disabled={currentAyahIndex === ayahs.length - 1}
          onClick={goNext}
          aria-label="Next ayah"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>

      <div className="swipe-viewport" onPointerDown={() => showMinimap()}>
        <div className={`swipe-slide-content ${slideDir === "next" ? "swipe-slide-next" : "swipe-slide-prev"}`} key={currentAyahIndex}>
          {renderAyahContent(ayah, currentGroups, false)}
        </div>
        {prevAyah && prevGroups !== null && (
          <div className="swipe-slide-out" key={`prev-${prevIndex}`}>
            {renderAyahContent(prevAyah, prevGroups, true)}
          </div>
        )}
      </div>

      <div className="swipe-footer">
        <div className="swipe-dots" dir="rtl">
          {ayahs.map((_, i) => (
            <button
              key={i}
              className={`swipe-dot ${i === currentAyahIndex ? "swipe-dot-active" : ""}`}
              onClick={() => {
                setSlideDir(i > currentAyahIndex ? "next" : "prev");
                onAyahIndexChange(i);
              }}
              aria-label={`Go to ayah ${i + 1}`}
            />
          ))}
        </div>
        <span className="swipe-page-info">Page {currentPage} &middot; {ayahs.length} ayahs</span>
      </div>

      {lineLayout && (
        <div className={`swipe-minimap ${minimapPinned || minimapVisible ? "swipe-minimap-visible" : ""}`} style={{ bottom: "3.25rem" }}>
          <div className="swipe-minimap-label">Page {currentPage}</div>
          <div className="swipe-minimap-lines">
            {lineLayout.map((li) => (
              <div key={li.line} className="swipe-minimap-line-row">
                <div
                  className={`swipe-minimap-line swipe-minimap-line-rtl ${li.isSurah ? "swipe-minimap-line-surah" : ""} ${li.isBsml ? "swipe-minimap-line-bsml" : ""}`}
                >
                  {li.highlight && (
                    <div
                      className="swipe-minimap-line-fill"
                      style={{ right: `${li.highlight.startPct}%`, width: `${li.highlight.widthPct}%` }}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>

      <button
        className="swipe-minimap-toggle"
        onClick={() => setMinimapPinned((p) => !p)}
        aria-label={minimapPinned ? "Auto-hide minimap" : "Keep minimap visible"}
        title={minimapPinned ? "Auto-hide minimap" : "Keep minimap visible"}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
          {minimapPinned ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
          )}
        </svg>
      </button>
    </>
  );
}
