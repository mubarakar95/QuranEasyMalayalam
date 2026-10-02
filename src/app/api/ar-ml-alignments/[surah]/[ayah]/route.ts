import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import * as path from "path";

const CANDIDATE_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
];

let workingModel = CANDIDATE_MODELS[0];

function getLocalCachePath(): string {
  const dir = path.join(process.cwd(), "src", "data");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "ar_ml_alignments.json");
}

function readLocalCache(): Record<string, unknown> {
  try {
    const file = getLocalCachePath();
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, "utf-8"));
    }
  } catch {}
  return {};
}

function writeLocalCache(key: string, data: unknown) {
  try {
    const cache = readLocalCache();
    cache[key] = data;
    fs.writeFileSync(getLocalCachePath(), JSON.stringify(cache, null, 2), "utf-8");
  } catch {}
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ surah: string; ayah: string }> }
) {
  const { surah: surahParam, ayah: ayahParam } = await params;
  const surah = parseInt(surahParam, 10);
  const ayah = parseInt(ayahParam, 10);

  if (isNaN(surah) || isNaN(ayah) || surah < 1 || surah > 114 || ayah < 1) {
    return NextResponse.json({ error: "Invalid surah or ayah" }, { status: 400 });
  }

  const key = `${surah}:${ayah}`;

  // 1. Check Supabase
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("ar_ml_alignments")
      .select("alignment")
      .eq("surah_number", surah)
      .eq("ayah_number", ayah)
      .single();

    if (!error && Array.isArray(data?.alignment) && data.alignment.length > 0) {
      return NextResponse.json({ phrases: data.alignment, source: "supabase" });
    }
  } catch {
    // Supabase table may not exist yet, continue to local cache / Gemini
  }

  // 2. Check Local File Cache
  const localCache = readLocalCache();
  if (localCache[key] && Array.isArray(localCache[key])) {
    return NextResponse.json({ phrases: localCache[key], source: "local_cache" });
  }

  // 3. Resolve Gemini Key
  let geminiApiKey =
    _req.headers.get("x-gemini-key") || process.env.GEMINI_API_KEY || "";

  if (!geminiApiKey) {
    try {
      const envPath = path.join(process.cwd(), ".env.local");
      if (fs.existsSync(envPath)) {
        const lines = fs.readFileSync(envPath, "utf-8").split("\n");
        for (const line of lines) {
          if (line.trim().startsWith("GEMINI_API_KEY=")) {
            geminiApiKey = line.trim().split("=")[1].trim();
            break;
          }
        }
      }
    } catch {}
  }

  if (!geminiApiKey) {
    geminiApiKey = "AQ.Ab8RN6Ic7DWosMJhV5awpM4VgXic15QMI6Df49iN7VYBMTMZ7g";
  }

  // 4. Fetch Arabic text and Malayalam translation
  let arabicText = "";
  let malayalamText = "";
  let arabicWordList: string[] = [];

  try {
    // Arabic text from local Quran text file
    const quranPath = path.join(process.cwd(), "public", "quran-text.json");
    if (fs.existsSync(quranPath)) {
      const quran = JSON.parse(fs.readFileSync(quranPath, "utf-8"));
      const surahData = quran[surah - 1];
      const verses = surahData?.verses;
      const found = Array.isArray(verses) ? verses.find((a: { id: number; text: string }) => a.id === ayah) : null;
      if (found) arabicText = found.text;
    }

    // Malayalam translation
    const trRes = await fetch(`https://api.alquran.cloud/v1/ayah/${surah}:${ayah}/ml.karakunnu`, {
      headers: { "User-Agent": "QuranEasyMalayalam/1.0" },
    });
    if (trRes.ok) {
      const trData = await trRes.json();
      malayalamText = trData?.data?.text || "";
    }
  } catch {}

  if (!malayalamText || !arabicText) {
    return NextResponse.json({ error: "Text not found for ayah" }, { status: 404 });
  }

  // Split Arabic text into words (1-based index)
  arabicWordList = arabicText.trim().split(/\s+/).filter(Boolean);
  const numberedArabic = arabicWordList.map((w, idx) => `${idx + 1}: ${w}`).join(", ");

  const prompt = `You are an expert Quran linguist in Arabic and Malayalam.
Given the numbered Arabic words of Surah ${surah}, Ayah ${ayah} and its complete Malayalam translation:

Arabic Words:
${numberedArabic}

Malayalam Translation:
${malayalamText}

Segment the Malayalam translation into ordered phrases that match the Arabic words.
Return ONLY valid JSON matching this schema:
{
  "phrases": [
    {
      "phrase": "exact Malayalam substring from the translation",
      "arabicPositions": [1, 2, 3]
    }
  ]
}

Rules:
1. Concatenating all phrases in order MUST reconstruct the exact Malayalam translation text without losing words.
2. arabicPositions MUST contain 1-based indices corresponding to the Arabic words above.
3. Every Arabic word position (from 1 to ${arabicWordList.length}) must be mapped.`;

  const genai = new GoogleGenAI({ apiKey: geminiApiKey });

  const modelsToTry = [workingModel, ...CANDIDATE_MODELS.filter((m) => m !== workingModel)];
  let responseText: string | null = null;
  let usedModel = workingModel;

  for (const model of modelsToTry) {
    try {
      const res = await genai.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: "application/json" },
      });
      if (res.text) {
        responseText = res.text;
        usedModel = model;
        workingModel = model;
        break;
      }
    } catch (err: unknown) {
      console.warn(`[AR-ML-Alignments] Model ${model} failed:`, (err as Error).message);
    }
  }

  if (!responseText) {
    return NextResponse.json({ error: "Gemini generation failed" }, { status: 503 });
  }

  try {
    const parsed = JSON.parse(responseText);
    const phrases = parsed.phrases;
    if (!Array.isArray(phrases) || phrases.length === 0) {
      throw new Error("Invalid format");
    }

    // 5. Save to local cache
    writeLocalCache(key, phrases);

    // 6. Try to save to Supabase
    try {
      const supabase = await createClient();
      await supabase.from("ar_ml_alignments").upsert({
        surah_number: surah,
        ayah_number: ayah,
        alignment: phrases,
      });
    } catch {}

    return NextResponse.json({ phrases, source: "gemini", model: usedModel });
  } catch {
    return NextResponse.json({ error: "Failed to parse alignment JSON" }, { status: 500 });
  }
}
