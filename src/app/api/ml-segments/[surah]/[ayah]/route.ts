import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import * as path from "path";

// ── Model fallback hierarchy ──────────────────────────────────────────────────
// If the primary model fails or is deprecated/overloaded, fall back down the list.
// The first model that succeeds is remembered in `activeWorkingModel` so subsequent
// calls start with that known-working model directly.
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

let activeWorkingModel: string = CANDIDATE_MODELS[0];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ surah: string; ayah: string }> }
) {
  const { surah: surahParam, ayah: ayahParam } = await params;
  const surahNumber = parseInt(surahParam, 10);
  const ayahNumber = parseInt(ayahParam, 10);

  if (isNaN(surahNumber) || isNaN(ayahNumber)) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }

  // ── Resolve Gemini API key ─────────────────────────────────────────────────
  // User's personal key (from header) takes priority over server env var.
  const geminiApiKey =
    _req.headers.get("x-gemini-key") || process.env.GEMINI_API_KEY || "";
  if (!geminiApiKey) {
    return NextResponse.json(
      { error: "no_key", message: "No Gemini API key. Add your key in Settings." },
      { status: 401 }
    );
  }
  const genai = new GoogleGenAI({ apiKey: geminiApiKey });

  // ── 1. Check Supabase cache ────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: cached } = await supabase
    .from("ml_word_timestamps")
    .select("segments")
    .eq("surah_number", surahNumber)
    .eq("ayah_number", ayahNumber)
    .maybeSingle();

  if (cached?.segments) {
    return NextResponse.json({ segments: cached.segments, source: "cache" });
  }

  // ── 2. Load Arabic words and Malayalam translation ───────────────────────
  let arabicWords: string[] = [];
  try {
    const quranPath = path.join(process.cwd(), "public", "quran-text.json");
    if (fs.existsSync(quranPath)) {
      const quranData = JSON.parse(fs.readFileSync(quranPath, "utf-8"));
      const surahObj = quranData[surahNumber - 1];
      const verseObj = surahObj?.verses?.find((v: { id: number }) => v.id === ayahNumber);
      if (verseObj?.text) {
        arabicWords = verseObj.text.trim().split(/\s+/).filter(Boolean);
      }
    }
  } catch {}

  let mlText = "";
  try {
    const trRes = await fetch(`https://api.alquran.cloud/v1/ayah/${surahNumber}:${ayahNumber}/ml.karakunnu`, {
      headers: { "User-Agent": "QuranEasyMalayalam/1.0" },
    });
    if (trRes.ok) {
      const trData = await trRes.json();
      mlText = trData?.data?.text || "";
    }
  } catch {}

  if (arabicWords.length === 0) {
    return NextResponse.json(
      { error: "no_words", message: "Arabic words not found for this ayah" },
      { status: 404 }
    );
  }

  // ── 3. Fetch Malayalam audio bytes ────────────────────────────────────────
  const s = surahNumber.toString().padStart(3, "0");
  const a = ayahNumber.toString().padStart(3, "0");
  const audioUrl = `https://lalithasaram.net/audio/qtaud/transl/${s}_${a}.mp3`;

  let audioBase64: string;
  try {
    const audioRes = await fetch(audioUrl, {
      headers: { "User-Agent": "QuranEasyMalayalam/1.0" },
    });
    if (!audioRes.ok) {
      return NextResponse.json(
        { error: "audio_not_found", message: "Malayalam audio not found for this ayah" },
        { status: 404 }
      );
    }
    audioBase64 = Buffer.from(await audioRes.arrayBuffer()).toString("base64");
  } catch {
    return NextResponse.json(
      { error: "audio_fetch_failed", message: "Could not download Malayalam audio" },
      { status: 502 }
    );
  }

  // ── 4. Ask Gemini to align spoken clauses with model fallback cycle ───────
  const wordList = arabicWords.map((w, i) => `${i}: ${w}`).join("\n");
  const prompt = `You are analyzing Malayalam translation audio (Lalithasaram narration) for the Holy Quran.
Ayah: ${surahNumber}:${ayahNumber} (${arabicWords.length} Arabic words)
Malayalam translation text (as spoken in narration):
${mlText}

Arabic words (0-indexed):
${wordList}

The narrator speaks in natural, flowing Malayalam clauses/sentences, not isolated words.
Your task: listen carefully to the Malayalam audio and segment it into the spoken clauses/sentences.
For each spoken clause, provide:
- "startMs": millisecond timestamp when the narrator starts speaking this clause (integer)
- "endMs": millisecond timestamp when the narrator finishes speaking this clause (integer)
- "wordIndices": array of 0-based Arabic word indices that correspond to the meaning of this spoken clause.

CRITICAL RULES:
- Every Arabic word from 0 to ${arabicWords.length - 1} must be covered across the clauses.
- startMs and endMs must be integers (no decimals).
- Return ONLY a valid JSON array of clause objects with "startMs", "endMs", and "wordIndices". No explanation, no markdown backticks.

Example output:
[
  { "startMs": 0, "endMs": 6270, "wordIndices": [0, 1, 2, 3, 4, 5] },
  { "startMs": 6270, "endMs": 13750, "wordIndices": [6, 7, 8, 9, 10, 11, 12] }
]`;

  // Try the active working model first, then fall back down the list
  const modelsToTry = [
    activeWorkingModel,
    ...CANDIDATE_MODELS.filter((m) => m !== activeWorkingModel),
  ];

  let segments: { wordIndex: number; startMs: number; endMs: number }[] | null = null;
  let lastErrorMsg = "";
  let lastErrorCode = "gemini_error";
  let lastErrorStatus = 502;
  let successfulModel = "";

  for (const modelName of modelsToTry) {
    try {
      const response = await genai.models.generateContent({
        model: modelName,
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: "audio/mpeg", data: audioBase64 } },
              { text: prompt },
            ],
          },
        ],
      });

      const rawText = response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (!rawText) {
        throw new Error(`Empty response from ${modelName}`);
      }

      let cleaned = rawText.replace(/```json?\s*/gi, "").replace(/```/g, "").trim();
      const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
      if (jsonMatch) cleaned = jsonMatch[0];

      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error(`Invalid segments array returned by ${modelName}`);
      }

      const flattened: Array<{ wordIndex: number; startMs: number; endMs: number }> = [];
      for (const item of parsed) {
        if (Array.isArray(item.wordIndices)) {
          for (const wIdx of item.wordIndices) {
            flattened.push({
              wordIndex: Number(wIdx),
              startMs: Math.round(Number(item.startMs)),
              endMs: Math.round(Number(item.endMs)),
            });
          }
        } else if (typeof item.wordIndex === "number") {
          flattened.push({
            wordIndex: Number(item.wordIndex),
            startMs: Math.round(Number(item.startMs)),
            endMs: Math.round(Number(item.endMs)),
          });
        }
      }

      if (flattened.length === 0) {
        throw new Error(`No valid word segments in response from ${modelName}`);
      }

      flattened.sort((x, y) => x.wordIndex - y.wordIndex);
      segments = flattened;
      successfulModel = modelName;
      activeWorkingModel = modelName; // Remember this working model for future calls!
      break;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const errStatus =
        typeof err === "object" && err !== null && "status" in err
          ? (err as { status?: number }).status
          : undefined;

      // Extract cleaner message if JSON
      let cleanMsg = errMsg;
      try {
        const jsonStart = errMsg.indexOf("{");
        if (jsonStart !== -1) {
          const parsedErr = JSON.parse(errMsg.slice(jsonStart));
          if (parsedErr?.error?.message) {
            cleanMsg = parsedErr.error.message;
          }
        }
      } catch {
        // Keep raw cleanMsg
      }

      if (errStatus === 401 || errStatus === 403 || /API_KEY|invalid.?key/i.test(errMsg)) {
        return NextResponse.json(
          { error: "gemini_auth", message: "Invalid Gemini API key. Please check your key in Settings." },
          { status: 401 }
        );
      }

      if (errStatus === 429 || errMsg.includes("429") || /quota|rate.?limit/i.test(errMsg)) {
        lastErrorCode = "gemini_rate_limit";
        lastErrorMsg = `${modelName}: Rate limit exceeded.`;
        lastErrorStatus = 429;
      } else if (errStatus === 503 || errMsg.includes("503") || /overload|unavailable/i.test(errMsg)) {
        lastErrorCode = "gemini_overloaded";
        lastErrorMsg = `${modelName}: Model overloaded.`;
        lastErrorStatus = 503;
      } else {
        lastErrorMsg = `${modelName}: ${cleanMsg}`;
      }

      console.warn(`[ML-Segments] Model ${modelName} failed, falling back to next:`, cleanMsg);
    }
  }

  if (!segments) {
    return NextResponse.json(
      { error: lastErrorCode, message: `All Gemini models failed. Last error: ${lastErrorMsg}` },
      { status: lastErrorStatus }
    );
  }

  // ── 5. Store result in Supabase ───────────────────────────────────────────
  await supabase.from("ml_word_timestamps").upsert({
    surah_number: surahNumber,
    ayah_number: ayahNumber,
    segments,
  });

  return NextResponse.json({ segments, source: "gemini", model: successfulModel });
}
