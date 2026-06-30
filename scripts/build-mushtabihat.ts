#!/usr/bin/env npx tsx
/**
 * Build mushtabihat.json from teacher-curated + text-similarity-filtered pairs.
 *
 * Data sources:
 *   1. Waqar144/Quran_Mutashabihat_Data — curated by Qari Idrees Al Asim
 *   2. srmdn/quran-mutashabihat — researcher-curated pairs
 *   3. Quran text — for computing word overlap similarity
 *
 * Reads:
 *   - /tmp/waqar_mutashabihat.json  (Waqar144 curated)
 *   - /tmp/mushtabihat-curated.json (srmdn curated, status=curated only)
 *   - /tmp/quran-text.json          (Quran Arabic text)
 *   - public/verse-page-map.json    (verse → page mapping)
 *
 * Outputs:
 *   - public/mushtabihat.json
 */

import { readFileSync, writeFileSync } from "fs";

// ─── Absolute ayah → verse_key mapping ───────────────────────────────────────

const SURAH_AYAHS = [
  7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,
  111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,
  54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,
  49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,
  44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,
  26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,
  3,6,3,5,4,5,6,
];
const TOTAL_AYAHS = SURAH_AYAHS.reduce((a, b) => a + b, 0);

function absoluteToVerseKey(abs: number): string {
  if (abs < 1 || abs > TOTAL_AYAHS) return "";
  let remaining = abs;
  for (let s = 0; s < SURAH_AYAHS.length; s++) {
    if (remaining <= SURAH_AYAHS[s]) {
      return `${s + 1}:${remaining}`;
    }
    remaining -= SURAH_AYAHS[s];
  }
  return "";
}

function verseKeyToSurah(key: string): number {
  return parseInt(key.split(":")[0]) || 0;
}

// ─── Load Quran text for similarity ──────────────────────────────────────────

interface QuranVerse {
  id: number;
  text: string;
}
interface QuranSurah {
  id: number;
  name: string;
  transliteration: string;
  verses: QuranVerse[];
}

function loadQuranText(): Map<string, string> {
  const surahs: QuranSurah[] = JSON.parse(readFileSync("/tmp/quran-text.json", "utf-8"));
  const map = new Map<string, string>();
  for (const surah of surahs) {
    for (const verse of surah.verses) {
      map.set(`${surah.id}:${verse.id}`, verse.text);
    }
  }
  return map;
}

// Strip tashkeel/diacritics only (keep Arabic letters)
function stripDiacritics(text: string): string {
  return text
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function computeWordOverlap(text1: string, text2: string): number {
  const words1 = new Set(stripDiacritics(text1).split(/\s+/));
  const words2 = new Set(stripDiacritics(text2).split(/\s+/));
  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  if (union.size === 0) return 0;
  return intersection.size / union.size; // Jaccard similarity
}

// ─── Interface ───────────────────────────────────────────────────────────────

interface MushtabihatPair {
  ayah1: string;
  ayah2: string;
  category: string;
  note: string;
  source: "curated" | "pending";
  origin: "waqar" | "srmdn";
  surah1: number;
  surah2: number;
  juz1: number;
  juz2: number;
  similarity?: number;
}

// ─── Load Waqar144 curated data ──────────────────────────────────────────────

function loadWaqar(): { ayah1: string; ayah2: string; ctx?: number }[] {
  const raw: Record<string, { src: { ayah: number | number[] }; muts: { ayah: number | number[] }[]; ctx?: number }[]> =
    JSON.parse(readFileSync("/tmp/waqar_mutashabihat.json", "utf-8"));

  const pairs: { ayah1: string; ayah2: string; ctx?: number }[] = [];

  for (const entries of Object.values(raw)) {
    for (const entry of entries) {
      const srcKeys = Array.isArray(entry.src.ayah)
        ? entry.src.ayah.map(absoluteToVerseKey).filter(Boolean)
        : [absoluteToVerseKey(entry.src.ayah)].filter(Boolean);

      for (const mut of entry.muts) {
        const mutKeys = Array.isArray(mut.ayah)
          ? mut.ayah.map(absoluteToVerseKey).filter(Boolean)
          : [absoluteToVerseKey(mut.ayah)].filter(Boolean);

        for (const sk of srcKeys) {
          for (const mk of mutKeys) {
            if (sk !== mk) {
              pairs.push({ ayah1: sk, ayah2: mk, ctx: entry.ctx });
            }
          }
        }
      }
    }
  }

  return pairs;
}

// ─── Load srmdn curated data ─────────────────────────────────────────────────

function loadSrmdnCurated(): { ayah1: string; ayah2: string; category: string; note: string }[] {
  const raw: { ayah1: string; ayah2: string; category: string; note: string; status: string }[] =
    JSON.parse(readFileSync("/tmp/mushtabihat-curated.json", "utf-8"));

  return raw
    .filter((p) => p.status === "curated")
    .map((p) => ({
      ayah1: p.ayah1,
      ayah2: p.ayah2,
      category: p.category || "",
      note: p.note || "",
    }));
}

// ─── Build output ────────────────────────────────────────────────────────────

const JUZ_START_PAGES = [0,1,22,42,62,82,102,122,142,162,182,202,222,242,262,282,302,322,342,362,382,402,422,442,462,482,502,522,542,562,582,600];

function buildVerseJuzMap(): Record<string, number> {
  const vpm: Record<string, number> = JSON.parse(
    readFileSync("public/verse-page-map.json", "utf-8")
  );
  const map: Record<string, number> = {};
  for (const [vk, page] of Object.entries(vpm)) {
    let juz = 30;
    for (let j = 30; j >= 1; j--) {
      if (page >= JUZ_START_PAGES[j]) { juz = j; break; }
    }
    map[vk] = juz;
  }
  return map;
}

function main() {
  const quranText = loadQuranText();
  const verseJuz = buildVerseJuzMap();

  // 1. Load Waqar144 curated (teacher-curated by Qari)
  const waqarPairs = loadWaqar();
  console.log(`Waqar144: ${waqarPairs.length} pairs from teacher-curated data`);

  // 2. Load srmdn curated (researcher-curated)
  const srmdnPairs = loadSrmdnCurated();
  console.log(`srmdn curated: ${srmdnPairs.length} pairs`);

  // 3. Build merged list with deduplication
  const seen = new Set<string>();
  const all: MushtabihatPair[] = [];

  // Add Waqar144 first (highest quality — teacher-curated)
  for (const p of waqarPairs) {
    const key = [p.ayah1, p.ayah2].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);

    const text1 = quranText.get(p.ayah1) || "";
    const text2 = quranText.get(p.ayah2) || "";
    const similarity = computeWordOverlap(text1, text2);

    // Skip Qari pairs with low similarity (< 30%) — not truly confusing
    if (similarity < 0.30) continue;

    all.push({
      ayah1: p.ayah1,
      ayah2: p.ayah2,
      category: "",
      note: p.ctx ? `Show context: ${p.ctx} verse(s) after` : "",
      source: "curated",
      origin: "waqar",
      surah1: verseKeyToSurah(p.ayah1),
      surah2: verseKeyToSurah(p.ayah2),
      juz1: verseJuz[p.ayah1] || 1,
      juz2: verseJuz[p.ayah2] || 1,
      similarity: Math.round(similarity * 100),
    });
  }

  // Add srmdn curated (researcher-curated)
  for (const p of srmdnPairs) {
    const key = [p.ayah1, p.ayah2].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);

    const text1 = quranText.get(p.ayah1) || "";
    const text2 = quranText.get(p.ayah2) || "";
    const similarity = computeWordOverlap(text1, text2);

    if (similarity < 0.15) continue;

    all.push({
      ayah1: p.ayah1,
      ayah2: p.ayah2,
      category: p.category,
      note: p.note,
      source: "curated",
      origin: "srmdn",
      surah1: verseKeyToSurah(p.ayah1),
      surah2: verseKeyToSurah(p.ayah2),
      juz1: verseJuz[p.ayah1] || 1,
      juz2: verseJuz[p.ayah2] || 1,
      similarity: Math.round(similarity * 100),
    });
  }

  // Sort by similarity descending (best pairs first)
  all.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));

  writeFileSync(
    "public/mushtabihat.json",
    JSON.stringify({ pairs: all, total: all.length })
  );

  console.log(`\n✅ mushtabihat.json: ${all.length} curated pairs`);
  const waqarCount = all.filter((p) => p.origin === "waqar").length;
  const srmdnCount = all.filter((p) => p.origin === "srmdn").length;
  console.log(`   Waqar (Qari-curated): ${waqarCount}`);
  console.log(`   srmdn (researcher-curated): ${srmdnCount}`);
  console.log(`   Top similarity: ${all[0]?.similarity}% (${all[0]?.ayah1} ↔ ${all[0]?.ayah2})`);
  console.log(`   Min similarity: ${all[all.length - 1]?.similarity}% (${all[all.length - 1]?.ayah1} ↔ ${all[all.length - 1]?.ayah2})`);

  // Stats by similarity ranges
  const ranges = [
    { label: "80-100%", min: 80, max: 100 },
    { label: "60-79%", min: 60, max: 79 },
    { label: "40-59%", min: 40, max: 59 },
    { label: "15-39%", min: 15, max: 39 },
  ];
  for (const r of ranges) {
    const count = all.filter((p) => (p.similarity || 0) >= r.min && (p.similarity || 0) <= r.max).length;
    if (count > 0) console.log(`   ${r.label}: ${count} pairs`);
  }
}

main();
