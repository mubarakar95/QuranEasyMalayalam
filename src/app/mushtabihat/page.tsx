"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { SURAH_NAMES } from "@/lib/qcf4";
import {
  loadMushtabihat,
  filterByJuzRange,
  fetchPairTexts,
  shuffle,
  type MushtabihatPair,
} from "@/lib/mushtabihat";

type View = "select" | "quiz";

export default function MushtabihatPage() {
  const router = useRouter();
  const [view, setView] = useState<View>("select");
  const [startJuz, setStartJuz] = useState(29);
  const [endJuz, setEndJuz] = useState(30);
  const [allPairs, setAllPairs] = useState<MushtabihatPair[]>([]);
  const [loading, setLoading] = useState(false);
  const [includePending, setIncludePending] = useState(false);

  // Quiz state
  const [quizPairs, setQuizPairs] = useState<MushtabihatPair[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [showingAyah1, setShowingAyah1] = useState(true);
  const [loadingText, setLoadingText] = useState(false);

  useEffect(() => {
    loadMushtabihat().then(setAllPairs);
  }, []);

  const startQuiz = useCallback(() => {
    setLoading(true);
    loadMushtabihat().then((pairs) => {
      const filtered = filterByJuzRange(
        includePending ? pairs : pairs.filter((p) => p.source === "curated"),
        startJuz,
        endJuz
      );
      if (filtered.length === 0) {
        setLoading(false);
        return;
      }
      const shuffled = shuffle(filtered);
      setQuizPairs(shuffled);
      setCurrentIdx(0);
      setRevealed(false);
      setShowingAyah1(true);
      setView("quiz");
      setLoading(false);
    });
  }, [startJuz, endJuz, includePending]);

  const currentPair = quizPairs[currentIdx];

  const loadTexts = useCallback(async () => {
    if (!currentPair || (currentPair.text1 && currentPair.text2)) return;
    setLoadingText(true);
    const { text1, text2 } = await fetchPairTexts(currentPair);
    setQuizPairs((prev) => {
      const updated = [...prev];
      updated[currentIdx] = { ...updated[currentIdx], text1, text2 };
      return updated;
    });
    setLoadingText(false);
  }, [currentPair, currentIdx]);

  useEffect(() => {
    if (view === "quiz" && currentPair) loadTexts();
  }, [view, currentPair, loadTexts]);

  const handleReveal = () => setRevealed(true);

  const handleNext = () => {
    if (currentIdx < quizPairs.length - 1) {
      setCurrentIdx((i) => i + 1);
      setRevealed(false);
      setShowingAyah1(Math.random() > 0.5);
    }
  };

  const handlePrev = () => {
    if (currentIdx > 0) {
      setCurrentIdx((i) => i - 1);
      setRevealed(false);
    }
  };

  if (view === "quiz" && quizPairs.length === 0) {
    return (
      <div className="max-w-lg mx-auto p-4 pb-20 text-center">
        <p className="text-sm text-[var(--muted)] py-12">
          No mushtabihat pairs found in this range.
        </p>
        <button onClick={() => setView("select")} className="text-sm text-[var(--accent)]">
          Go back
        </button>
      </div>
    );
  }

  if (view === "quiz" && currentPair) {
    const shown = showingAyah1 ? currentPair : { ayah1: currentPair.ayah2, ayah2: currentPair.ayah1, text1: currentPair.text2, text2: currentPair.text1 };
    const hidden = showingAyah1 ? { ayah: currentPair.ayah2, text: currentPair.text2 } : { ayah: currentPair.ayah1, text: currentPair.text1 };

    return (
      <div className="max-w-lg mx-auto p-4 pb-20">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setView("select")} className="p-1.5 rounded-md hover:bg-[var(--surface)]">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold">Mushtabihat</h1>
          <span className="ml-auto text-xs text-[var(--muted)]">
            {currentIdx + 1} / {quizPairs.length}
          </span>
        </div>

        {/* Progress */}
        <div className="w-full h-1 bg-[var(--surface)] rounded-full mb-6 overflow-hidden">
          <div
            className="h-full bg-[var(--accent)] rounded-full transition-all duration-300"
            style={{ width: `${((currentIdx + 1) / quizPairs.length) * 100}%` }}
          />
        </div>

        {/* Card */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden mb-4">
          {/* Shown verse */}
          <div className="p-5 text-center">
            <p className="text-[10px] text-[var(--muted)] mb-3 font-medium">
              {showingAyah1 ? currentPair.ayah1 : currentPair.ayah2} — {SURAH_NAMES[showingAyah1 ? currentPair.surah1 : currentPair.surah2]?.englishName || ""}
            </p>
            <p
              className="text-xl leading-relaxed font-arabic"
              dir="rtl"
              style={{ fontFamily: '"QCF4_Hafs_01", serif' }}
            >
              {loadingText ? (
                <span className="text-sm text-[var(--muted)]">Loading...</span>
              ) : (
                shown.text1 || "—"
              )}
            </p>
            {currentPair.category && (
              <span className="inline-block mt-3 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--background)] text-[var(--muted)]">
                {currentPair.category.replace("_", " ")}
              </span>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-[var(--border)]" />

          {/* Hidden / Revealed verse */}
          <div className={`p-5 text-center transition-all duration-300 ${revealed ? "bg-[var(--background)]" : ""}`}>
            {!revealed ? (
              <button
                onClick={handleReveal}
                className="py-8 w-full text-sm font-medium text-[var(--accent)] hover:opacity-80 transition-opacity"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 mx-auto mb-2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
                Tap to reveal the similar verse
              </button>
            ) : (
              <div className="animate-in fade-in duration-300">
                <p className="text-[10px] text-[var(--muted)] mb-3 font-medium">
                  {hidden.ayah} — {SURAH_NAMES[showingAyah1 ? currentPair.surah2 : currentPair.surah1]?.englishName || ""}
                </p>
                <p
                  className="text-xl leading-relaxed font-arabic mb-3"
                  dir="rtl"
                  style={{ fontFamily: '"QCF4_Hafs_01", serif' }}
                >
                  {hidden.text || "—"}
                </p>
                {currentPair.note && (
                  <div className="mt-3 p-3 rounded-lg bg-[var(--surface)] text-left">
                    <p className="text-xs text-[var(--muted)] leading-relaxed">
                      {currentPair.note}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-3">
          <button
            onClick={handlePrev}
            disabled={currentIdx === 0}
            className="flex-1 py-2.5 rounded-lg border border-[var(--border)] text-xs font-medium disabled:opacity-30 hover:bg-[var(--surface)] transition-colors"
          >
            Previous
          </button>
          <button
            onClick={handleNext}
            disabled={currentIdx === quizPairs.length - 1}
            className="flex-1 py-2.5 rounded-lg bg-[var(--foreground)] text-[var(--background)] text-xs font-semibold disabled:opacity-30 hover:opacity-90 transition-opacity"
          >
            Next
          </button>
        </div>
      </div>
    );
  }

  // Select view
  return (
    <div className="max-w-lg mx-auto p-4 pb-20">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="p-1.5 rounded-md hover:bg-[var(--surface)]">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold">Mushtabihat Tester</h1>
      </div>

      <p className="text-xs text-[var(--muted)] mb-6 leading-relaxed">
        Practice identifying similar-looking verses (مشتبهات) that are commonly confused during memorization. Select a juz range and test yourself.
      </p>

      {/* Juz range selector */}
      <div className="mb-6">
        <label className="text-xs font-medium text-[var(--muted)] mb-3 block">
          Juz Range
        </label>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="text-[10px] text-[var(--muted)] mb-1 block">From</label>
            <select
              value={startJuz}
              onChange={(e) => {
                const v = parseInt(e.target.value);
                setStartJuz(v);
                if (v > endJuz) setEndJuz(v);
              }}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-sm outline-none focus:border-[var(--accent)]"
            >
              {Array.from({ length: 30 }, (_, i) => i + 1).map((j) => (
                <option key={j} value={j}>Juz {j}</option>
              ))}
            </select>
          </div>
          <span className="text-[var(--muted)] mt-4">—</span>
          <div className="flex-1">
            <label className="text-[10px] text-[var(--muted)] mb-1 block">To</label>
            <select
              value={endJuz}
              onChange={(e) => setEndJuz(Math.max(startJuz, parseInt(e.target.value)))}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-sm outline-none focus:border-[var(--accent)]"
            >
              {Array.from({ length: 30 }, (_, i) => i + 1).map((j) => (
                <option key={j} value={j} disabled={j < startJuz}>Juz {j}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Pair count preview */}
      <div className="mb-4 p-3 rounded-lg bg-[var(--surface)]">
        <p className="text-xs text-[var(--muted)]">
          {allPairs.length > 0
            ? `${filterByJuzRange(includePending ? allPairs : allPairs.filter((p) => p.source === "curated"), startJuz, endJuz).length} pairs in selected range`
            : "Loading..."}
        </p>
      </div>

      {/* Include pending toggle */}
      <label className="flex items-center gap-3 mb-6 px-3 py-2.5 rounded-lg bg-[var(--surface)] cursor-pointer">
        <input
          type="checkbox"
          checked={includePending}
          onChange={(e) => setIncludePending(e.target.checked)}
          className="w-4 h-4 rounded accent-[var(--accent)]"
        />
        <div>
          <span className="text-xs font-medium">Include uncurated pairs</span>
          <p className="text-[10px] text-[var(--muted)]">More content but some pairs may not be truly similar</p>
        </div>
      </label>

      {/* Start button */}
      <button
        onClick={startQuiz}
        disabled={loading || allPairs.length === 0}
        className="w-full py-3.5 rounded-xl bg-[var(--accent)] text-white text-sm font-semibold disabled:opacity-50"
      >
        {loading ? "Loading..." : "Start Practice"}
      </button>
    </div>
  );
}
