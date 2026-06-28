#!/usr/bin/env npx tsx
/**
 * Build mushtabihat.json from srmdn/quran-mutashabihat datasets.
 *
 * Reads:
 *   - /tmp/mushtabihat-curated.json  (pairs.json — curated verse pairs)
 *   - /tmp/mushtabihat-pending.json  (waqar_raw.json — pending pairs by juz)
 *
 * Outputs:
 *   - public/mushtabihat.json  (unified, range-filterable)
 */

import { readFileSync, writeFileSync } from "fs";

// ─── Absolute ayah → verse_key mapping ───────────────────────────────────────

const SURAH_AYAHS = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128,
  111, 110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 37, 30, 20, 36,
  73, 54, 45, 83, 182, 88, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78,
  96, 29, 22, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22,
  20, 20, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40,
  30, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 28, 28, 20, 56, 40, 31, 50,
  40, 46, 42, 29, 19, 36, 25, 22, 20, 20, 13, 14, 11, 11, 18, 12, 12, 30,
  52, 52, 44, 28, 28, 20, 56, 40, 30, 18, 45, 60, 49, 62, 55, 78, 96, 29,
  22, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 20, 20,
  13, 14, 11, 11, 18, 12, 12,
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

// ─── Load and process curated pairs ──────────────────────────────────────────

interface MushtabihatPair {
  ayah1: string; // "surah:ayah"
  ayah2: string;
  category: string;
  note: string;
  source: "curated" | "pending";
}

function loadCurated(): MushtabihatPair[] {
  const raw: { ayah1: string; ayah2: string; category: string; note: string; status: string }[] =
    JSON.parse(readFileSync("/tmp/mushtabihat-curated.json", "utf-8"));

  return raw
    .filter((p) => p.status === "curated")
    .map((p) => ({
      ayah1: p.ayah1,
      ayah2: p.ayah2,
      category: p.category || "",
      note: p.note || "",
      source: "curated" as const,
    }));
}

// ─── Load and process pending pairs ──────────────────────────────────────────

function loadPending(): MushtabihatPair[] {
  const raw: Record<string, { src: { ayah: number }; muts: { ayah: number }[] }[]> =
    JSON.parse(readFileSync("/tmp/mushtabihat-pending.json", "utf-8"));

  const pairs: MushtabihatPair[] = [];

  for (const entries of Object.values(raw)) {
    for (const entry of entries) {
      const srcKey = absoluteToVerseKey(entry.src.ayah);
      if (!srcKey) continue;

      for (const mut of entry.muts) {
        const mutKey = absoluteToVerseKey(mut.ayah);
        if (!mutKey || mutKey === srcKey) continue;

        pairs.push({
          ayah1: srcKey,
          ayah2: mutKey,
          category: "",
          note: "",
          source: "pending",
        });
      }
    }
  }

  return pairs;
}

// ─── Build output ────────────────────────────────────────────────────────────

// Juz page starts (1-indexed)
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
  const curated = loadCurated();
  const pending = loadPending();
  const verseJuz = buildVerseJuzMap();

  // Merge: curated first, then pending (skip duplicates)
  const seen = new Set<string>();
  const all: MushtabihatPair[] = [];

  for (const p of curated) {
    const key = [p.ayah1, p.ayah2].sort().join("|");
    if (!seen.has(key)) {
      seen.add(key);
      all.push(p);
    }
  }

  for (const p of pending) {
    const key = [p.ayah1, p.ayah2].sort().join("|");
    if (!seen.has(key)) {
      seen.add(key);
      all.push(p);
    }
  }

  // Add surah + juz numbers for range filtering
  const output = all.map((p) => ({
    ...p,
    surah1: verseKeyToSurah(p.ayah1),
    surah2: verseKeyToSurah(p.ayah2),
    juz1: verseJuz[p.ayah1] || 1,
    juz2: verseJuz[p.ayah2] || 1,
  }));

  writeFileSync(
    "public/mushtabihat.json",
    JSON.stringify({ pairs: output, total: output.length })
  );

  const curatedCount = output.filter((p) => p.source === "curated").length;
  const pendingCount = output.filter((p) => p.source === "pending").length;
  console.log(`✅ mushtabihat.json: ${output.length} pairs (${curatedCount} curated, ${pendingCount} pending)`);
}

main();
