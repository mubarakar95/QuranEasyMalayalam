"use client";

import { useState, useEffect, useCallback } from "react";
import { RECITERS, TOTAL_PAGES, MALAYALAM_EDITION } from "@/lib/types";
import {
  storeAudioBlob,
  getDownloadedSurahs,
  storePageData,
  storeAyahPageData,
  storeTranslationPageData,
  storeFontData,
  hasPageData,
  getStorageEstimate,
  clearAllOfflineData,
  SURAH_AYAH_COUNTS,
} from "@/lib/db";
import { getAudioUrl } from "@/lib/quran-api";

interface DownloadManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = "audio" | "pages";

const SURAH_NAMES = [
  "Al-Fatihah", "Al-Baqarah", "Aal-E-Imran", "An-Nisa", "Al-Ma'idah",
  "Al-An'am", "Al-A'raf", "Al-Anfal", "At-Tawbah", "Yunus",
  "Hud", "Yusuf", "Ar-Ra'd", "Ibrahim", "Al-Hijr",
  "An-Nahl", "Al-Isra", "Al-Kahf", "Maryam", "Taha",
  "Al-Anbiya", "Al-Hajj", "Al-Mu'minun", "An-Nur", "Al-Furqan",
  "Ash-Shu'ara", "An-Naml", "Al-Qasas", "Al-Ankabut", "Ar-Rum",
  "Luqman", "As-Sajdah", "Al-Ahzab", "Saba", "Fatir",
  "Ya Sin", "As-Saffat", "Sad", "Az-Zumar", "Ghafir",
  "Fussilat", "Ash-Shuraa", "Az-Zukhruf", "Ad-Dukhan", "Al-Jathiyah",
  "Al-Ahqaf", "Muhammad", "Al-Fath", "Al-Hujurat", "Qaf",
  "Adh-Dhariyat", "At-Tur", "An-Najm", "Al-Qamar", "Ar-Rahman",
  "Al-Waqi'ah", "Al-Hadid", "Al-Mujadilah", "Al-Hashr", "Al-Mumtahanah",
  "As-Saf", "Al-Jumu'ah", "Al-Munafiqun", "At-Taghabun", "At-Talaq",
  "At-Tahrim", "Al-Mulk", "Al-Qalam", "Al-Haqqah", "Al-Ma'arij",
  "Nuh", "Al-Jinn", "Al-Muzzammil", "Al-Muddaththir", "Al-Qiyamah",
  "Al-Insan", "Al-Mursalat", "An-Naba", "An-Nazi'at", "Abasa",
  "At-Takwir", "Al-Infitar", "Al-Mutaffifin", "Al-Inshiqaq", "Al-Buruj",
  "At-Tariq", "Al-A'la", "Al-Ghashiyah", "Al-Fajr", "Al-Balad",
  "Ash-Shams", "Al-Layl", "Ad-Duhaa", "Ash-Sharh", "At-Tin",
  "Al-Alaq", "Al-Qadr", "Al-Bayyinah", "Az-Zalzalah", "Al-Adiyat",
  "Al-Qari'ah", "At-Takathur", "Al-Asr", "Al-Humazah", "Al-Fil",
  "Quraysh", "Al-Ma'un", "Al-Kawthar", "Al-Kafirun", "An-Nasr",
  "Al-Masad", "Al-Ikhlas", "Al-Falaq", "An-Nas",
];

function proxyAudioUrl(url: string): string {
  return `/api/audio?url=${encodeURIComponent(url)}`;
}

const globalAyahOffset = (() => {
  const offsets = new Array(115);
  offsets[0] = 0;
  for (let i = 1; i <= 114; i++) {
    offsets[i] = offsets[i - 1] + SURAH_AYAH_COUNTS[i - 1];
  }
  return offsets;
})();

function getGlobalAyahNumber(surah: number, ayahInSurah: number): number {
  return globalAyahOffset[surah - 1] + ayahInSurah;
}

export default function DownloadManager({ isOpen, onClose }: DownloadManagerProps) {
  const [tab, setTab] = useState<Tab>("audio");
  const [selectedReciter, setSelectedReciter] = useState(RECITERS[0].id);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, label: "" });
  const [audioStatus, setAudioStatus] = useState<Map<number, boolean>>(new Map());
  const [pageStatus, setPageStatus] = useState<Map<number, boolean>>(new Map());
  const [storageInfo, setStorageInfo] = useState({ used: 0, quota: 0 });

  const refreshStorage = useCallback(async () => {
    const est = await getStorageEstimate();
    setStorageInfo(est);
  }, []);

  const refreshAudioStatus = useCallback(async () => {
    const map = await getDownloadedSurahs(selectedReciter, SURAH_AYAH_COUNTS);
    setAudioStatus(map);
  }, [selectedReciter]);

  const refreshPageStatus = useCallback(async () => {
    const map = new Map<number, boolean>();
    for (let p = 1; p <= TOTAL_PAGES; p++) {
      map.set(p, await hasPageData(p));
    }
    setPageStatus(map);
  }, []);

  useEffect(() => {
    if (isOpen) {
      refreshStorage();
      refreshAudioStatus();
      refreshPageStatus();
    }
  }, [isOpen, refreshAudioStatus, refreshPageStatus, refreshStorage]);

  useEffect(() => {
    if (isOpen) {
      refreshAudioStatus();
    }
  }, [selectedReciter, isOpen, refreshAudioStatus]);

  const downloadSurah = useCallback(async (surahNum: number) => {
    const reciter = RECITERS.find((r) => r.id === selectedReciter);
    if (!reciter) return;
    const ayahCount = SURAH_AYAH_COUNTS[surahNum - 1];
    setDownloading(true);
    setProgress({ current: 0, total: ayahCount, label: SURAH_NAMES[surahNum - 1] });
    let failed = 0;
    for (let a = 1; a <= ayahCount; a++) {
      try {
        const globalAyah = getGlobalAyahNumber(surahNum, a);
        const url = getAudioUrl(reciter, surahNum, a, globalAyah);
        const res = await fetch(proxyAudioUrl(url));
        if (res.ok) {
          const blob = await res.blob();
          await storeAudioBlob(selectedReciter, surahNum, a, blob);
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
      setProgress({ current: a, total: ayahCount, label: SURAH_NAMES[surahNum - 1] });
    }
    setDownloading(false);
    setAudioStatus((prev) => {
      const next = new Map(prev);
      next.set(surahNum, failed < ayahCount);
      return next;
    });
    if (failed > 0) {
      console.warn(`Surah ${surahNum}: ${failed}/${ayahCount} ayahs failed to download`);
    }
    await refreshStorage();
  }, [selectedReciter, refreshStorage]);

  const downloadAllAudio = useCallback(async () => {
    const reciter = RECITERS.find((r) => r.id === selectedReciter);
    if (!reciter) return;
    setDownloading(true);
    let ayahIdx = 0;
    const totalAyahs = SURAH_AYAH_COUNTS.reduce((a, b) => a + b, 0);
    for (let s = 1; s <= 114; s++) {
      const ayahCount = SURAH_AYAH_COUNTS[s - 1];
      let failed = 0;
      for (let a = 1; a <= ayahCount; a++) {
        ayahIdx++;
        try {
          const globalAyah = getGlobalAyahNumber(s, a);
          const url = getAudioUrl(reciter, s, a, globalAyah);
          const res = await fetch(proxyAudioUrl(url));
          if (res.ok) {
            const blob = await res.blob();
            await storeAudioBlob(selectedReciter, s, a, blob);
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
        setProgress({ current: ayahIdx, total: totalAyahs, label: SURAH_NAMES[s - 1] });
      }
      setAudioStatus((prev) => {
        const next = new Map(prev);
        next.set(s, failed < ayahCount);
        return next;
      });
    }
    setDownloading(false);
    await refreshStorage();
  }, [selectedReciter, refreshStorage]);

  const downloadAllPages = useCallback(async () => {
    const CDN_URL = "https://cdn.jsdelivr.net/gh/MohamadHajjRabee/quran-qcf4@main";
    setDownloading(true);

    setProgress({ current: 0, total: TOTAL_PAGES, label: "Downloading pages..." });
    const fontsNeeded = new Set<string>();
    for (let p = 1; p <= TOTAL_PAGES; p++) {
      try {
        const padded = p.toString().padStart(3, "0");
        const [qcf4Res, ayahRes, transRes] = await Promise.allSettled([
          fetch(`/api/qcf4/${padded}`),
          fetch(`https://api.alquran.cloud/v1/page/${p}/quran-uthmani`),
          fetch(`https://api.alquran.cloud/v1/page/${p}/${MALAYALAM_EDITION}`),
        ]);
        if (qcf4Res.status === "fulfilled" && qcf4Res.value.ok) {
          const data = await qcf4Res.value.json();
          await storePageData(p, data);
          if (data.font) fontsNeeded.add(data.font);
          for (const line of data.lines || []) {
            for (const word of line.words || []) {
              if (word.font) fontsNeeded.add(word.font);
            }
          }
        }
        if (ayahRes.status === "fulfilled" && ayahRes.value.ok) {
          const data = await ayahRes.value.json();
          await storeAyahPageData(p, { number: data.data.number, ayahs: data.data.ayahs });
        }
        if (transRes.status === "fulfilled" && transRes.value.ok) {
          const data = await transRes.value.json();
          const map: Record<string, string> = {};
          for (const ayah of data.data.ayahs) {
            map[`${ayah.surah.number}:${ayah.numberInSurah}`] = ayah.text;
          }
          await storeTranslationPageData(p, map);
        }
      } catch {
        /* skip */
      }
      setProgress({ current: p, total: TOTAL_PAGES, label: "Downloading pages..." });
      setPageStatus((prev) => {
        const next = new Map(prev);
        next.set(p, true);
        return next;
      });
    }

    const fontList = [...fontsNeeded];
    setProgress({ current: 0, total: fontList.length, label: "Downloading fonts..." });
    for (let i = 0; i < fontList.length; i++) {
      const fontName = fontList[i];
      try {
        const resp = await fetch(`${CDN_URL}/fonts-woff2/${fontName}_W.woff2`);
        if (resp.ok) {
          const buf = await resp.arrayBuffer();
          await storeFontData(fontName, buf);
        }
      } catch { /* skip */ }
      setProgress({ current: i + 1, total: fontList.length, label: "Downloading fonts..." });
    }

    setDownloading(false);
    await refreshStorage();
  }, [refreshStorage]);

  const handleClearAll = useCallback(async () => {
    if (!confirm("Delete all downloaded data?")) return;
    await clearAllOfflineData();
    await refreshAudioStatus();
    await refreshPageStatus();
    await refreshStorage();
  }, [refreshAudioStatus, refreshPageStatus, refreshStorage]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  if (!isOpen) return null;

  const audioDownloadedCount = Array.from(audioStatus.values()).filter(Boolean).length;
  const pagesDownloadedCount = Array.from(pageStatus.values()).filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-[var(--background)] w-full max-w-lg rounded-t-2xl max-h-[85vh] flex flex-col animate-[slideUp_0.25s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-[var(--background)] border-b border-[var(--border)] px-4 py-3 flex items-center justify-between z-10">
          <h2 className="text-sm font-semibold">Downloads</h2>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-[var(--muted)]">
              {formatBytes(storageInfo.used)} / {formatBytes(storageInfo.quota)}
            </span>
            <button onClick={onClose} className="p-1.5 rounded-md hover:bg-[var(--surface)]" aria-label="Close">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-4 py-2 flex gap-0.5 bg-[var(--surface)] rounded-lg p-0.5 mx-4 mt-3">
          {(["audio", "pages"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-all ${
                tab === t
                  ? "bg-[var(--foreground)] text-[var(--background)]"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {t === "audio" ? `Audio (${audioDownloadedCount}/114)` : `Pages (${pagesDownloadedCount}/${TOTAL_PAGES})`}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {tab === "audio" && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-[var(--muted)] mb-1.5 block">Reciter</label>
                <select
                  value={selectedReciter}
                  onChange={(e) => setSelectedReciter(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]"
                >
                  {RECITERS.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>

              {downloading && (
                <div className="bg-[var(--surface)] rounded-lg p-3">
                  <div className="flex items-center justify-between text-xs text-[var(--muted)] mb-2">
                    <span>{progress.label}</span>
                    <span>{progress.current}/{progress.total}</span>
                  </div>
                  <div className="h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--foreground)] rounded-full transition-all duration-200"
                      style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={downloadAllAudio}
                  disabled={downloading}
                  className="flex-1 py-2 text-xs font-medium bg-[var(--foreground)] text-[var(--background)] rounded-md hover:opacity-90 disabled:opacity-50"
                >
                  {downloading ? "Downloading..." : "Download All Surahs"}
                </button>
                <button
                  onClick={handleClearAll}
                  disabled={downloading}
                  className="px-3 py-2 text-xs font-medium border border-[var(--border)] rounded-md text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface)] disabled:opacity-50"
                >
                  Clear
                </button>
              </div>

              <div className="space-y-px">
                {Array.from({ length: 114 }, (_, i) => i + 1).map((s) => {
                  const downloaded = audioStatus.get(s) ?? false;
                  return (
                    <button
                      key={s}
                      onClick={() => !downloading && !downloaded && downloadSurah(s)}
                      disabled={downloading || downloaded}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs transition-colors ${
                        downloaded
                          ? "bg-[var(--surface)] text-[var(--muted)]"
                          : "hover:bg-[var(--surface)]"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="w-5 text-[10px] text-[var(--muted)] tabular-nums">{s}</span>
                        <span>{SURAH_NAMES[s - 1]}</span>
                      </span>
                      <span className="text-[10px] text-[var(--muted)]">
                        {downloaded ? (
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5 text-green-600">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                        ) : (
                          <span>{SURAH_AYAH_COUNTS[s - 1]} ayahs</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "pages" && (
            <div className="space-y-3">
              {downloading && (
                <div className="bg-[var(--surface)] rounded-lg p-3">
                  <div className="flex items-center justify-between text-xs text-[var(--muted)] mb-2">
                    <span>{progress.label}</span>
                    <span>{progress.current}/{progress.total}</span>
                  </div>
                  <div className="h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--foreground)] rounded-full transition-all duration-200"
                      style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={downloadAllPages}
                  disabled={downloading}
                  className="flex-1 py-2 text-xs font-medium bg-[var(--foreground)] text-[var(--background)] rounded-md hover:opacity-90 disabled:opacity-50"
                >
                  {downloading ? "Downloading..." : `Download All Pages (${TOTAL_PAGES})`}
                </button>
                <button
                  onClick={handleClearAll}
                  disabled={downloading}
                  className="px-3 py-2 text-xs font-medium border border-[var(--border)] rounded-md text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface)] disabled:opacity-50"
                >
                  Clear
                </button>
              </div>

              <div className="grid grid-cols-10 gap-1">
                {Array.from({ length: TOTAL_PAGES }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    className={`h-7 rounded text-[9px] tabular-nums transition-colors ${
                      pageStatus.get(p)
                        ? "bg-[var(--foreground)] text-[var(--background)]"
                        : "bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--border)]"
                    }`}
                    title={`Page ${p}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
