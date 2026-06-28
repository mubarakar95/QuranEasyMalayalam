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
