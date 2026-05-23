"use client";

import { PageData } from "@/lib/types";

interface QuranPageProps {
  pageData: PageData | null;
  currentPage: number;
  loading: boolean;
}

export default function QuranPage({ pageData, currentPage, loading }: QuranPageProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-5 h-5 border-2 border-[var(--foreground)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!pageData) {
    return null;
  }

  const ayahsBySurah = pageData.ayahs.reduce<
    Record<
      string,
      {
        surah: (typeof pageData.ayahs)[0]["surah"];
        ayahs: (typeof pageData.ayahs)[0][];
      }
    >
  >((acc, ayah) => {
    const key = ayah.surah.number.toString();
    if (!acc[key]) {
      acc[key] = { surah: ayah.surah, ayahs: [] };
    }
    acc[key].ayahs.push(ayah);
    return acc;
  }, {});

  const currentJuz = pageData.ayahs[0]?.juz ?? 1;

  return (
    <div className="quran-page-container">
      <div className="text-center mb-6 text-xs text-[var(--muted)] tracking-wide uppercase">
        Juz {currentJuz} &middot; Page {currentPage}
      </div>

      {Object.entries(ayahsBySurah).map(([, group]) => (
        <div key={group.surah.number} className="mb-8 last:mb-0">
          {group.ayahs[0].numberInSurah === 1 && (
            <div className="surah-header">
              <h2 className="text-[1.75rem] font-bold leading-tight">
                {group.surah.name}
              </h2>
              <p className="text-xs text-[var(--muted)] mt-1 tracking-wide">
                {group.surah.englishName} — {group.surah.englishNameTranslation}
              </p>
              {group.surah.number !== 1 && group.surah.number !== 9 && (
                <div className="bismillah mt-3">
                  بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ
                </div>
              )}
            </div>
          )}

          <div className="ayah-text-area">
            {group.ayahs.map((ayah) => (
              <span key={ayah.number} className="ayah-inline">
                {ayah.text}
                <sup className="ayah-number">{ayah.numberInSurah}</sup>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}