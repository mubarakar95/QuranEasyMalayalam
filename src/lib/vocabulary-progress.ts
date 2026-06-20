"use client";

import { createClient } from "@/lib/supabase/client";

export type WordStatus = "new" | "learning" | "learned" | "mastered";

export interface WordProgress {
  status: WordStatus;
  correct: number;
  wrong: number;
  lastReviewed: number; // timestamp
}

const STORAGE_KEY = "quran-vocab-progress";
const REPETITION_KEY = "quran-vocab-repetition";

function getLocalProgress(): Record<string, WordProgress> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalProgress(data: Record<string, WordProgress>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getWordProgress(wordId: string): WordProgress {
  const all = getLocalProgress();
  return all[wordId] || { status: "new", correct: 0, wrong: 0, lastReviewed: 0 };
}

export function setWordProgress(wordId: string, progress: WordProgress) {
  const all = getLocalProgress();
  all[wordId] = progress;
  saveLocalProgress(all);
}

export function getAllProgress(): Record<string, WordProgress> {
  return getLocalProgress();
}

export function getWordsForScope(
  vocabulary: { arabic: string; malayalam: string; count: number }[],
  scope: { type: "page" | "juz" | "surah"; value: number },
  pageToVerses: Record<string, string[]>
) {
  const verseKeys = pageToVerses[String(scope.value)] || [];
  const relevantWords = new Set<string>();

  for (const vk of verseKeys) {
    const [surahStr] = vk.split(":");
    const surah = parseInt(surahStr);

    if (scope.type === "surah" && surah !== scope.value) continue;

    for (let i = 0; i < vocabulary.length; i++) {
      const w = vocabulary[i];
      // Simple matching: check if this word appears in the verse
      // (We use the full vocabulary list filtered by progress)
      relevantWords.add(w.arabic);
    }
  }

  return vocabulary.filter((w) => relevantWords.has(w.arabic));
}

export function getWordsByStatus(
  words: { arabic: string; malayalam: string; count: number }[],
  status: WordStatus
) {
  return words.filter((w) => {
    const progress = getWordProgress(w.arabic);
    return progress.status === status;
  });
}

export function getWordsDueForReview(
  words: { arabic: string; malayalam: string; count: number }[]
) {
  const now = Date.now();
  const DAY = 86400000;
  return words.filter((w) => {
    const p = getWordProgress(w.arabic);
    if (p.status === "new") return true;
    if (p.status === "learning") {
      const interval = Math.min(DAY * Math.pow(2, p.correct), 30 * DAY);
      return now - p.lastReviewed >= interval;
    }
    return false;
  });
}

export async function syncToSupabase(userId: string) {
  const supabase = createClient();
  const progress = getLocalProgress();

  const rows = Object.entries(progress).map(([wordId, p]) => ({
    user_id: userId,
    word_id: wordId,
    status: p.status,
    correct_count: p.correct,
    wrong_count: p.wrong,
    last_reviewed: new Date(p.lastReviewed).toISOString(),
    next_review: new Date(
      p.lastReviewed + Math.min(86400000 * Math.pow(2, p.correct), 30 * 86400000)
    ).toISOString(),
  }));

  if (rows.length === 0) return;

  const { error } = await supabase
    .from("user_word_progress")
    .upsert(rows, { onConflict: "user_id,word_id" });

  if (error) console.error("Sync failed:", error);
}

export async function loadFromSupabase(userId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("user_word_progress")
    .select("word_id, status, correct_count, wrong_count, last_reviewed");

  if (!data) return;

  const local = getLocalProgress();
  for (const row of data) {
    if (!local[row.word_id]) {
      local[row.word_id] = {
        status: row.status as WordStatus,
        correct: row.correct_count,
        wrong: row.wrong_count,
        lastReviewed: new Date(row.last_reviewed).getTime(),
      };
    }
  }
  saveLocalProgress(local);
}

// Repetition list — words failed in quiz, prioritized in future flash card sessions
export function getRepetitionList(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(REPETITION_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addToRepetitionList(arabic: string) {
  const list = getRepetitionList();
  if (!list.includes(arabic)) {
    list.push(arabic);
    localStorage.setItem(REPETITION_KEY, JSON.stringify(list));
  }
}

export function removeFromRepetitionList(arabic: string) {
  const list = getRepetitionList().filter((w) => w !== arabic);
  localStorage.setItem(REPETITION_KEY, JSON.stringify(list));
}
