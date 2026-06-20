// Regroup vocabulary.json by Arabic root (strip diacritics)
// Run: npx tsx scripts/regroup-vocabulary.ts

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const VOCAB_PATH = join(__dirname, "../public/vocabulary.json");

function stripDiacritics(text: string): string {
  return text
    .replace(/[\u0610-\u061A]/g, "")
    .replace(/[\u064B-\u065F]/g, "")
    .replace(/[\u0670]/g, "")
    .replace(/\u0640/g, "")
    .replace(/[\u06D6-\u06DC]/g, "")
    .replace(/[\u06DF-\u06E4]/g, "")
    .replace(/[\u06E6-\u06E9]/g, "")
    .replace(/[\u06EA-\u06ED]/g, "")
    .trim();
}

interface OldWord {
  arabic: string;
  malayalam: string;
  count: number;
}

interface NewWord {
  arabic: string;
  arabicRoot: string;
  malayalam: string;
  count: number;
  forms: string[];
}

const data = JSON.parse(readFileSync(VOCAB_PATH, "utf-8"));
const oldWords: OldWord[] = data.words;

console.log(`Input: ${oldWords.length} words`);

// Group by root
const rootGroups = new Map<string, {
  forms: Map<string, number>;
  malayalam: Map<string, number>;
  totalCount: number;
}>();

for (const w of oldWords) {
  const root = stripDiacritics(w.arabic);
  if (!root) continue;

  if (!rootGroups.has(root)) {
    rootGroups.set(root, { forms: new Map(), malayalam: new Map(), totalCount: 0 });
  }
  const group = rootGroups.get(root)!;
  group.forms.set(w.arabic, (group.forms.get(w.arabic) || 0) + w.count);
  group.malayalam.set(w.malayalam, (group.malayalam.get(w.malayalam) || 0) + w.count);
  group.totalCount += w.count;
}

const words: NewWord[] = [];

for (const [root, group] of rootGroups) {
  const bestForm = Array.from(group.forms.entries())
    .sort((a, b) => b[1] - a[1])[0][0];
  const bestMl = Array.from(group.malayalam.entries())
    .sort((a, b) => b[1] - a[1])[0][0];
  const forms = Array.from(group.forms.keys());

  words.push({
    arabic: bestForm,
    arabicRoot: root,
    malayalam: bestMl,
    count: group.totalCount,
    forms: forms.length > 1 ? forms : [],
  });
}

words.sort((a, b) => b.count - a.count);

const output = {
  meta: {
    totalOccurrences: data.meta.totalOccurrences,
    uniqueWords: words.length,
    generatedAt: new Date().toISOString(),
  },
  words,
};

writeFileSync(VOCAB_PATH, JSON.stringify(output));
const sizeMB = (Buffer.byteLength(JSON.stringify(output)) / 1024 / 1024).toFixed(1);
console.log(`Output: ${words.length} grouped words (${sizeMB} MB)`);
console.log(`\nTop 15:`);
for (const w of words.slice(0, 15)) {
  const formNote = w.forms.length > 0 ? ` (${w.forms.length} forms)` : "";
  console.log(`  ${w.arabic} [${w.arabicRoot}] → ${w.malayalam} (${w.count}x)${formNote}`);
}
