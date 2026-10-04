import { AyahSegments, WordSegment } from "./types";

const API_BASE = "https://api.quran.com/api/v4";
const segmentCache = new Map<string, AyahSegments[]>();

function getCacheKey(quranComId: number, chapterNumber: number): string {
  return `${quranComId}:${chapterNumber}`;
}

async function fetchWithRetry(url: string, retries = 2): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      if (i === retries) return response;
    } catch {
      if (i === retries) throw new Error("Network error");
    }
    await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
  }
  throw new Error("Network error");
}

export async function fetchChapterSegments(
  quranComId: number,
  chapterNumber: number
): Promise<AyahSegments[]> {
  const cacheKey = getCacheKey(quranComId, chapterNumber);
  if (segmentCache.has(cacheKey)) {
    return segmentCache.get(cacheKey)!;
  }

  const response = await fetchWithRetry(
    `${API_BASE}/quran/recitations/${quranComId}?chapter_number=${chapterNumber}&fields=segments`
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch segments for recitation ${quranComId}, chapter ${chapterNumber}`);
  }

  const data = await response.json();
  const audioFiles: Array<{
    verse_key: string;
    segments: Array<Array<string | number>>;
  }> = data.audio_files;

  const result: AyahSegments[] = audioFiles.map((af) => ({
    verseKey: af.verse_key,
    segments: parseSegments(af.segments),
  }));

  segmentCache.set(cacheKey, result);
  return result;
}

function parseSegments(raw: Array<Array<string | number>>): WordSegment[] {
  const result: WordSegment[] = [];
  for (const seg of raw) {
    const fromIdx = typeof seg[0] === "string" ? parseInt(seg[0], 10) : Number(seg[0]);
    const toIdx = typeof seg[1] === "string" ? parseInt(seg[1], 10) : Number(seg[1]);
    const startMs = typeof seg[2] === "string" ? parseInt(seg[2], 10) : Number(seg[2]);
    const endMs = typeof seg[3] === "string" ? parseInt(seg[3], 10) : Number(seg[3]);

    if (!isNaN(fromIdx) && !isNaN(startMs) && !isNaN(endMs)) {
      if (!isNaN(toIdx) && toIdx > fromIdx) {
        for (let w = fromIdx; w < toIdx; w++) {
          result.push({ wordIndex: w, startMs, endMs });
        }
      } else {
        result.push({ wordIndex: fromIdx, startMs, endMs });
      }
    }
  }
  return result;
}

export function findWordAtTime(
  segments: AyahSegments[],
  verseKey: string,
  currentTimeMs: number
): number | null {
  const ayahSegments = segments.find((s) => s.verseKey === verseKey);
  if (!ayahSegments) return null;

  for (const seg of ayahSegments.segments) {
    if (currentTimeMs >= seg.startMs && currentTimeMs < seg.endMs) {
      return seg.wordIndex;
    }
  }
  return null;
}

export function findWordsAtTime(
  segments: AyahSegments[],
  verseKey: string,
  currentTimeMs: number
): number[] {
  const ayahSegments = segments.find((s) => s.verseKey === verseKey);
  if (!ayahSegments) return [];

  const words = new Set<number>();
  for (const seg of ayahSegments.segments) {
    if (currentTimeMs >= seg.startMs && currentTimeMs < seg.endMs) {
      words.add(seg.wordIndex);
    }
  }
  return Array.from(words);
}