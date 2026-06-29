export interface MushtabihatPair {
  ayah1: string;
  ayah2: string;
  category: string;
  note: string;
  source: "curated" | "pending";
  surah1: number;
  surah2: number;
  juz1: number;
  juz2: number;
  text1?: string;
  text2?: string;
}

let cachedPairs: MushtabihatPair[] | null = null;
const textCache = new Map<string, string>();

export async function loadMushtabihat(): Promise<MushtabihatPair[]> {
  if (cachedPairs) return cachedPairs;
  const res = await fetch("/mushtabihat.json");
  const data = await res.json();
  cachedPairs = data.pairs as MushtabihatPair[];
  return cachedPairs;
}

export function filterByJuzRange(
  pairs: MushtabihatPair[],
  startJuz: number,
  endJuz: number
): MushtabihatPair[] {
  return pairs.filter((p) => {
    return (
      p.juz1 >= startJuz && p.juz1 <= endJuz &&
      p.juz2 >= startJuz && p.juz2 <= endJuz
    );
  });
}

export async function fetchAyahText(verseKey: string): Promise<string> {
  if (textCache.has(verseKey)) return textCache.get(verseKey)!;
  try {
    const res = await fetch(
      `https://api.alquran.cloud/v1/ayah/${verseKey}/ar.alafasy`
    );
    const data = await res.json();
    const text = data.data?.text || "";
    textCache.set(verseKey, text);
    return text;
  } catch {
    return "";
  }
}

export async function fetchPairTexts(
  pair: MushtabihatPair
): Promise<{ text1: string; text2: string }> {
  const [text1, text2] = await Promise.all([
    fetchAyahText(pair.ayah1),
    fetchAyahText(pair.ayah2),
  ]);
  return { text1, text2 };
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Bookmarks ───────────────────────────────────────────────────────────────

const BOOKMARKS_KEY = "mushtabihat-bookmarks";

export function getBookmarks(): string[] {
  try {
    return JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function isBookmarked(pair: MushtabihatPair): boolean {
  return getBookmarks().includes(pairKey(pair));
}

export function toggleBookmark(pair: MushtabihatPair): boolean {
  const bookmarks = getBookmarks();
  const key = pairKey(pair);
  const idx = bookmarks.indexOf(key);
  if (idx >= 0) {
    bookmarks.splice(idx, 1);
  } else {
    bookmarks.push(key);
  }
  try { localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks)); } catch {}
  return idx < 0;
}

function pairKey(p: MushtabihatPair): string {
  return [p.ayah1, p.ayah2].sort().join("|");
}

export function getBookmarkedPairs(allPairs: MushtabihatPair[]): MushtabihatPair[] {
  const bookmarks = new Set(getBookmarks());
  return allPairs.filter((p) => bookmarks.has(pairKey(p)));
}
