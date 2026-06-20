"use client";

export interface VocabularyWord {
  arabic: string;
  malayalam: string;
  wordCount: number;
  count: number;
  verses: string[];
}

export interface VocabularyData {
  meta: {
    totalGroups: number;
    uniqueGroups: number;
    multiWordGroups: number;
    generatedAt: string;
  };
  words: VocabularyWord[];
}

export type ScopeType = "page" | "juz" | "surah";

let cachedVocab: VocabularyData | null = null;
let cachedVersePage: Record<string, number> | null = null;

export async function loadVocabulary(): Promise<VocabularyData> {
  if (cachedVocab) return cachedVocab;
  const res = await fetch("/vocabulary.json");
  const data: VocabularyData = await res.json();
  cachedVocab = data;
  return data;
}

export async function loadVersePageMap(): Promise<Record<string, number>> {
  if (cachedVersePage) return cachedVersePage;
  const res = await fetch("/verse-page-map.json");
  const data: Record<string, number> = await res.json();
  cachedVersePage = data;
  return data;
}

// Juz page ranges (start pages)
const JUZ_START_PAGES: Record<number, number> = {
  1: 1, 2: 22, 3: 42, 4: 62, 5: 82, 6: 102, 7: 122, 8: 142, 9: 162, 10: 182,
  11: 202, 12: 222, 13: 242, 14: 262, 15: 282, 16: 302, 17: 322, 18: 342, 19: 362, 20: 382,
  21: 402, 22: 422, 23: 442, 24: 462, 25: 482, 26: 502, 27: 522, 28: 542, 29: 562, 30: 582,
};

function getPageForJuz(juz: number): number {
  return JUZ_START_PAGES[juz] || 1;
}

function getJuzRange(juz: number): [number, number] {
  const start = JUZ_START_PAGES[juz] || 1;
  const nextStart = JUZ_START_PAGES[juz + 1] || 605;
  return [start, nextStart - 1];
}

export function filterByScope(
  words: VocabularyWord[],
  scopeType: ScopeType,
  scopeValue: number,
  versePageMap: Record<string, number>
): VocabularyWord[] {
  // scopeValue 0 = All Words (no filtering)
  if (scopeValue === 0) return words.filter((w) => w.verses && w.verses.length > 0);

  return words.filter((w) => {
    if (!w.verses || w.verses.length === 0) return false;

    return w.verses.some((vk) => {
      const page = versePageMap[vk];
      if (!page) return false;

      if (scopeType === "page") {
        return page === scopeValue;
      }

      if (scopeType === "juz") {
        const [minPage, maxPage] = getJuzRange(scopeValue);
        return page >= minPage && page <= maxPage;
      }

      if (scopeType === "surah") {
        const surah = parseInt(vk.split(":")[0]);
        return surah === scopeValue;
      }

      return false;
    });
  });
}
