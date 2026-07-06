const DB_NAME = "quran-easy-offline";
const DB_VERSION = 1;

const AUDIO_STORE = "audio";
const PAGE_STORE = "pages";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(AUDIO_STORE)) {
        db.createObjectStore(AUDIO_STORE);
      }
      if (!db.objectStoreNames.contains(PAGE_STORE)) {
        db.createObjectStore(PAGE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function audioKey(reciterId: string, surah: number, ayah: number): string {
  return `${reciterId}_${surah}_${ayah}`;
}

export async function storeAudioBlob(
  reciterId: string,
  surah: number,
  ayah: number,
  blob: Blob
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, "readwrite");
    tx.objectStore(AUDIO_STORE).put(blob, audioKey(reciterId, surah, ayah));
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getAudioBlob(
  reciterId: string,
  surah: number,
  ayah: number
): Promise<Blob | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, "readonly");
    const req = tx.objectStore(AUDIO_STORE).get(audioKey(reciterId, surah, ayah));
    req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function hasAudioBlob(
  reciterId: string,
  surah: number,
  ayah: number
): Promise<boolean> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, "readonly");
    const req = tx.objectStore(AUDIO_STORE).count(audioKey(reciterId, surah, ayah));
    req.onsuccess = () => { db.close(); resolve(req.result > 0); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function hasAudioForSurah(
  reciterId: string,
  surah: number,
  ayahCount: number
): Promise<boolean> {
  for (let a = 1; a <= ayahCount; a++) {
    const exists = await hasAudioBlob(reciterId, surah, a);
    if (!exists) return false;
  }
  return true;
}

export async function getDownloadedSurahs(
  reciterId: string,
  ayahCounts: number[]
): Promise<Map<number, boolean>> {
  const map = new Map<number, boolean>();
  try {
    const db = await openDB();
    const tx = db.transaction(AUDIO_STORE, "readonly");
    const store = tx.objectStore(AUDIO_STORE);

    const allKeys: string[] = await new Promise((resolve, reject) => {
      const req = store.getAllKeys();
      req.onsuccess = () => { resolve(req.result as string[]); };
      req.onerror = () => { reject(req.error); };
    });
    db.close();

    const prefix = `${reciterId}_`;
    const surahCounts = new Map<number, Set<number>>();

    for (const key of allKeys) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      const parts = rest.split("_");
      if (parts.length !== 2) continue;
      const surah = parseInt(parts[0]);
      const ayah = parseInt(parts[1]);
      if (isNaN(surah) || isNaN(ayah)) continue;
      if (!surahCounts.has(surah)) surahCounts.set(surah, new Set());
      surahCounts.get(surah)!.add(ayah);
    }

    for (let s = 1; s <= ayahCounts.length; s++) {
      const expected = ayahCounts[s - 1];
      const downloaded = surahCounts.get(s);
      map.set(s, downloaded ? downloaded.size >= expected : false);
    }
  } catch (e) {
    console.error("getDownloadedSurahs failed:", e);
    for (let s = 1; s <= ayahCounts.length; s++) {
      map.set(s, false);
    }
  }

  return map;
}

export async function storePageData(
  pageNum: number,
  data: unknown
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PAGE_STORE, "readwrite");
    tx.objectStore(PAGE_STORE).put(data, `page_${pageNum}`);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function storeAyahPageData(
  pageNum: number,
  data: unknown
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PAGE_STORE, "readwrite");
    tx.objectStore(PAGE_STORE).put(data, `ayahs_${pageNum}`);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getAyahPageData(pageNum: number): Promise<unknown | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PAGE_STORE, "readonly");
    const req = tx.objectStore(PAGE_STORE).get(`ayahs_${pageNum}`);
    req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function storeTranslationPageData(
  pageNum: number,
  data: unknown
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PAGE_STORE, "readwrite");
    tx.objectStore(PAGE_STORE).put(data, `trans_${pageNum}`);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getTranslationPageData(pageNum: number): Promise<unknown | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PAGE_STORE, "readonly");
    const req = tx.objectStore(PAGE_STORE).get(`trans_${pageNum}`);
    req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function getPageData(pageNum: number): Promise<unknown | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PAGE_STORE, "readonly");
    const req = tx.objectStore(PAGE_STORE).get(`page_${pageNum}`);
    req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function hasPageData(pageNum: number): Promise<boolean> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PAGE_STORE, "readonly");
    const req = tx.objectStore(PAGE_STORE).count(`page_${pageNum}`);
    req.onsuccess = () => { db.close(); resolve(req.result > 0); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function getStorageEstimate(): Promise<{ used: number; quota: number }> {
  if (navigator.storage && navigator.storage.estimate) {
    const est = await navigator.storage.estimate();
    return { used: est.usage ?? 0, quota: est.quota ?? 0 };
  }
  return { used: 0, quota: 0 };
}

export async function clearAllOfflineData(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([AUDIO_STORE, PAGE_STORE], "readwrite");
    tx.objectStore(AUDIO_STORE).clear();
    tx.objectStore(PAGE_STORE).clear();
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export const SURAH_AYAH_COUNTS = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109,
  123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
  112, 78, 118, 64, 77, 227, 93, 88, 69, 37,
  35, 30, 73, 54, 45, 83, 182, 88, 75, 85,
  54, 53, 89, 59, 37, 35, 38, 28, 28, 20,
  56, 40, 31, 50, 40, 46, 42, 29, 19, 36,
  25, 22, 17, 19, 26, 30, 20, 15, 21, 11,
  8, 8, 19, 5, 8, 8, 11, 11, 8, 3,
  9, 5, 4, 7, 3, 6, 3, 5, 4, 5,
  6, 3, 5, 4, 3, 3, 3, 5, 5, 3,
  4, 4, 3, 3, 3, 3, 3, 3, 3, 3,
  3, 3, 3, 3, 3, 3, 3, 3, 3, 3,
];
