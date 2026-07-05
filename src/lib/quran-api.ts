import { PageData, TOTAL_PAGES, MALAYALAM_EDITION, Reciter } from "./types";

const API_BASE = "https://api.alquran.cloud/v1";

const pageCache = new Map<number, PageData>();
const translationCache = new Map<number, Map<string, string>>();

async function fetchWithRetry(url: string, retries = 2): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      if (i === retries) return response;
    } catch {
      if (i === retries) throw new Error("Network error. Please check your internet connection.");
    }
    await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
  }
  throw new Error("Network error. Please check your internet connection.");
}

export async function fetchPage(pageNumber: number): Promise<PageData> {
  if (pageNumber < 1 || pageNumber > TOTAL_PAGES) {
    throw new Error(`Page number must be between 1 and ${TOTAL_PAGES}`);
  }

  if (pageCache.has(pageNumber)) {
    return pageCache.get(pageNumber)!;
  }

  const response = await fetchWithRetry(`${API_BASE}/page/${pageNumber}/quran-uthmani`);
  if (!response.ok) {
    throw new Error(`Failed to load page ${pageNumber}. Please try again.`);
  }

  const data = await response.json();
  const pageData: PageData = {
    number: data.data.number,
    ayahs: data.data.ayahs,
  };

  pageCache.set(pageNumber, pageData);
  return pageData;
}

export function getAudioUrl(reciter: Reciter, surahNumber: number, ayahInSurah: number, globalAyahNumber: number): string {
  if (reciter.audioFormat === "global") {
    return `${reciter.audioBase}/${globalAyahNumber}.mp3`;
  }
  const s = surahNumber.toString().padStart(3, "0");
  const a = ayahInSurah.toString().padStart(3, "0");
  return `${reciter.audioBase}/${s}${a}.mp3`;
}

export function getSurahListUrl(): string {
  return `${API_BASE}/surah`;
}

export async function fetchTranslationPage(pageNumber: number): Promise<Map<string, string>> {
  if (pageNumber < 1 || pageNumber > TOTAL_PAGES) {
    throw new Error(`Page number must be between 1 and ${TOTAL_PAGES}`);
  }

  if (translationCache.has(pageNumber)) {
    return translationCache.get(pageNumber)!;
  }

  const response = await fetchWithRetry(`${API_BASE}/page/${pageNumber}/${MALAYALAM_EDITION}`);
  if (!response.ok) {
    throw new Error(`Failed to load translation for page ${pageNumber}. Please try again.`);
  }

  const data = await response.json();
  const translationMap = new Map<string, string>();

  for (const ayah of data.data.ayahs) {
    const key = `${ayah.surah.number}:${ayah.numberInSurah}`;
    translationMap.set(key, ayah.text);
  }

  translationCache.set(pageNumber, translationMap);
  return translationMap;
}

export const LALITHASARAM_AUDIO_BASE = "https://lalithasaram.net/audio/qtaud/transl";

export function getMalayalamAyahAudioUrl(surahNumber: number, ayahInSurah: number): string {
  const s = surahNumber.toString().padStart(3, "0");
  const a = ayahInSurah.toString().padStart(3, "0");
  return `${LALITHASARAM_AUDIO_BASE}/${s}_${a}.mp3`;
}