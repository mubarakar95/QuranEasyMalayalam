import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import * as path from "path";

const CANDIDATE_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
];

let workingModel: string = CANDIDATE_MODELS[0];

const pageAyahsCache = new Map<number, Array<{ surahNumber: number; ayahNumber: number; verseKey: string }>>();

function getPageAyahs(pageNumber: number): Array<{ surahNumber: number; ayahNumber: number; verseKey: string }> {
  if (pageAyahsCache.size === 0) {
    try {
      const mapPath = path.join(process.cwd(), "public", "verse-page-map.json");
      if (fs.existsSync(mapPath)) {
        const raw = JSON.parse(fs.readFileSync(mapPath, "utf-8"));
        for (const [vk, p] of Object.entries(raw)) {
          const pg = Number(p);
          if (!pageAyahsCache.has(pg)) pageAyahsCache.set(pg, []);
          const [s, a] = vk.split(":").map(Number);
          pageAyahsCache.get(pg)!.push({ surahNumber: s, ayahNumber: a, verseKey: vk });
        }
      }
    } catch {
      // Fallback to on-demand fetch if reading map fails
    }
  }
  return pageAyahsCache.get(pageNumber) || [];
}

interface ProgressEvent {
  type: "status" | "trying_model" | "model_failed" | "model_success" | "done" | "error" | "cached_ayahs";
  model?: string;
  nextModel?: string;
  error?: string;
  message: string;
  source?: string;
  segmentsByVerse?: Record<string, unknown>;
}

async function processMalayalamPageSegments(
  pageNumber: number,
  geminiKeyHeader: string,
  cacheOnly: boolean = false,
  onProgress?: (event: ProgressEvent) => void
): Promise<{ segmentsByVerse: Record<string, unknown>; source: string }> {
  // 1. Fetch ayahs on this page
  let ayahs = getPageAyahs(pageNumber);
  if (ayahs.length === 0) {
    try {
      const quranRes = await fetch(`https://api.alquran.cloud/v1/page/${pageNumber}/quran-uthmani`, {
        headers: { "User-Agent": "QuranEasyMalayalam/1.0" },
      });
      if (!quranRes.ok) throw new Error("Upstream failed");
      const quranData = await quranRes.json();
      ayahs = (quranData.data.ayahs || []).map((a: { surah: { number: number }; numberInSurah: number }) => ({
        surahNumber: a.surah.number,
        ayahNumber: a.numberInSurah,
        verseKey: `${a.surah.number}:${a.numberInSurah}`,
      }));
      if (ayahs.length > 0) {
        pageAyahsCache.set(pageNumber, ayahs);
      }
    } catch {
      const res = { segmentsByVerse: {}, source: "cache" };
      onProgress?.({ type: "done", ...res, message: "Failed to load page ayahs" });
      return res;
    }
  }

  if (ayahs.length === 0) {
    const res = { segmentsByVerse: {}, source: "cache" };
    onProgress?.({ type: "done", ...res, message: "No ayahs on page" });
    return res;
  }

  onProgress?.({
    type: "status",
    message: `Checking Supabase for Malayalam audio timings (Page ${pageNumber})...`,
  });

  // 2. Check Supabase cache for this page's ayahs
  const supabase = await createClient();
  const surahNumbers = Array.from(new Set(ayahs.map((a) => a.surahNumber)));
  const ayahNumbers = Array.from(new Set(ayahs.map((a) => a.ayahNumber)));
  const { data: cachedRows } = await supabase
    .from("ml_word_timestamps")
    .select("surah_number, ayah_number, segments")
    .in("surah_number", surahNumbers)
    .in("ayah_number", ayahNumbers);

  const pageVerseKeys = new Set(ayahs.map((a) => a.verseKey));
  const segmentsByVerse: Record<string, unknown> = {};
  for (const row of cachedRows || []) {
    const vk = `${row.surah_number}:${row.ayah_number}`;
    if (pageVerseKeys.has(vk)) {
      segmentsByVerse[vk] = row.segments;
    }
  }

  const missingAyahs = ayahs.filter((a) => !segmentsByVerse[a.verseKey]);

  // If cacheOnly is requested or all ayahs are already in Supabase, return immediately!
  if (cacheOnly || missingAyahs.length === 0) {
    const res = { segmentsByVerse, source: "cache" };
    onProgress?.({
      type: "done",
      ...res,
      message: `${Object.keys(segmentsByVerse).length} audio timings loaded from cache`,
    });
    return res;
  }

  // Stream any already-cached ayahs immediately so playback starts instantly!
  if (Object.keys(segmentsByVerse).length > 0) {
    onProgress?.({
      type: "cached_ayahs",
      segmentsByVerse,
      message: `${Object.keys(segmentsByVerse).length} audio timings loaded from cache, preparing ${missingAyahs.length} remaining...`,
    });
  }

  onProgress?.({
    type: "status",
    message: `Preparing audio timestamps for ${missingAyahs.length} ayahs...`,
  });

  // 3. Resolve Gemini Key
  let geminiApiKey = geminiKeyHeader || process.env.GEMINI_API_KEY || "";
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
    onProgress?.({
      type: "error",
      message: "Add your Gemini API key in Settings for AI audio timestamps",
      segmentsByVerse,
    });
    return { segmentsByVerse, source: "partial_cache" };
  }

  // 4. Load Arabic word list and Malayalam translation
  let quranData: Array<{ id: number; verses: Array<{ id: number; text: string }> }> = [];
  try {
    const quranPath = path.join(process.cwd(), "public", "quran-text.json");
    if (fs.existsSync(quranPath)) {
      quranData = JSON.parse(fs.readFileSync(quranPath, "utf-8"));
    }
  } catch {}

  const mlTranslationMap = new Map<string, string>();
  try {
    const trRes = await fetch(`https://api.alquran.cloud/v1/page/${pageNumber}/ml.karakunnu`, {
      headers: { "User-Agent": "QuranEasyMalayalam/1.0" },
    });
    if (trRes.ok) {
      const trData = await trRes.json();
      for (const a of trData?.data?.ayahs || []) {
        const vk = `${a.surah.number}:${a.numberInSurah}`;
        mlTranslationMap.set(vk, a.text || "");
      }
    }
  } catch {}

  // 5. Download missing audios in parallel
  const audioMap = new Map<string, string>();
  await Promise.all(
    missingAyahs.map(async (a) => {
      try {
        const s = a.surahNumber.toString().padStart(3, "0");
        const ay = a.ayahNumber.toString().padStart(3, "0");
        const url = `https://lalithasaram.net/audio/qtaud/transl/${s}_${ay}.mp3`;
        const res = await fetch(url, { headers: { "User-Agent": "QuranEasyMalayalam/1.0" } });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          audioMap.set(a.verseKey, buf.toString("base64"));
        }
      } catch {
        // ignore individual failed downloads
      }
    })
  );

  const validAyahs = missingAyahs.filter((a) => audioMap.has(a.verseKey));
  if (validAyahs.length === 0) {
    const res = { segmentsByVerse, source: "cache" };
    onProgress?.({ type: "done", ...res, message: "Loaded available audio cache" });
    return res;
  }

  // 6. Build single batch multimodal prompt
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  parts.push({
    text: `You are analyzing Malayalam translation audio (Lalithasaram narration) for the Holy Quran.
For each ayah provided below, you are given:
1. The Malayalam translation text (as spoken in the audio narration).
2. The 0-indexed Arabic words of the ayah.
3. The spoken Malayalam audio.

The narrator speaks in natural, flowing Malayalam clauses/sentences, not isolated words.
Your task: listen to the Malayalam audio and segment it into the spoken clauses/sentences.
For each spoken clause, provide:
- "startMs": millisecond timestamp when the narrator starts speaking this clause (integer)
- "endMs": millisecond timestamp when the narrator finishes speaking this clause (integer)
- "wordIndices": array of 0-based Arabic word indices that correspond to the meaning of this spoken clause.

CRITICAL RULES:
- Every Arabic word from 0 to N-1 must be covered across the clauses.
- startMs and endMs must be integers (no decimals).
- Output format must be a valid JSON object mapping each verse key to an array of clause objects with "startMs", "endMs", and "wordIndices".
- Return ONLY the JSON object. No explanation, no markdown backticks.

Example output format:
{
  "74:31": [
    { "startMs": 0, "endMs": 6270, "wordIndices": [0, 1, 2, 3, 4, 5] },
    { "startMs": 6270, "endMs": 13750, "wordIndices": [6, 7, 8, 9, 10, 11, 12] }
  ]
}\n`,
  });

  for (const a of validAyahs) {
    const surahObj = quranData[a.surahNumber - 1];
    const verseObj = surahObj?.verses?.find((v) => v.id === a.ayahNumber);
    const words = verseObj?.text?.trim().split(/\s+/).filter(Boolean) || [];
    const mlText = mlTranslationMap.get(a.verseKey) || "";
    const b64 = audioMap.get(a.verseKey)!;
    parts.push({
      text: `\n--- AYAH ${a.verseKey} (${words.length} Arabic words) ---\nMalayalam translation: ${mlText}\nArabic words (0-indexed):\n${words
        .map((w, i) => `${i}: ${w}`)
        .join("\n")}\nAudio for Ayah ${a.verseKey}:`,
    });
    parts.push({ inlineData: { mimeType: "audio/mpeg", data: b64 } });
  }

  parts.push({
    text: `\nOutput JSON object mapping each verse key to its array of clause timings with wordIndices:`,
  });

  // 7. Send to Gemini with fallback
  const genai = new GoogleGenAI({ apiKey: geminiApiKey });
  const modelsToTry = [
    workingModel,
    ...CANDIDATE_MODELS.filter((m) => m !== workingModel),
  ];

  let parsed: Record<string, unknown> | null = null;
  for (let i = 0; i < modelsToTry.length; i++) {
    const modelName = modelsToTry[i];
    onProgress?.({
      type: "trying_model",
      model: modelName,
      message: `Analyzing Malayalam audio with ${modelName}...`,
    });

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
        parsed = json;
        workingModel = modelName;
        onProgress?.({
          type: "model_success",
          model: modelName,
          message: `Audio timestamps generated with ${modelName}!`,
        });
        break;
      }
    } catch (err: unknown) {
      let reason = "Unavailable";
      if (err instanceof Error) {
        const msg = err.message;
        if (msg.includes("429") || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED")) {
          reason = "Quota limit (429)";
        } else if (msg.includes("503") || msg.includes("demand") || msg.includes("UNAVAILABLE")) {
          reason = "High demand (503)";
        } else if (msg.includes("404")) {
          reason = "Not found (404)";
        } else {
          reason = msg.slice(0, 30);
        }
      }
      const nextModel = modelsToTry[i + 1];
      onProgress?.({
        type: "model_failed",
        model: modelName,
        nextModel,
        error: reason,
        message: `${modelName} ${reason}${nextModel ? `, switching to ${nextModel}...` : ""}`,
      });
    }
  }

  if (parsed) {
    const rowsToUpsert = [];
    for (const a of validAyahs) {
      const rawSegs = parsed[a.verseKey];
      if (Array.isArray(rawSegs) && rawSegs.length > 0) {
        const flattened: Array<{ wordIndex: number; startMs: number; endMs: number }> = [];
        for (const item of rawSegs) {
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
        if (flattened.length > 0) {
          flattened.sort((x, y) => x.wordIndex - y.wordIndex);
          segmentsByVerse[a.verseKey] = flattened;
          rowsToUpsert.push({
            surah_number: a.surahNumber,
            ayah_number: a.ayahNumber,
            segments: flattened,
          });
        }
      }
    }

    if (rowsToUpsert.length > 0) {
      try {
        await supabase
          .from("ml_word_timestamps")
          .upsert(rowsToUpsert, { onConflict: "surah_number,ayah_number" });
      } catch {}
    }

    const res = { segmentsByVerse, source: "gemini" };
    onProgress?.({
      type: "done",
      source: "gemini",
      model: workingModel,
      segmentsByVerse,
      message: `Audio timings saved to Supabase (${workingModel})`,
    });
    return res;
  }

  const fallbackRes = { segmentsByVerse, source: "partial_cache" };
  onProgress?.({
    type: "error",
    message: "Could not generate audio timestamps from Gemini.",
    segmentsByVerse,
  });
  return fallbackRes;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ page: string }> }
) {
  const { page: pageParam } = await params;
  const pageNumber = parseInt(pageParam, 10);

  if (isNaN(pageNumber) || pageNumber < 1 || pageNumber > 604) {
    return NextResponse.json({ error: "Invalid page parameter" }, { status: 400 });
  }

  const geminiKeyHeader = _req.headers.get("x-gemini-key") || "";
  const isStream = _req.nextUrl.searchParams.get("stream") === "true";
  const cacheOnly = _req.nextUrl.searchParams.get("cacheOnly") === "true";

  if (!isStream) {
    const result = await processMalayalamPageSegments(pageNumber, geminiKeyHeader, cacheOnly);
    return NextResponse.json(result);
  }

  // Handle SSE streaming
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: ProgressEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {}
      };

      try {
        await processMalayalamPageSegments(pageNumber, geminiKeyHeader, cacheOnly, sendEvent);
      } catch (err: unknown) {
        sendEvent({
          type: "error",
          message: err instanceof Error ? err.message : "Internal error occurred",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
