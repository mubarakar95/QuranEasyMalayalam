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
    `${CDN_URL}/pages/${padded}.json`,
    `${RAW_BASE}/pages/${padded}.json`,
  ];

  let data: PageData2 | null = null;
  for (const url of urls) {
    try {
      const res = await withTimeout(fetch(url), 10000, `Fetch page ${page}`);
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
  return data;
}

async function loadSingleFont(fontName: string): Promise<void> {
  if (fontCache.has(fontName)) return;

  const db = await getDb();
  if (db) {
    const cached = await db.getFontData(fontName);
    if (cached) {
      const fontFace = new FontFace(fontName, cached);
      await fontFace.load();
      document.fonts.add(fontFace);
      fontCache.add(fontName);
      return;
    }
  }

  const fontFace = new FontFace(
    fontName,
    `url(${CDN_URL}/fonts-woff2/${fontName}_W.woff2) format('woff2'), url(${CDN_URL}/fonts/${fontName}_W.ttf) format('truetype')`,
    { style: "normal", weight: "normal" }
  );

  await withTimeout(fontFace.load(), 20000, `Font load ${fontName}`);
  document.fonts.add(fontFace);
  fontCache.add(fontName);

  if (db) {
    try {
      const resp = await fetch(`${CDN_URL}/fonts-woff2/${fontName}_W.woff2`);
      if (resp.ok) {
        const buf = await resp.arrayBuffer();
        await db.storeFontData(fontName, buf);
      }
    } catch { /* ignore */ }
  }
}

export async function loadPageFont(fontName: string): Promise<string> {
  await loadSingleFont(fontName);

  if (fontName === "QCF4_Hafs_01" && !fontCache.has("QCF4_QBSML")) {
    await loadSingleFont("QCF4_QBSML");
  }

  return fontName;
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