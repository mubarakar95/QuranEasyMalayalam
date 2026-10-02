import { TOTAL_PAGES } from "./types";
import { fetchPage, fetchTranslationPage } from "./quran-api";

export interface PageLine {
  line: number;
  words: PageWord[];
}

export interface PageWord {
  code: number;
  char: string;
  font: string;
  text: string;
  type: "word" | "end" | "surah_header" | "bismillah";
  verse_key?: string;
  sura?: number;
  position: number;
}

export interface PageData2 {
  page: number;
  font: string;
  surahs: { id: number; name: string; name_arabic: string; verse_start: number; verse_end: number }[];
  lines: PageLine[];
}

const RAW_BASE = "https://raw.githubusercontent.com/MohamadHajjRabee/quran-qcf4/main";
const CDN_URL = "https://cdn.jsdelivr.net/gh/MohamadHajjRabee/quran-qcf4@main";

const fontCache = new Set<string>();
const pageCache = new Map<number, PageData2>();

let dbModule: typeof import("./db") | null = null;
async function getDb() {
  if (!dbModule) {
    try { dbModule = await import("./db"); } catch { return null; }
  }
  return dbModule;
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label?: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(label ? `${label} timed out after ${ms}ms` : `Timed out after ${ms}ms`)), ms)
    ),
  ]);
}

async function fetchPageJson(page: number): Promise<PageData2> {
  const db = await getDb();
  if (db) {
    const cached = await db.getPageData(page);
    if (cached) return cached as PageData2;
  }

  const padded = page.toString().padStart(3, "0");

  const urls = [
    `/api/qcf4/${padded}`,
    `${RAW_BASE}/pages/${padded}.json`,
    `${CDN_URL}/pages/${padded}.json`,
  ];

  let data: PageData2 | null = null;
  for (const url of urls) {
    try {
      const res = await withTimeout(fetch(url), 5000, `Fetch page ${page}`);
      if (res.ok) { data = await res.json(); break; }
    } catch {
      /* try next fallback */
    }
  }

  if (!data) throw new Error("Failed to load page data. Please check your connection and try again.");

  if (db) {
    try { await db.storePageData(page, data); } catch { /* ignore */ }
  }

  return data;
}

export async function fetchPageData(page: number): Promise<PageData2> {
  if (pageCache.has(page)) return pageCache.get(page)!;

  const data = await fetchPageJson(page);
  pageCache.set(page, data);
  if (data.font) {
    loadSingleFont(data.font).catch(() => {});
  }
  for (const line of data.lines || []) {
    for (const word of line.words || []) {
      if (word.font && word.font !== data.font) {
        loadPageFont(word.font).catch(() => {});
      }
    }
  }
  return data;
}

const fontPromises = new Map<string, Promise<void>>();

export function isFontLoaded(fontName: string): boolean {
  if (fontCache.has(fontName)) return true;
  if (typeof document !== "undefined" && document.fonts) {
    try {
      return document.fonts.check(`12px "${fontName}"`);
    } catch {
      return false;
    }
  }
  return false;
}

export function getCachedPageData(page: number): PageData2 | null {
  return pageCache.get(page) || null;
}

export async function prefetchPage(page: number): Promise<void> {
  if (typeof window === "undefined" || page < 1 || page > TOTAL_PAGES) return;
  try {
    const data = await fetchPageData(page);
    const fonts = new Set<string>();
    if (data.font) fonts.add(data.font);
    for (const line of data.lines || []) {
      for (const word of line.words || []) {
        if (word.font) fonts.add(word.font);
      }
    }
    await Promise.all([...fonts].map((f) => loadPageFont(f).catch(() => {})));
  } catch {}
}

async function loadSingleFont(fontName: string): Promise<void> {
  if (fontCache.has(fontName)) return;
  if (fontPromises.has(fontName)) return fontPromises.get(fontName)!;

  const promise = (async () => {
    const db = await getDb();
    if (db) {
      const cached = await db.getFontData(fontName);
      if (cached) {
        try {
          const fontFace = new FontFace(fontName, cached, {
            style: "normal",
            weight: "normal",
            display: "block",
          });
          await fontFace.load();
          document.fonts.add(fontFace);
          fontCache.add(fontName);
          return;
        } catch {
          /* fallback to network */
        }
      }
    }

    const suffix = fontName === "QCF4_QBSML" ? "" : "_W";
    const fontUrls = [
      `${RAW_BASE}/fonts-woff2/${fontName}${suffix}.woff2`,
      `${CDN_URL}/fonts-woff2/${fontName}${suffix}.woff2`,
    ];

    let loaded = false;
    for (const fontUrl of fontUrls) {
      try {
        const fontFace = new FontFace(
          fontName,
          `url(${fontUrl}) format('woff2')`,
          { style: "normal", weight: "normal", display: "block" }
        );

        await withTimeout(fontFace.load(), 6000, `Font load ${fontName}`);
        document.fonts.add(fontFace);
        fontCache.add(fontName);
        loaded = true;

        if (db) {
          fetch(fontUrl)
            .then(async (resp) => {
              if (resp.ok) {
                const buf = await resp.arrayBuffer();
                await db.storeFontData(fontName, buf);
              }
            })
            .catch(() => {});
        }
        break;
      } catch (err) {
        console.warn(`Font load attempt for ${fontName} from ${fontUrl} failed:`, err);
      }
    }

    if (!loaded) {
      fontCache.add(fontName);
    }
  })().finally(() => {
    fontPromises.delete(fontName);
  });

  fontPromises.set(fontName, promise);
  return promise;
}

export async function loadPageFont(fontName: string): Promise<string> {
  await loadSingleFont(fontName);

  if (fontName === "QCF4_Hafs_01" && !fontCache.has("QCF4_QBSML")) {
    await loadSingleFont("QCF4_QBSML");
  }

  return fontName;
}

export function preloadNeighborPages(currentPage: number): void {
  const pagesToLoad: number[] = [];
  for (let delta = -2; delta <= 5; delta++) {
    if (delta === 0) continue;
    const p = currentPage + delta;
    if (p >= 1 && p <= TOTAL_PAGES) {
      pagesToLoad.push(p);
    }
  }

  pagesToLoad.forEach((p) => {
    fetchPageData(p)
      .then((data) => {
        if (data.font) loadPageFont(data.font).catch(() => {});
        for (const line of data.lines || []) {
          for (const word of line.words || []) {
            if (word.font) loadPageFont(word.font).catch(() => {});
          }
        }
      })
      .catch(() => {});
    fetchPage(p).catch(() => {});
    fetchTranslationPage(p).catch(() => {});
  });
}

export interface SurahInfo2 {
  number: number;
  name: string;
  englishName: string;
  englishNameTranslation: string;
  numberOfAyahs: number;
  revelationType: string;
}

export const SURAH_NAMES: Record<number, { name: string; englishName: string }> = {
  1: { name: "الفاتحة", englishName: "Al-Fatihah" },
  2: { name: "البقرة", englishName: "Al-Baqarah" },
  3: { name: "آل عمران", englishName: "Aal-Imran" },
  4: { name: "النساء", englishName: "An-Nisa" },
  5: { name: "المائدة", englishName: "Al-Ma'idah" },
  6: { name: "الأنعام", englishName: "Al-An'am" },
  7: { name: "الأعراف", englishName: "Al-A'raf" },
  8: { name: "الأنفال", englishName: "Al-Anfal" },
  9: { name: "التوبة", englishName: "At-Tawbah" },
  10: { name: "يونس", englishName: "Yunus" },
  11: { name: "هود", englishName: "Hud" },
  12: { name: "يوسف", englishName: "Yusuf" },
  13: { name: "الرعد", englishName: "Ar-Ra'd" },
  14: { name: "إبراهيم", englishName: "Ibrahim" },
  15: { name: "الحجر", englishName: "Al-Hijr" },
  16: { name: "النحل", englishName: "An-Nahl" },
  17: { name: "الإسراء", englishName: "Al-Isra" },
  18: { name: "الكهف", englishName: "Al-Kahf" },
  19: { name: "مريم", englishName: "Maryam" },
  20: { name: "طه", englishName: "Taha" },
  21: { name: "الأنبياء", englishName: "Al-Anbiya" },
  22: { name: "الحج", englishName: "Al-Hajj" },
  23: { name: "المؤمنون", englishName: "Al-Mu'minun" },
  24: { name: "النور", englishName: "An-Nur" },
  25: { name: "الفرقان", englishName: "Al-Furqan" },
  26: { name: "الشعراء", englishName: "Ash-Shu'ara" },
  27: { name: "النمل", englishName: "An-Naml" },
  28: { name: "القصص", englishName: "Al-Qasas" },
  29: { name: "العنكبوت", englishName: "Al-Ankabut" },
  30: { name: "الروم", englishName: "Ar-Rum" },
  31: { name: "لقمان", englishName: "Luqman" },
  32: { name: "السجدة", englishName: "As-Sajdah" },
  33: { name: "الأحزاب", englishName: "Al-Ahzab" },
  34: { name: "سبأ", englishName: "Saba" },
  35: { name: "فاطر", englishName: "Fatir" },
  36: { name: "يس", englishName: "Ya-Sin" },
  37: { name: "الصافات", englishName: "As-Saffat" },
  38: { name: "ص", englishName: "Sad" },
  39: { name: "الزمر", englishName: "Az-Zumar" },
  40: { name: "غافر", englishName: "Ghafir" },
  41: { name: "فصلت", englishName: "Fussilat" },
  42: { name: "الشورى", englishName: "Ash-Shura" },
  43: { name: "الزخرف", englishName: "Az-Zukhruf" },
  44: { name: "الدخان", englishName: "Ad-Dukhan" },
  45: { name: "الجاثية", englishName: "Al-Jathiyah" },
  46: { name: "الأحقاف", englishName: "Al-Ahqaf" },
  47: { name: "محمد", englishName: "Muhammad" },
  48: { name: "الفتح", englishName: "Al-Fath" },
  49: { name: "الحجرات", englishName: "Al-Hujurat" },
  50: { name: "ق", englishName: "Qaf" },
  51: { name: "الذاريات", englishName: "Adh-Dhariyat" },
  52: { name: "الطور", englishName: "At-Tur" },
  53: { name: "النجم", englishName: "An-Najm" },
  54: { name: "القمر", englishName: "Al-Qamar" },
  55: { name: "الرحمن", englishName: "Ar-Rahman" },
  56: { name: "الواقعة", englishName: "Al-Waqi'ah" },
  57: { name: "الحديد", englishName: "Al-Hadid" },
  58: { name: "المجادلة", englishName: "Al-Mujadilah" },
  59: { name: "الحشر", englishName: "Al-Hashr" },
  60: { name: "الممتحنة", englishName: "Al-Mumtahanah" },
  61: { name: "الصف", englishName: "As-Saff" },
  62: { name: "الجمعة", englishName: "Al-Jumu'ah" },
  63: { name: "المنافقون", englishName: "Al-Munafiqun" },
  64: { name: "التغابن", englishName: "At-Taghabun" },
  65: { name: "الطلاق", englishName: "At-Talaq" },
  66: { name: "التحريم", englishName: "At-Tahrim" },
  67: { name: "الملك", englishName: "Al-Mulk" },
  68: { name: "القلم", englishName: "Al-Qalam" },
  69: { name: "الحاقة", englishName: "Al-Haqqah" },
  70: { name: "المعارج", englishName: "Al-Ma'arij" },
  71: { name: "نوح", englishName: "Nuh" },
  72: { name: "الجن", englishName: "Al-Jinn" },
  73: { name: "المزمل", englishName: "Al-Muzzammil" },
  74: { name: "المدثر", englishName: "Al-Muddathir" },
  75: { name: "القيامة", englishName: "Al-Qiyamah" },
  76: { name: "الإنسان", englishName: "Al-Insan" },
  77: { name: "المرسلات", englishName: "Al-Mursalat" },
  78: { name: "النبأ", englishName: "An-Naba" },
  79: { name: "النازعات", englishName: "An-Nazi'at" },
  80: { name: "عبس", englishName: "Abasa" },
  81: { name: "التكوير", englishName: "At-Takwir" },
  82: { name: "الانفطار", englishName: "Al-Infitar" },
  83: { name: "المطففين", englishName: "Al-Mutaffifin" },
  84: { name: "الانشقاق", englishName: "Al-Inshiqaq" },
  85: { name: "البروج", englishName: "Al-Buruj" },
  86: { name: "الطارق", englishName: "At-Tariq" },
  87: { name: "الأعلى", englishName: "Al-A'la" },
  88: { name: "الغاشية", englishName: "Al-Ghashiyah" },
  89: { name: "الفجر", englishName: "Al-Fajr" },
  90: { name: "البلد", englishName: "Al-Balad" },
  91: { name: "الشمس", englishName: "Ash-Shams" },
  92: { name: "الليل", englishName: "Al-Layl" },
  93: { name: "الضحى", englishName: "Ad-Duha" },
  94: { name: "الشرح", englishName: "Ash-Sharh" },
  95: { name: "التين", englishName: "At-Tin" },
  96: { name: "العلق", englishName: "Al-Alaq" },
  97: { name: "القدر", englishName: "Al-Qadr" },
  98: { name: "البينة", englishName: "Al-Bayyinah" },
  99: { name: "الزلزلة", englishName: "Az-Zalzalah" },
  100: { name: "العاديات", englishName: "Al-Adiyat" },
  101: { name: "القارعة", englishName: "Al-Qari'ah" },
  102: { name: "التكاثر", englishName: "At-Takathur" },
  103: { name: "العصر", englishName: "Al-Asr" },
  104: { name: "الهمزة", englishName: "Al-Humazah" },
  105: { name: "الفيل", englishName: "Al-Fil" },
  106: { name: "قريش", englishName: "Quraysh" },
  107: { name: "الماعون", englishName: "Al-Ma'un" },
  108: { name: "الكوثر", englishName: "Al-Kawthar" },
  109: { name: "الكافرون", englishName: "Al-Kafirun" },
  110: { name: "النصر", englishName: "An-Nasr" },
  111: { name: "المسد", englishName: "Al-Masad" },
  112: { name: "الإخلاص", englishName: "Al-Ikhlas" },
  113: { name: "الفلق", englishName: "Al-Falaq" },
  114: { name: "الناس", englishName: "An-Nas" },
};

export const VOCALIZED_SURAH_TITLES: Record<number, string> = {
  1: "سُورَةُ الفَاتِحَةِ",
  2: "سُورَةُ البَقَرَةِ",
  3: "سُورَةُ آلِ عِمْرَانَ",
  4: "سُورَةُ النِّسَاءِ",
  5: "سُورَةُ المَائِدَةِ",
  6: "سُورَةُ الأَنْعَامِ",
  7: "سُورَةُ الأَعْرَافِ",
  8: "سُورَةُ الأَنْفَالِ",
  9: "سُورَةُ التَّوْبَةِ",
  10: "سُورَةُ يُونُسَ",
  11: "سُورَةُ هُودٍ",
  12: "سُورَةُ يُوسُفَ",
  13: "سُورَةُ الرَّعْدِ",
  14: "سُورَةُ إِبْرَاهِيمَ",
  15: "سُورَةُ الحِجْرِ",
  16: "سُورَةُ النَّحْلِ",
  17: "سُورَةُ الإِسْرَاءِ",
  18: "سُورَةُ الكَهْفِ",
  19: "سُورَةُ مَرْيَمَ",
  20: "سُورَةُ طٰهٰ",
  21: "سُورَةُ الأَنْبِيَاءِ",
  22: "سُورَةُ الحَجِّ",
  23: "سُورَةُ المُؤْمِنُونَ",
  24: "سُورَةُ النُّورِ",
  25: "سُورَةُ الفُرْقَانِ",
  26: "سُورَةُ الشُّعَرَاءِ",
  27: "سُورَةُ النَّمْلِ",
  28: "سُورَةُ القَصَصِ",
  29: "سُورَةُ العَنْكَبُوتِ",
  30: "سُورَةُ الرُّومِ",
  31: "سُورَةُ لُقْمَانَ",
  32: "سُورَةُ السَّجْدَةِ",
  33: "سُورَةُ الأَحْزَابِ",
  34: "سُورَةُ سَبَإٍ",
  35: "سُورَةُ فَاطِرٍ",
  36: "سُورَةُ يٰسٓ",
  37: "سُورَةُ الصَّافَّاتِ",
  38: "سُورَةُ صٓ",
  39: "سُورَةُ الزُّمَرِ",
  40: "سُورَةُ غَافِرٍ",
  41: "سُورَةُ فُصِّلَتْ",
  42: "سُورَةُ الشُّورَىٰ",
  43: "سُورَةُ الزُّخْرُفِ",
  44: "سُورَةُ الدُّخَانِ",
  45: "سُورَةُ الجَاثِيَةِ",
  46: "سُورَةُ الأَحْقَافِ",
  47: "سُورَةُ مُحَمَّدٍ",
  48: "سُورَةُ الفَتْحِ",
  49: "سُورَةُ الحُجُرَاتِ",
  50: "سُورَةُ قٓ",
  51: "سُورَةُ الذَّارِيَاتِ",
  52: "سُورَةُ الطُّورِ",
  53: "سُورَةُ النَّجْمِ",
  54: "سُورَةُ القَمَرِ",
  55: "سُورَةُ الرَّحْمَٰنِ",
  56: "سُورَةُ الوَاقِعَةِ",
  57: "سُورَةُ الحَدِيدِ",
  58: "سُورَةُ المُجَادَلَةِ",
  59: "سُورَةُ الحَشْرِ",
  60: "سُورَةُ المُمْتَحَنَةِ",
  61: "سُورَةُ الصَّفِّ",
  62: "سُورَةُ الجُمُعَةِ",
  63: "سُورَةُ المُنَافِقُونَ",
  64: "سُورَةُ التَّغَابُنِ",
  65: "سُورَةُ الطَّلَاقِ",
  66: "سُورَةُ التَّحْرِيمِ",
  67: "سُورَةُ المُلْكِ",
  68: "سُورَةُ القَلَمِ",
  69: "سُورَةُ الحَاقَّةِ",
  70: "سُورَةُ المَعَارِجِ",
  71: "سُورَةُ نُوحٍ",
  72: "سُورَةُ الجِنِّ",
  73: "سُورَةُ المُزَّمِّلِ",
  74: "سُورَةُ المُدَّثِّرِ",
  75: "سُورَةُ القِيَامَةِ",
  76: "سُورَةُ الإِنْسَانِ",
  77: "سُورَةُ المُرْسَلَاتِ",
  78: "سُورَةُ النَّبَإِ",
  79: "سُورَةُ النَّازِعَاتِ",
  80: "سُورَةُ عَبَسَ",
  81: "سُورَةُ التَّكْوِيرِ",
  82: "سُورَةُ الانْفِطَارِ",
  83: "سُورَةُ المُطَفِّفِينَ",
  84: "سُورَةُ الانْشِقَاقِ",
  85: "سُورَةُ البُرُوجِ",
  86: "سُورَةُ الطَّارِقِ",
  87: "سُورَةُ الأَعْلَىٰ",
  88: "سُورَةُ الغَاشِيَةِ",
  89: "سُورَةُ الفَجْرِ",
  90: "سُورَةُ البَلَدِ",
  91: "سُورَةُ الشَّمْسِ",
  92: "سُورَةُ اللَّيْلِ",
  93: "سُورَةُ الضُّحَىٰ",
  94: "سُورَةُ الشَّرْحِ",
  95: "سُورَةُ التِّينِ",
  96: "سُورَةُ العَلَقِ",
  97: "سُورَةُ القَدْرِ",
  98: "سُورَةُ البَيِّنَةِ",
  99: "سُورَةُ الزَّلْزَلَةِ",
  100: "سُورَةُ العَادِيَاتِ",
  101: "سُورَةُ القَارِعَةِ",
  102: "سُورَةُ التَّكَاثُرِ",
  103: "سُورَةُ العَصْرِ",
  104: "سُورَةُ الهُمَزَةِ",
  105: "سُورَةُ الفِيلِ",
  106: "سُورَةُ قُرَيْشٍ",
  107: "سُورَةُ المَاعُونِ",
  108: "سُورَةُ الكَوْثَرِ",
  109: "سُورَةُ الكَافِرُونَ",
  110: "سُورَةُ النَّصْرِ",
  111: "سُورَةُ المَسَدِ",
  112: "سُورَةُ الإِخْلَاصِ",
  113: "سُورَةُ الفَلَقِ",
  114: "سُورَةُ النَّاسِ",
};

export function getVocalizedSurahTitle(surahNumber: number): string {
  return VOCALIZED_SURAH_TITLES[surahNumber] || `سُورَةُ ${SURAH_NAMES[surahNumber]?.name || ""}`;
}