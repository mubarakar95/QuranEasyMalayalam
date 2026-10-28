import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

// ── Read Environment Variables from .env.local ────────────────────────────────
function loadEnv(): { supabaseUrl: string; supabaseKey: string; geminiApiKey: string } {
  const envPath = path.join(process.cwd(), ".env.local");
  let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  let supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  let geminiApiKey = process.env.GEMINI_API_KEY || "";

  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("NEXT_PUBLIC_SUPABASE_URL=")) {
        supabaseUrl = trimmed.split("=")[1].trim();
      } else if (trimmed.startsWith("NEXT_PUBLIC_SUPABASE_ANON_KEY=")) {
        supabaseKey = trimmed.split("=")[1].trim();
      } else if (trimmed.startsWith("GEMINI_API_KEY=")) {
        geminiApiKey = trimmed.split("=")[1].trim();
      }
    }
  }

  // Fallback fallback key for testing if not set
  if (!geminiApiKey) {
    geminiApiKey = "AQ.Ab8RN6Ic7DWosMJhV5awpM4VgXic15QMI6Df49iN7VYBMTMZ7g";
  }

  return { supabaseUrl, supabaseKey, geminiApiKey };
}

const { supabaseUrl, supabaseKey, geminiApiKey } = loadEnv();
if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing Supabase URL or Key in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const genai = new GoogleGenAI({ apiKey: geminiApiKey });

// Load Word-by-word Arabic dictionary
const wbwPath = path.join(process.cwd(), "public", "malayalam-wbw.json");
const wbwData: Record<string, string[]> = JSON.parse(fs.readFileSync(wbwPath, "utf-8"));

// ── Models priority ───────────────────────────────────────────────────────────
const CANDIDATE_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3.1-pro",
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
];

let workingModel = CANDIDATE_MODELS[0];

// ── Page Ayahs Fetcher ─────────────────────────────────────────────────────────
interface PageAyah {
  surahNumber: number;
  ayahNumber: number;
  verseKey: string;
}

async function getAyahsForPage(pageNumber: number): Promise<PageAyah[]> {
  const res = await fetch(`https://api.alquran.cloud/v1/page/${pageNumber}/quran-uthmani`, {
    headers: { "User-Agent": "QuranEasyMalayalam/1.0" },
  });
  if (!res.ok) throw new Error(`Failed to load page ${pageNumber} info`);
  const data = await res.json();
  return (data.data.ayahs || []).map((a: { surah: { number: number }; numberInSurah: number }) => ({
    surahNumber: a.surah.number,
    ayahNumber: a.numberInSurah,
    verseKey: `${a.surah.number}:${a.numberInSurah}`,
  }));
}

// ── Fetch audio with retry ────────────────────────────────────────────────────
async function fetchAudioBase64(surahNumber: number, ayahNumber: number): Promise<string> {
  const s = surahNumber.toString().padStart(3, "0");
  const a = ayahNumber.toString().padStart(3, "0");
  const url = `https://lalithasaram.net/audio/qtaud/transl/${s}_${a}.mp3`;
  const res = await fetch(url, { headers: { "User-Agent": "QuranEasyMalayalam/1.0" } });
  if (!res.ok) throw new Error(`Audio 404 for ${surahNumber}:${ayahNumber}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.toString("base64");
}

// ── Process an Entire Page in a Single Gemini Request ─────────────────────────
async function processPage(pageNumber: number, force = false): Promise<void> {
  const ayahs = await getAyahsForPage(pageNumber);
  if (ayahs.length === 0) return;

  // 1. Check existing rows in Supabase
  const { data: existingRows } = await supabase
    .from("ml_word_timestamps")
    .select("surah_number, ayah_number")
    .in("surah_number", Array.from(new Set(ayahs.map((a) => a.surahNumber))));

  const existingSet = new Set(
    (existingRows || []).map((r) => `${r.surah_number}:${r.ayah_number}`)
  );

  const missingAyahs = force ? ayahs : ayahs.filter((a) => !existingSet.has(a.verseKey));

  if (missingAyahs.length === 0) {
    console.log(`⚡ Page ${pageNumber}: All ${ayahs.length} ayahs already in Supabase! (Skipped)`);
    return;
  }

  console.log(
    `📖 Page ${pageNumber}: ${missingAyahs.length}/${ayahs.length} ayahs missing. Downloading audios...`
  );

  // 2. Fetch audios in parallel
  const audioMap = new Map<string, string>();
  await Promise.all(
    missingAyahs.map(async (a) => {
      try {
        const b64 = await fetchAudioBase64(a.surahNumber, a.ayahNumber);
        audioMap.set(a.verseKey, b64);
      } catch (e) {
        console.warn(`⚠️ Could not fetch audio for ${a.verseKey}:`, (e as Error).message);
      }
    })
  );

  const validAyahs = missingAyahs.filter((a) => audioMap.has(a.verseKey));
  if (validAyahs.length === 0) {
    console.error(`❌ Page ${pageNumber}: No audio files available`);
    return;
  }

  // 3. Construct single batch multimodal prompt
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  parts.push({
    text: `You are analyzing Malayalam translation audio for a page of the Holy Quran.
For each ayah provided below, you are given the sequential Malayalam audio translation and the 0-indexed Arabic words.
Your task is to identify the millisecond timestamps (startMs, endMs) when each Arabic word's meaning is spoken in that ayah's audio.

Important rules:
- Timestamps must be integers (milliseconds).
- Output must be a valid JSON object where keys are the exact verse keys (e.g. "1:1", "1:2") and values are arrays of {"wordIndex": number, "startMs": number, "endMs": number}.
- Return ONLY the JSON object. No explanation, no markdown code block.\n`,
  });

  for (const a of validAyahs) {
    const words = wbwData[a.verseKey] || [];
    const b64 = audioMap.get(a.verseKey)!;
    parts.push({
      text: `\n--- AYAH ${a.verseKey} (${words.length} Arabic words) ---\nArabic words:\n${words
        .map((w, i) => `${i}: ${w}`)
        .join("\n")}\nAudio for Ayah ${a.verseKey}:`,
    });
    parts.push({ inlineData: { mimeType: "audio/mpeg", data: b64 } });
  }

  parts.push({
    text: `\nJSON response mapping each verse key ("${validAyahs.map((a) => a.verseKey).join('", "')}") to its array of word timings:`,
  });

  // 4. Send to Gemini with model fallback
  console.log(`🤖 Sending Page ${pageNumber} (${validAyahs.length} audios) to Gemini...`);
  const t0 = Date.now();

  const modelsToTry = [
    workingModel,
    ...CANDIDATE_MODELS.filter((m) => m !== workingModel),
  ];

  let parsedResult: Record<string, Array<{ wordIndex: number; startMs: number; endMs: number }>> | null = null;
  let usedModel = "";

  for (const modelName of modelsToTry) {
    try {
      const resp = await genai.models.generateContent({
        model: modelName,
        contents: [{ role: "user", parts }],
      });

      const rawText = resp.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      let cleaned = rawText.replace(/```json?\s*/gi, "").replace(/```/g, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) cleaned = match[0];

      const json = JSON.parse(cleaned);
      if (typeof json === "object" && json !== null) {
        parsedResult = json;
        usedModel = modelName;
        workingModel = modelName;
        break;
      }
    } catch (err) {
      console.warn(`Model ${modelName} failed, trying next fallback... (${(err as Error).message?.slice(0, 100)})`);
    }
  }

  if (!parsedResult) {
    console.error(`❌ Page ${pageNumber}: All Gemini models failed`);
    return;
  }

  const durationSec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`✅ Gemini (${usedModel}) responded in ${durationSec}s for Page ${pageNumber}!`);

  // 5. Save all ayahs to Supabase
  const rowsToUpsert = [];
  for (const a of validAyahs) {
    const segments = parsedResult[a.verseKey];
    if (Array.isArray(segments) && segments.length > 0) {
      rowsToUpsert.push({
        surah_number: a.surahNumber,
        ayah_number: a.ayahNumber,
        segments,
      });
    }
  }

  if (rowsToUpsert.length > 0) {
    const { error: upsertErr } = await supabase
      .from("ml_word_timestamps")
      .upsert(rowsToUpsert, { onConflict: "surah_number,ayah_number" });

    if (upsertErr) {
      console.error(`❌ Supabase upsert error on Page ${pageNumber}:`, upsertErr);
    } else {
      console.log(`💾 Saved ${rowsToUpsert.length} ayahs to Supabase for Page ${pageNumber}!`);
    }
  }
}

// ── CLI Main Runner ───────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  let pages: number[] = [];
  let force = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--page" && args[i + 1]) {
      const val = args[i + 1];
      if (val.includes("-")) {
        const [start, end] = val.split("-").map(Number);
        for (let p = start; p <= end; p++) pages.push(p);
      } else {
        pages.push(Number(val));
      }
      i++;
    } else if (args[i] === "--all") {
      for (let p = 1; p <= 604; p++) pages.push(p);
    } else if (args[i] === "--force") {
      force = true;
    }
  }

  if (pages.length === 0) {
    console.log(`
Usage:
  pnpm generate-timestamps --page 1        # Process Page 1
  pnpm generate-timestamps --page 1-10     # Process Pages 1 to 10
  pnpm generate-timestamps --all           # Process all 604 pages
  pnpm generate-timestamps --page 1 --force # Overwrite existing
    `);
    process.exit(0);
  }

  console.log(`🚀 Starting Malayalam word timing generation for ${pages.length} page(s)...`);

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    console.log(`\n────────────────────────────────────────────────────────────`);
    console.log(`Processing Page ${p} (${i + 1}/${pages.length})...`);
    try {
      await processPage(p, force);
    } catch (e) {
      console.error(`❌ Error on Page ${p}:`, (e as Error).message);
    }

    // Small delay between pages to prevent rate spikes
    if (i < pages.length - 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  console.log(`\n🎉 All done!`);
}

main().catch(console.error);
