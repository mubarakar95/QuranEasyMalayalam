import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

interface QCF4Word {
  code: number;
  char: string;
  font: string;
  text: string;
  type: "word" | "end" | "surah_header" | "bismillah";
  verse_key?: string;
  sura?: number;
  position: number;
}

interface QCF4Line {
  line: number;
  words: QCF4Word[];
}

interface QCF4Page {
  page: number;
  font: string;
  surahs: { id: number; name: string; name_arabic: string; verse_start: number; verse_end: number }[];
  lines: QCF4Line[];
}

interface WbwGroup {
  arabic: string;
  malayalam: string;
  wordCount: number;
  count: number;
  verses: string[];
}

const QCF4_DIR = "/tmp/quran-qcf4/pages";
const WBW_PATH = join(__dirname, "../public/malayalam-wbw.json");
const VOCAB_PATH = join(__dirname, "../public/vocabulary.json");
const VERSE_PAGE_PATH = join(__dirname, "../public/verse-page-map.json");
const TOTAL_PAGES = 604;

// Common words/particles everyone already knows — skip these
const SKIP_WORDS = new Set([
  "اللَّهُ", "اللَّهَ", "اللَّهِ", "اللَّهْ", "اللَّهَمْ", "اللَّهُمَّ",
  "وَاللَّهُ", "فَاللَّهُ", "بِاللَّهِ", "لِلَّهِ", "إِلَى اللَّهِ",
  "عَلَى اللَّهِ", "مِنَ اللَّهِ", "عِنْدَ اللَّهِ", "لَدَى اللَّهِ",
]);

// Meaningless/obvious single-word meanings (particles, pronouns with trivial translations)
const TRIVIAL_MEANINGS = new Set([
  "അല്ലെങ്കില്‍", "അല്ലാതെ", "എന്നാല്‍", "പിന്നെ", "തീര്‍ച്ചയായും",
  "അവന്‍", "അവള്‍", "അവര്‍", "അത്", "ഇത്", "നീ", "ഞാൻ", "നിങ്ങൾ",
  "അവൻ്റെ", "അവളുടെ", "അവരുടെ", "ഇത്", "ഞങ്ങൾ",
]);

function loadWBW(): Record<string, string[]> {
  return JSON.parse(readFileSync(WBW_PATH, "utf-8"));
}

function loadPage(pageNum: number): QCF4Page {
  const padded = pageNum.toString().padStart(3, "0");
  return JSON.parse(readFileSync(join(QCF4_DIR, `${padded}.json`), "utf-8"));
}

function main() {
  console.log("Loading WBW data...");
  const wbw = loadWBW();
  const verseKeys = Object.keys(wbw);
  console.log(`  ${verseKeys.length} verses`);

  // verse_key -> sorted QCF4 words + verse->page map
  const arabicMap = new Map<string, QCF4Word[]>();
  const versePageMap: Record<string, number> = {};

  console.log("Loading QCF4 pages...");
  for (let page = 1; page <= TOTAL_PAGES; page++) {
    try {
      const pageData = loadPage(page);
      for (const [vk, words] of extractVerseWords(pageData)) {
        if (!arabicMap.has(vk)) {
          arabicMap.set(vk, words);
        } else {
          const existing = arabicMap.get(vk)!;
          const existingCodes = new Set(existing.map(w => w.code));
          for (const w of words) {
            if (!existingCodes.has(w.code)) existing.push(w);
          }
          existing.sort((a, b) => a.position - b.position);
        }
        // Track which page this verse appears on
        if (!versePageMap[vk] || page < versePageMap[vk]) {
          versePageMap[vk] = page;
        }
      }
      if (page % 100 === 0) console.log(`  Page ${page}/${TOTAL_PAGES}`);
    } catch (e) {
      console.error(`  Failed page ${page}: ${e}`);
    }
  }
  console.log(`  Mapped ${arabicMap.size} verses`);

  // Save verse->page mapping
  writeFileSync(VERSE_PAGE_PATH, JSON.stringify(versePageMap));
  console.log(`  Saved verse-page map (${Object.keys(versePageMap).length} entries)`);

  // Build WBW groups
  console.log("Building WBW groups...");
  const groupMap = new Map<string, {
    arabic: string; malayalam: string; wordCount: number;
    count: number; verses: Set<string>;
  }>();

  let skippedCommon = 0;
  let skippedTrivial = 0;

  for (const vk of verseKeys) {
    const mlArray = wbw[vk];
    const arWords = arabicMap.get(vk);
    if (!arWords || arWords.length === 0) continue;

    arWords.sort((a, b) => a.position - b.position);

    let i = 0;
    while (i < mlArray.length && i < arWords.length) {
      const ml = mlArray[i];
      if (!ml || ml.trim() === "") { i++; continue; }

      const groupWords: string[] = [arWords[i].text];
      let j = i + 1;
      while (j < mlArray.length && j < arWords.length) {
        if (!mlArray[j] || mlArray[j].trim() === "") {
          groupWords.push(arWords[j].text);
          j++;
        } else break;
      }

      const arabicJoined = groupWords.join(" ");
      const key = `${arabicJoined}|||${ml}`;

      // Skip trivial meanings
      if (TRIVIAL_MEANINGS.has(ml)) { skippedTrivial++; i = j; continue; }

      // Skip very common single-word groups that everyone knows
      if (groupWords.length === 1 && SKIP_WORDS.has(groupWords[0])) { skippedCommon++; i = j; continue; }

      if (!groupMap.has(key)) {
        groupMap.set(key, {
          arabic: arabicJoined, malayalam: ml,
          wordCount: groupWords.length, count: 0, verses: new Set(),
        });
      }
      const group = groupMap.get(key)!;
      group.count++;
      group.verses.add(vk);
      i = j;
    }
  }

  console.log(`  Skipped common: ${skippedCommon}, trivial: ${skippedTrivial}`);

  // No meaning deduplication — keep all Arabic forms even if they share a Malayalam meaning
  const words: WbwGroup[] = Array.from(groupMap.values()).map(g => ({
    arabic: g.arabic, malayalam: g.malayalam,
    wordCount: g.wordCount, count: g.count,
    verses: Array.from(g.verses),
  }));
  words.sort((a, b) => b.count - a.count);

  const totalGroups = words.reduce((s, w) => s + w.count, 0);
  const multiWord = words.filter(w => w.wordCount > 1);

  const output = {
    meta: {
      totalGroups, uniqueGroups: words.length,
      multiWordGroups: multiWord.length,
      generatedAt: new Date().toISOString(),
    },
    words,
  };

  writeFileSync(VOCAB_PATH, JSON.stringify(output));
  const sizeMB = (Buffer.byteLength(JSON.stringify(output)) / 1024 / 1024).toFixed(1);
  console.log(`\nDone! ${VOCAB_PATH} (${sizeMB} MB)`);
  console.log(`  Unique groups: ${words.length}`);
  console.log(`  Multi-word: ${multiWord.length}`);
  console.log(`\nTop 15:`);
  for (const w of words.slice(0, 15)) {
    const wc = w.wordCount > 1 ? ` [${w.wordCount}w]` : "";
    console.log(`  ${w.arabic} → ${w.malayalam} (${w.count}x)${wc}`);
  }
  console.log(`\nSample multi-word:`);
  for (const w of multiWord.slice(0, 10)) {
    console.log(`  ${w.arabic} → ${w.malayalam} (${w.wordCount}w, ${w.count}x, ${w.verses.length} verses)`);
  }
}

function extractVerseWords(page: QCF4Page): Map<string, QCF4Word[]> {
  const verseWords = new Map<string, QCF4Word[]>();
  for (const line of page.lines) {
    for (const word of line.words) {
      if (word.type !== "word" || !word.verse_key) continue;
      if (!verseWords.has(word.verse_key)) verseWords.set(word.verse_key, []);
      verseWords.get(word.verse_key)!.push(word);
    }
  }
  return verseWords;
}

main();
