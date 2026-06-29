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

// ─── Hidden / Spam pairs ────────────────────────────────────────────────────

const HIDDEN_KEY = "mushtabihat-hidden";

export function getHiddenKeys(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]");
  } catch {
    return [];
  }
}

export function isHidden(pair: MushtabihatPair): boolean {
  return getHiddenKeys().includes(pairKey(pair));
}

export function toggleHidden(pair: MushtabihatPair): boolean {
  const keys = getHiddenKeys();
  const key = pairKey(pair);
  const idx = keys.indexOf(key);
  if (idx >= 0) {
    keys.splice(idx, 1);
  } else {
    keys.push(key);
  }
  try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(keys)); } catch {}
  return idx < 0;
}

export function filterHidden(pairs: MushtabihatPair[]): MushtabihatPair[] {
  const keys = new Set(getHiddenKeys());
  return pairs.filter((p) => !keys.has(pairKey(p)));
}

export function getHiddenPairs(allPairs: MushtabihatPair[]): MushtabihatPair[] {
  const keys = new Set(getHiddenKeys());
  return allPairs.filter((p) => keys.has(pairKey(p)));
}

// ─── Supabase sync ──────────────────────────────────────────────────────────

import { createClient } from "@/lib/supabase/client";

export async function syncBookmarksToSupabase(userId: string) {
  const supabase = createClient();
  const keys = getBookmarks();
  if (keys.length === 0) {
    // Clear all remote bookmarks
    await supabase.from("user_mushtabihat_bookmarks").delete().eq("user_id", userId);
    return;
  }

  const rows = keys.map((key) => {
    const [a1, a2] = key.split("|");
    return { user_id: userId, ayah1: a1, ayah2: a2 };
  });

  await supabase.from("user_mushtabihat_bookmarks").delete().eq("user_id", userId);
  const { error } = await supabase
    .from("user_mushtabihat_bookmarks")
    .upsert(rows, { onConflict: "user_id,ayah1,ayah2" });

  if (error) console.error("Bookmark sync failed:", error);
}

export async function loadBookmarksFromSupabase(userId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("user_mushtabihat_bookmarks")
    .select("ayah1, ayah2");

  const remoteKeys = new Set((data || []).map((r) => [r.ayah1, r.ayah2].sort().join("|")));
  const localKeys = new Set(getBookmarks());
  const merged = new Set([...localKeys, ...remoteKeys]);

  try {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify([...merged]));
  } catch {}

  // Always push merged data back to keep remote in sync
  await syncBookmarksToSupabase(userId);
}

// ─── Hidden pairs Supabase sync ─────────────────────────────────────────────

export async function syncHiddenToSupabase(userId: string) {
  const supabase = createClient();
  const keys = getHiddenKeys();
  if (keys.length === 0) {
    await supabase.from("user_mushtabihat_hidden").delete().eq("user_id", userId);
    return;
  }

  const rows = keys.map((key) => {
    const [a1, a2] = key.split("|");
    return { user_id: userId, ayah1: a1, ayah2: a2 };
  });

  await supabase.from("user_mushtabihat_hidden").delete().eq("user_id", userId);
  const { error } = await supabase
    .from("user_mushtabihat_hidden")
    .upsert(rows, { onConflict: "user_id,ayah1,ayah2" });

  if (error) console.error("Hidden sync failed:", error);
}

export async function loadHiddenFromSupabase(userId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("user_mushtabihat_hidden")
    .select("ayah1, ayah2");

  const remoteKeys = new Set((data || []).map((r) => [r.ayah1, r.ayah2].sort().join("|")));
  const localKeys = new Set(getHiddenKeys());
  const merged = new Set([...localKeys, ...remoteKeys]);

  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...merged]));
  } catch {}

  // Always push merged data back to keep remote in sync
  await syncHiddenToSupabase(userId);
}
