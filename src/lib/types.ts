export interface SurahInfo {
  number: number;
  name: string;
  englishName: string;
  englishNameTranslation: string;
  numberOfAyahs: number;
  revelationType: string;
}

export interface AyahInfo {
  number: number;
  text: string;
  numberInSurah: number;
  juz: number;
  manzil: number;
  ruku: number;
  hizbQuarter: number;
  sajda: boolean | { id: number; recommended: boolean; obligatory: boolean };
  surah: SurahInfo;
}

export interface PageData {
  number: number;
  ayahs: AyahInfo[];
}

export interface Reciter {
  id: string;
  name: string;
  arabicName: string;
  quranComId: number | null;
}

export const RECITERS: Reciter[] = [
  { id: "ar.alafasy", name: "Mishary Rashid Alafasy", arabicName: "مشاري راشد العفاسي", quranComId: 7 },
  { id: "ar.abdurrahmaansudais", name: "Abdurrahman As-Sudais", arabicName: "عبد الرحمن السديس", quranComId: 3 },
  { id: "ar.husary", name: "Mahmoud Khalil Al-Husary", arabicName: "محمود خليل الحصري", quranComId: 6 },
  { id: "ar.mahirualmuaiqly", name: "Mahir Al-Muayqali", arabicName: "ماهر المعيقلي", quranComId: null },
];

export interface WordSegment {
  wordIndex: number;
  startMs: number;
  endMs: number;
}

export interface AyahSegments {
  verseKey: string;
  segments: WordSegment[];
}

export interface HighlightWord {
  verseKey: string;
  wordIndex: number;
}

export const MALAYALAM_EDITION = "ml.karakunnu";

export type AudioMode = "arabic" | "malayalam" | "both";

export const TOTAL_PAGES = 604;

export const JUZ_DATA = [
  { number: 1, name: "الجزء الأول", nameEn: "Juz 1", startPage: 1 },
  { number: 2, name: "الجزء الثاني", nameEn: "Juz 2", startPage: 22 },
  { number: 3, name: "الجزء الثالث", nameEn: "Juz 3", startPage: 42 },
  { number: 4, name: "الجزء الرابع", nameEn: "Juz 4", startPage: 62 },
  { number: 5, name: "الجزء الخامس", nameEn: "Juz 5", startPage: 82 },
  { number: 6, name: "الجزء السادس", nameEn: "Juz 6", startPage: 102 },
  { number: 7, name: "الجزء السابع", nameEn: "Juz 7", startPage: 122 },
  { number: 8, name: "الجزء الثامن", nameEn: "Juz 8", startPage: 142 },
  { number: 9, name: "الجزء التاسع", nameEn: "Juz 9", startPage: 162 },
  { number: 10, name: "الجزء العاشر", nameEn: "Juz 10", startPage: 182 },
  { number: 11, name: "الجزء الحادي عشر", nameEn: "Juz 11", startPage: 202 },
  { number: 12, name: "الجزء الثاني عشر", nameEn: "Juz 12", startPage: 222 },
  { number: 13, name: "الجزء الثالث عشر", nameEn: "Juz 13", startPage: 242 },
  { number: 14, name: "الجزء الرابع عشر", nameEn: "Juz 14", startPage: 262 },
  { number: 15, name: "الجزء الخامس عشر", nameEn: "Juz 15", startPage: 282 },
  { number: 16, name: "الجزء السادس عشر", nameEn: "Juz 16", startPage: 302 },
  { number: 17, name: "الجزء السابع عشر", nameEn: "Juz 17", startPage: 322 },
  { number: 18, name: "الجزء الثامن عشر", nameEn: "Juz 18", startPage: 342 },
  { number: 19, name: "الجزء التاسع عشر", nameEn: "Juz 19", startPage: 362 },
  { number: 20, name: "الجزء العشرون", nameEn: "Juz 20", startPage: 382 },
  { number: 21, name: "الجزء الحادي والعشرون", nameEn: "Juz 21", startPage: 402 },
  { number: 22, name: "الجزء الثاني والعشرون", nameEn: "Juz 22", startPage: 422 },
  { number: 23, name: "الجزء الثالث والعشرون", nameEn: "Juz 23", startPage: 442 },
  { number: 24, name: "الجزء الرابع والعشرون", nameEn: "Juz 24", startPage: 462 },
  { number: 25, name: "الجزء الخامس والعشرون", nameEn: "Juz 25", startPage: 482 },
  { number: 26, name: "الجزء السادس والعشرون", nameEn: "Juz 26", startPage: 502 },
  { number: 27, name: "الجزء السابع والعشرون", nameEn: "Juz 27", startPage: 522 },
  { number: 28, name: "الجزء الثامن والعشرون", nameEn: "Juz 28", startPage: 542 },
  { number: 29, name: "الجزء التاسع والعشرون", nameEn: "Juz 29", startPage: 562 },
  { number: 30, name: "الجزء الثلاثون", nameEn: "Juz 30", startPage: 582 },
];