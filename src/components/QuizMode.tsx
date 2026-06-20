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
  getAllProgress,
  getWordProgress,
  setWordProgress,
  addToRepetitionList,
  removeFromRepetitionList,
  type WordProgress,
} from "@/lib/vocabulary-progress";

interface QuizModeProps {
  scopeType: ScopeType;
  scopeValue: number;
  questionCount: number;
  onBack: () => void;
}

interface QuizQuestion {
  word: VocabularyWord;
  options: string[];
  correctIndex: number;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function prioritizeForQuiz(words: VocabularyWord[]): VocabularyWord[] {
  const progress = getAllProgress();
  // Quiz priority: learned (candidates for mastery) > new > skip mastered/learning
  const learned: VocabularyWord[] = [];
  const newWords: VocabularyWord[] = [];
  const shuffled = shuffle(words);
  for (const w of shuffled) {
    const p = progress[w.arabic];
    if (!p || p.status === "new") {
      newWords.push(w);
    } else if (p.status === "learned") {
      learned.push(w);
    }
    // Skip "learning" and "mastered" words
  }
  return [...learned, ...newWords];
}

function generateQuestions(words: VocabularyWord[], count: number): QuizQuestion[] {
  const prioritized = prioritizeForQuiz(words);
  const selected = prioritized.slice(0, count);
  return selected.map((word) => {
    const otherWords = words.filter((w) => w.malayalam !== word.malayalam);
    const distractors = shuffle(otherWords).slice(0, 3).map((w) => w.malayalam);
    const options = shuffle([word.malayalam, ...distractors]);
    return { word, options, correctIndex: options.indexOf(word.malayalam) };
  });
}

export default function QuizMode({ scopeType, scopeValue, questionCount, onBack }: QuizModeProps) {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [allWords, setAllWords] = useState<VocabularyWord[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([loadVocabulary(), loadVersePageMap()]).then(([vocab, vpm]) => {
      const filtered = filterByScope(vocab.words, scopeType, scopeValue, vpm);
      // Prioritize less common words
      const sorted = [...filtered].sort((a, b) => a.count - b.count);
      setAllWords(sorted);
      const qs = generateQuestions(sorted, questionCount);
      setQuestions(qs);
      setLoading(false);
    });
  }, [scopeType, scopeValue, questionCount]);

  const handleSelect = useCallback(
    (optionIndex: number) => {
      if (selected !== null) return;
      setSelected(optionIndex);
      const word = questions[currentIdx].word;
      if (optionIndex === questions[currentIdx].correctIndex) {
        setScore((s) => s + 1);
        // Mark word as mastered on correct answer
        const progress = getWordProgress(word.arabic);
        setWordProgress(word.arabic, {
          status: "mastered",
          correct: progress.correct + 1,
          wrong: progress.wrong,
          lastReviewed: Date.now(),
        });
        removeFromRepetitionList(word.arabic);
      } else {
        addToRepetitionList(word.arabic);
      }
    },
    [selected, currentIdx, questions]
  );

  const handleNext = useCallback(() => {
    if (currentIdx + 1 >= questions.length) {
      setDone(true);
    } else {
      setCurrentIdx((i) => i + 1);
      setSelected(null);
    }
  }, [currentIdx, questions.length]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[var(--muted)]">Loading quiz...</div>
      </div>
    );
  }

  if (done) {
    const pct = Math.round((score / questions.length) * 100);
    return (
      <div className="max-w-md mx-auto p-6 text-center">
        <div className="text-4xl mb-4">
          {pct >= 80 ? "🌟" : pct >= 50 ? "👍" : "📚"}
        </div>
        <h2 className="text-xl font-semibold mb-2 text-[var(--foreground)]">
          Quiz Complete!
        </h2>
        <div className="text-3xl font-bold text-[var(--accent)] mb-2">
          {score}/{questions.length}
        </div>
        <p className="text-sm text-[var(--muted)] mb-6">{pct}% correct</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={onBack}
            className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--foreground)]"
          >
            Back
          </button>
          <button
            onClick={() => {
              setQuestions(generateQuestions(allWords, questionCount));
              setCurrentIdx(0);
              setSelected(null);
              setScore(0);
              setDone(false);
            }}
            className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[var(--muted)]">Not enough words for a quiz</div>
      </div>
    );
  }

  const q = questions[currentIdx];

  return (
    <div className="max-w-md mx-auto p-4">
      <div className="flex items-center justify-between text-xs text-[var(--muted)] mb-3">
        <button onClick={onBack} className="hover:text-[var(--foreground)]">
          ← Back
        </button>
        <span>
          {currentIdx + 1}/{questions.length} · Score: {score}
        </span>
      </div>
      <div className="w-full h-1.5 bg-[var(--border)] rounded-full mb-6 overflow-hidden">
        <div
          className="h-full bg-[var(--accent)] transition-all duration-300"
          style={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }}
        />
      </div>

      <div className="text-center mb-6">
        <p className="text-xs text-[var(--muted)] mb-2">What does this mean in Malayalam?</p>
        <p className="text-3xl font-arabic text-[var(--foreground)]" dir="rtl">
          {q.word.arabic}
        </p>
        {q.word.wordCount > 1 && (
          <span className="text-[10px] text-[var(--accent)] mt-1 inline-block">
            ({q.word.wordCount} words)
          </span>
        )}
      </div>

      <div className="space-y-2">
        {q.options.map((opt, i) => {
          let style = "border-[var(--border)] hover:border-[var(--accent)]";
          if (selected !== null) {
            if (i === q.correctIndex) {
              style = "border-green-500 bg-green-50 dark:bg-green-950";
            } else if (i === selected && i !== q.correctIndex) {
              style = "border-red-500 bg-red-50 dark:bg-red-950";
            } else {
              style = "border-[var(--border)] opacity-50";
            }
          }
          return (
            <button
              key={i}
              onClick={() => handleSelect(i)}
              disabled={selected !== null}
              className={`w-full py-3 px-4 rounded-lg border text-sm text-left transition-colors ${style}`}
            >
              {opt}
            </button>
          );
        })}
      </div>

      {selected !== null && (
        <button
          onClick={handleNext}
          className="w-full mt-4 py-2.5 rounded-lg bg-[var(--accent)] text-white text-sm font-medium"
        >
          {currentIdx + 1 >= questions.length ? "See Results" : "Next Question"}
        </button>
      )}
    </div>
  );
}
