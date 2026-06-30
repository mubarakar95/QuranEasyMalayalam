"use client";

import { useState, useEffect, useCallback } from "react";
import {
  loadVocabulary,
  loadVersePageMap,
  filterByScope,
  type VocabularyWord,
  type ScopeType,
} from "@/lib/vocabulary";
import {
  getWordProgress,
  setWordProgress,
  getAllProgress,
  getRepetitionList,
  removeFromRepetitionList,
  type WordProgress,
} from "@/lib/vocabulary-progress";

interface FlashCardGameProps {
  scopeType: ScopeType;
  scopeValue: number;
  onBack: () => void;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function FlashCardGame({ scopeType, scopeValue, onBack }: FlashCardGameProps) {
  const [queue, setQueue] = useState<VocabularyWord[]>([]);
  const [current, setCurrent] = useState<VocabularyWord | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [stats, setStats] = useState({ known: 0, learning: 0, total: 0 });
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    Promise.all([loadVocabulary(), loadVersePageMap()]).then(([vocab, vpm]) => {
      const filtered = filterByScope(vocab.words, scopeType, scopeValue, vpm);

      // Prioritize repetition list words (failed in quiz)
      const repetition = getRepetitionList();
      const repWords = filtered.filter((w) => repetition.includes(w.arabic));
      const otherWords = filtered.filter((w) => !repetition.includes(w.arabic));

      // Within non-repetition: new > learning > learned, skip mastered
      const allProgress = getAllProgress();
      const grouped: VocabularyWord[][] = [[], [], []];
      const shuffledOthers = shuffle(otherWords);
      for (const w of shuffledOthers) {
        const p = allProgress[w.arabic];
        if (p && p.status === "mastered") continue;
        const idx = !p ? 0 : p.status === "learning" ? 1 : 2;
        grouped[idx].push(w);
      }
      const sortedOthers = [...grouped[0], ...grouped[1], ...grouped[2]];

      // Repetition words first, then prioritized other words
      const session = [...shuffle(repWords), ...sortedOthers].slice(0, 50);

      if (session.length === 0) {
        setLoadError(`No vocabulary found${scopeValue > 0 ? ` for ${scopeType} ${scopeValue}` : ""}`);
      }

      setQueue(session);
      setStats({ known: 0, learning: 0, total: session.length });
      setLoading(false);
    });
  }, [scopeType, scopeValue]);

  useEffect(() => {
    if (queue.length > 0 && !current) {
      setCurrent(queue[0]);
      setFlipped(false);
    } else if (queue.length === 0 && current === null && !loading) {
      setDone(true);
    }
  }, [queue, current, loading]);

  const handleAnswer = useCallback(
    (known: boolean) => {
      if (!current) return;

      const progress = getWordProgress(current.arabic);
      const now = Date.now();
      const newProgress: WordProgress = {
        status: known ? "learned" : "learning",
        correct: known ? progress.correct + 1 : 0,
        wrong: known ? progress.wrong : progress.wrong + 1,
        lastReviewed: now,
      };
      setWordProgress(current.arabic, newProgress);

      // Remove from repetition list if answered correctly
      if (known) {
        removeFromRepetitionList(current.arabic);
      }

      setStats((s) => ({
        ...s,
        known: known ? s.known + 1 : s.known,
        learning: known ? s.learning : s.learning + 1,
      }));

      const remaining = queue.slice(1);
      setQueue(remaining);
      setCurrent(remaining[0] || null);
      setFlipped(false);
    },
    [current, queue]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[var(--muted)]">Loading vocabulary...</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-md mx-auto p-6 text-center">
        <p className="text-[var(--muted)] mb-4">{loadError}</p>
        <button
          onClick={onBack}
          className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium"
        >
          Back
        </button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="max-w-md mx-auto p-6 text-center">
        <div className="text-4xl mb-4">🎉</div>
        <h2 className="text-xl font-semibold mb-2 text-[var(--foreground)]">
          Session Complete!
        </h2>
        <div className="space-y-1 text-sm text-[var(--muted)] mb-6">
          <p>Words reviewed: {stats.total}</p>
          <p>Known: {stats.known}</p>
          <p>Still learning: {stats.learning}</p>
        </div>
        <button
          onClick={onBack}
          className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium"
        >
          Back
        </button>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[var(--muted)]">No words to review</div>
      </div>
    );
  }

  const progress = getWordProgress(current.arabic);
  const remaining = queue.length;
  const isMultiWord = current.wordCount > 1;

  return (
    <div className="max-w-md mx-auto p-4 overflow-hidden">
      {/* Progress bar */}
      <div className="flex items-center justify-between text-xs text-[var(--muted)] mb-3">
        <button onClick={onBack} className="hover:text-[var(--foreground)]">
          ← Back
        </button>
        <span>
          {stats.total - remaining}/{stats.total}
        </span>
      </div>
      <div className="w-full h-1.5 bg-[var(--border)] rounded-full mb-6 overflow-hidden">
        <div
          className="h-full bg-[var(--accent)] transition-all duration-300"
          style={{ width: `${((stats.total - remaining) / stats.total) * 100}%` }}
        />
      </div>

      {/* Flash card */}
      <div
        className="relative w-full cursor-pointer h-56 shrink-0"
        style={{ height: "14rem", flexShrink: 0, overflow: "hidden" }}
        onClick={() => setFlipped(!flipped)}
      >
        <div
          className="absolute inset-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden"
          style={{
            transformStyle: "preserve-3d",
            transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
            transition: "transform 0.5s ease",
          }}
        >
          {/* Front: Arabic */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-[var(--surface)] p-6 overflow-hidden"
            style={{ backfaceVisibility: "hidden" }}
          >
            {isMultiWord && (
              <span className="text-[10px] text-[var(--accent)] bg-[var(--border)] px-2 py-0.5 rounded-full mb-2 font-medium">
                {current.wordCount} words
              </span>
            )}
            <p
              className="text-2xl font-arabic leading-loose text-[var(--foreground)] text-center"
              dir="rtl"
            >
              {current.arabic}
            </p>
            <p className="text-xs text-[var(--muted)] mt-3">
              {progress.status === "learned"
                ? "✓ Learned"
                : progress.correct > 0
                  ? `Review (${progress.correct}× correct)`
                  : "Tap to reveal"}
            </p>
          </div>

          {/* Back: Malayalam */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-[var(--surface)] p-6 overflow-hidden"
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          >
            <p className="text-2xl text-[var(--foreground)] mb-2 text-center">
              {current.malayalam}
            </p>
            <p className="text-sm text-[var(--muted)] text-center" dir="rtl">
              {current.arabic}
            </p>
            <p className="text-xs text-[var(--muted)] mt-2">
              Appears {current.count}× in Quran
            </p>
          </div>
        </div>
      </div>

      {/* Answer buttons */}
      {flipped && (
        <div className="flex gap-3 mt-6">
          <button
            onClick={(e) => { e.stopPropagation(); handleAnswer(false); }}
            className="flex-1 py-3 rounded-lg border border-red-300 text-red-600 text-sm font-medium hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
          >
            Still Learning
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleAnswer(true); }}
            className="flex-1 py-3 rounded-lg border border-green-300 text-green-600 text-sm font-medium hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-950"
          >
            I Know This
          </button>
        </div>
      )}

      {!flipped && (
        <p className="text-center text-xs text-[var(--muted)] mt-6">Tap the card to flip</p>
      )}
    </div>
  );
}
