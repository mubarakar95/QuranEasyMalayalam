"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getAllProgress, type WordProgress } from "@/lib/vocabulary-progress";
import { loadVocabulary, loadVersePageMap, filterByScope, type VocabularyWord } from "@/lib/vocabulary";
import { SURAH_NAMES } from "@/lib/qcf4";
import FlashCardGame from "@/components/FlashCardGame";
import QuizMode from "@/components/QuizMode";
import AuthModal from "@/components/AuthModal";

type View = "menu" | "flashcard" | "quiz" | "mastery";
type Scope = { type: "page" | "juz" | "surah"; value: number };

interface SurahMastery {
  number: number;
  name: string;
  englishName: string;
  total: number;
  mastered: number;
  learned: number;
  learning: number;
}

export default function LearnPage() {
  const router = useRouter();
  const [view, setView] = useState<View>("menu");
  const [scope, setScope] = useState<Scope>({ type: "surah", value: 1 });
  const [questionCount, setQuestionCount] = useState(10);
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [progressStats, setProgressStats] = useState({
    total: 0,
    mastered: 0,
    learned: 0,
    learning: 0,
    newWords: 0,
  });
  const [surahMastery, setSurahMastery] = useState<SurahMastery[]>([]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUser({ id: data.user.id, email: data.user.email || "" });
      }
    });
  }, []);

  // Compute surah mastery + scope stats
  useEffect(() => {
    Promise.all([loadVocabulary(), loadVersePageMap()]).then(([vocab, vpm]) => {
      const progress = getAllProgress();

      // Surah mastery: group words by surah
      const surahMap = new Map<number, { total: number; mastered: number; learned: number; learning: number }>();
      for (let s = 1; s <= 114; s++) surahMap.set(s, { total: 0, mastered: 0, learned: 0, learning: 0 });

      for (const w of vocab.words) {
        if (!w.verses || w.verses.length === 0) continue;
        // Find which surahs this word belongs to
        const surahs = new Set<number>();
        for (const vk of w.verses) {
          surahs.add(parseInt(vk.split(":")[0]));
        }
        const p: WordProgress = progress[w.arabic];
        const status = p?.status || "new";

        for (const s of surahs) {
          const data = surahMap.get(s)!;
          data.total++;
          if (status === "mastered") data.mastered++;
          else if (status === "learned") data.learned++;
          else if (status === "learning") data.learning++;
        }
      }

      const mastery: SurahMastery[] = [];
      for (let s = 1; s <= 114; s++) {
        const data = surahMap.get(s)!;
        const info = SURAH_NAMES[s];
        mastery.push({
          number: s,
          name: info?.name || "",
          englishName: info?.englishName || "",
          total: data.total,
          mastered: data.mastered,
          learned: data.learned,
          learning: data.learning,
        });
      }
      setSurahMastery(mastery);

      // Scope stats
      const filtered = filterByScope(vocab.words, scope.type, scope.value, vpm);
      let mastered = 0, learned = 0, learning = 0;
      for (const w of filtered) {
        const p: WordProgress = progress[w.arabic];
        if (p?.status === "mastered") mastered++;
        else if (p?.status === "learned") learned++;
        else if (p?.status === "learning") learning++;
      }
      setProgressStats({
        total: filtered.length,
        mastered,
        learned,
        learning,
        newWords: filtered.length - mastered - learned - learning,
      });
    });
  }, [scope, refreshKey]);

  const masteredCount = useMemo(
    () => surahMastery.filter((s) => s.total > 0 && s.mastered === s.total).length,
    [surahMastery]
  );

  const overallMastered = useMemo(
    () => surahMastery.reduce((sum, s) => sum + s.mastered, 0),
    [surahMastery]
  );
  const overallLearned = useMemo(
    () => surahMastery.reduce((sum, s) => sum + s.mastered + s.learned, 0),
    [surahMastery]
  );
  const overallTotal = useMemo(
    () => surahMastery.reduce((sum, s) => sum + s.total, 0),
    [surahMastery]
  );

  if (view === "mastery") {
    return (
      <div className="max-w-lg mx-auto p-4 pb-20">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => setView("menu")} className="p-1.5 rounded-md hover:bg-[var(--surface)]">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold">Mastery Progress</h1>
        </div>

        {/* Overall stats */}
        <div className="p-4 rounded-xl bg-[var(--surface)] mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Overall</span>
            <span className="text-sm text-[var(--muted)]">{overallMastered}/{overallTotal} mastered</span>
          </div>
          <div className="w-full h-2 bg-[var(--border)] rounded-full overflow-hidden mb-2">
            <div className="flex h-full">
              <div
                className="bg-blue-500 transition-all duration-500"
                style={{ width: `${overallTotal > 0 ? (overallMastered / overallTotal) * 100 : 0}%` }}
              />
              <div
                className="bg-green-500 transition-all duration-500"
                style={{ width: `${overallTotal > 0 ? ((overallLearned - overallMastered) / overallTotal) * 100 : 0}%` }}
              />
            </div>
          </div>
          <div className="flex items-center gap-4 text-[10px] text-[var(--muted)]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Mastered: {overallMastered}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> Learned: {overallLearned - overallMastered}</span>
          </div>
        </div>

        {/* Surah list */}
        <div className="space-y-1.5">
          {surahMastery.map((s) => {
            const pct = s.total > 0 ? ((s.mastered + s.learned) / s.total) * 100 : 0;
            const isMastered = s.total > 0 && s.mastered === s.total;
            return (
              <button
                key={s.number}
                onClick={() => { setScope({ type: "surah", value: s.number }); setView("menu"); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[var(--surface)] hover:bg-[var(--border)] transition-colors text-left"
              >
                <span className="text-xs font-mono text-[var(--muted)] w-7 text-right">{s.number}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium truncate">{s.englishName}</span>
                    {isMastered && <span className="text-[10px] text-blue-500 font-medium">✓ Mastered</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                      <div className="flex h-full">
                        <div
                          className="h-full bg-blue-500 transition-all duration-500"
                          style={{ width: `${s.total > 0 ? (s.mastered / s.total) * 100 : 0}%` }}
                        />
                        <div
                          className="h-full bg-green-500 transition-all duration-500"
                          style={{ width: `${s.total > 0 ? (s.learned / s.total) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-[10px] text-[var(--muted)] tabular-nums w-14 text-right">
                      {s.mastered}/{s.total}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (view === "flashcard") {
    return <FlashCardGame scopeType={scope.type} scopeValue={scope.value} onBack={() => { setRefreshKey(k => k + 1); setView("menu"); }} />;
  }

  if (view === "quiz") {
    return (
      <QuizMode
        scopeType={scope.type}
        scopeValue={scope.value}
        questionCount={questionCount}
        onBack={() => { setRefreshKey(k => k + 1); setView("menu"); }}
      />
    );
  }

  return (
    <div className="max-w-lg mx-auto p-4 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.back()}
          className="p-1.5 rounded-md hover:bg-[var(--surface)] transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold">Learn Quranic Vocabulary</h1>
      </div>

      {/* Quick mastery overview */}
      {overallTotal > 0 && (
        <button
          onClick={() => setView("mastery")}
          className="w-full mb-4 p-3 rounded-xl bg-[var(--surface)] hover:bg-[var(--border)] transition-colors flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
            <span className="text-lg font-bold text-blue-500">{masteredCount}</span>
          </div>
          <div className="flex-1 text-left">
            <p className="text-xs font-medium">Surahs Mastered</p>
            <p className="text-[10px] text-[var(--muted)]">
              {overallMastered}/{overallTotal} words mastered · Tap to see all
            </p>
          </div>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-[var(--muted)]">
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      )}

      {/* Progress overview */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-[var(--muted)]">
            {scope.value === 0 ? "All Words" : scope.type === "surah" ? `Surah ${scope.value}` : `Juz ${scope.value}`}
          </span>
          <span className="text-xs font-medium text-[var(--muted)]">{progressStats.total} words</span>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-[var(--surface)] text-center">
            <div className="text-xl font-bold text-blue-500">{progressStats.mastered}</div>
            <div className="text-[10px] text-[var(--muted)]">Mastered</div>
          </div>
          <div className="p-3 rounded-lg bg-[var(--surface)] text-center">
            <div className="text-xl font-bold text-green-500">{progressStats.learned}</div>
            <div className="text-[10px] text-[var(--muted)]">Learned</div>
          </div>
          <div className="p-3 rounded-lg bg-[var(--surface)] text-center">
            <div className="text-xl font-bold text-amber-500">{progressStats.learning}</div>
            <div className="text-[10px] text-[var(--muted)]">Learning</div>
          </div>
          <div className="p-3 rounded-lg bg-[var(--surface)] text-center">
            <div className="text-xl font-bold text-[var(--muted)]">{progressStats.newWords}</div>
            <div className="text-[10px] text-[var(--muted)]">New</div>
          </div>
        </div>
      </div>

      {/* Scope selector */}
      <div className="mb-6">
        <label className="text-xs font-medium text-[var(--muted)] mb-2 block">
          Select Scope
        </label>
        <div className="flex gap-2 mb-2">
          {(["surah", "juz"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setScope((s) => ({ type: t, value: s.value === 0 ? 1 : s.value }))}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                scope.type === t && scope.value !== 0
                  ? "bg-[var(--foreground)] text-[var(--background)]"
                  : "bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {t === "surah" ? "Surah" : "Juz"}
            </button>
          ))}
          <button
            onClick={() => setScope({ type: "surah", value: 0 })}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              scope.value === 0
                ? "bg-[var(--foreground)] text-[var(--background)]"
                : "bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            All Words
          </button>
        </div>
        {scope.value !== 0 && (
          <input
            type="number"
            min={1}
            max={scope.type === "surah" ? 114 : 30}
            value={scope.value}
            onChange={(e) =>
              setScope((s) => ({ ...s, value: parseInt(e.target.value) || 1 }))
            }
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-sm outline-none focus:border-[var(--accent)]"
          />
        )}
      </div>

      {/* Action buttons */}
      <div className="space-y-3">
        <button
          onClick={() => setView("flashcard")}
          className="w-full py-3.5 rounded-xl bg-[var(--accent)] text-white text-sm font-semibold flex items-center justify-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
          </svg>
          Flash Cards
        </button>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-[var(--muted)]">Quiz Questions</label>
            <span className="text-xs font-medium">{questionCount}</span>
          </div>
          <input
            type="range"
            min={5}
            max={50}
            step={5}
            value={questionCount}
            onChange={(e) => setQuestionCount(parseInt(e.target.value))}
            className="w-full accent-[var(--accent)]"
          />
        </div>

        <button
          onClick={() => setView("quiz")}
          className="w-full py-3.5 rounded-xl border-2 border-[var(--accent)] text-[var(--accent)] text-sm font-semibold flex items-center justify-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
          </svg>
          Start Quiz
        </button>
      </div>

      {/* Auth section */}
      <div className="mt-8 pt-4 border-t border-[var(--border)]">
        {user ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium">{user.email}</p>
              <p className="text-[10px] text-[var(--muted)]">Progress synced to cloud</p>
            </div>
            <button
              onClick={async () => {
                const supabase = createClient();
                await supabase.auth.signOut();
                setUser(null);
              }}
              className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              Sign Out
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAuth(true)}
            className="w-full py-2.5 rounded-lg border border-[var(--border)] text-xs text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--accent)] transition-colors"
          >
            Sign in to sync progress
          </button>
        )}
      </div>

      <AuthModal
        open={showAuth}
        onClose={() => setShowAuth(false)}
        onAuth={(u) => setUser(u)}
      />
    </div>
  );
}
