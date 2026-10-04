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
  "gemini-3.1-pro",
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
  "gemini-1.5-pro",
];

let workingModel = CANDIDATE_MODELS[0];

function parseGeminiError(err: unknown): { reason: string; isKeyError: boolean } {
  if (!(err instanceof Error)) {
    return { reason: "Unknown error", isKeyError: false };
  }
  let message = err.message;
  try {
    const json = JSON.parse(err.message);
    if (json?.error?.message) {
      message = json.error.message;
    }
    const reasonCode = json?.error?.details?.[0]?.reason;
    if (reasonCode === "API_KEY_INVALID" || message.toLowerCase().includes("api key not valid")) {
      return { reason: "Invalid Gemini API Key. Please update it in Settings.", isKeyError: true };
    }
  } catch {}

  const lower = message.toLowerCase();
  if (lower.includes("api_key_invalid") || lower.includes("api key not valid")) {
    return { reason: "Invalid Gemini API Key. Please update it in Settings.", isKeyError: true };
  }
  if (lower.includes("429") || lower.includes("quota") || lower.includes("resource_exhausted")) {
    return { reason: "Quota limit exceeded (429)", isKeyError: false };
  }
  if (lower.includes("503") || lower.includes("demand") || lower.includes("unavailable")) {
    return { reason: "High demand / unavailable (503)", isKeyError: false };
  }
  if (lower.includes("404") || lower.includes("not found")) {
    return { reason: "Not found (404)", isKeyError: false };
  }
  if (lower.includes("403") || lower.includes("permission_denied")) {
    return { reason: "Permission denied (403)", isKeyError: true };
  }

  return { reason: message.slice(0, 45), isKeyError: false };
}

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
    } catch {}
  }
  return pageAyahsCache.get(pageNumber) || [];
}

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

function saveLocalCache(cache: Record<string, unknown>) {
  try {
    fs.writeFileSync(getLocalCachePath(), JSON.stringify(cache, null, 2), "utf-8");
  } catch {}
}

interface ProgressEvent {
  type: "status" | "trying_model" | "model_failed" | "model_success" | "done" | "error";
  model?: string;
  nextModel?: string;
  error?: string;
  message: string;
  source?: string;
  alignments?: Record<string, unknown>;
}

async function processPageAlignments(
  pageNumber: number,
  geminiKeyHeader: string,
  cacheOnly: boolean = false,
  onProgress?: (event: ProgressEvent) => void
): Promise<{ alignments: Record<string, unknown>; source: string }> {
  const ayahs = getPageAyahs(pageNumber);
  if (ayahs.length === 0) {
    const res = { alignments: {}, source: "cache" };
    onProgress?.({ type: "done", ...res, message: "No ayahs on page" });
    return res;
  }

  const alignments: Record<string, unknown> = {};

  onProgress?.({
    type: "status",
    message: `Checking Supabase & local cache for Page ${pageNumber}...`,
  });

  // 1. Check Supabase
  let supabase = null;
  try {
    supabase = await createClient();
    const surahNumbers = Array.from(new Set(ayahs.map((a) => a.surahNumber)));
    const ayahNumbers = Array.from(new Set(ayahs.map((a) => a.ayahNumber)));
    const pageVerseKeys = new Set(ayahs.map((a) => a.verseKey));
    const { data } = await supabase
      .from("ar_ml_alignments")
      .select("surah_number, ayah_number, alignment")
      .in("surah_number", surahNumbers)
      .in("ayah_number", ayahNumbers);

    for (const row of data || []) {
      const vk = `${row.surah_number}:${row.ayah_number}`;
      if (pageVerseKeys.has(vk) && Array.isArray(row.alignment) && row.alignment.length > 0) {
        alignments[vk] = (row.alignment as Array<{ phrase?: string; arabicPositions?: unknown }>).map((p) => ({
          phrase: typeof p?.phrase === "string" ? p.phrase : "",
          arabicPositions: Array.isArray(p?.arabicPositions)
            ? p.arabicPositions.map(Number).filter((n) => typeof n === "number" && !isNaN(n))
            : [],
        }));
      }
    }
  } catch {}

  // 2. Supplement from local cache
  const localCache = readLocalCache();
  for (const a of ayahs) {
    if (!alignments[a.verseKey] && Array.isArray(localCache[a.verseKey])) {
      alignments[a.verseKey] = (localCache[a.verseKey] as Array<{ phrase?: string; arabicPositions?: unknown }>).map((p) => ({
        phrase: typeof p?.phrase === "string" ? p.phrase : "",
        arabicPositions: Array.isArray(p?.arabicPositions)
          ? p.arabicPositions.map(Number).filter((n) => typeof n === "number" && !isNaN(n))
          : [],
      }));
    }
  }

  // 3. Find missing ayahs on this page
  const missingAyahs = ayahs.filter((a) => !alignments[a.verseKey]);
  if (cacheOnly || missingAyahs.length === 0) {
    const res = { alignments, source: "cache" };
    onProgress?.({
      type: "done",
      source: "cache",
      alignments,
      message: `${Object.keys(alignments).length} ayahs loaded from cache`,
    });
    return res;
  }

  onProgress?.({
    type: "status",
    message: `Found ${missingAyahs.length} unaligned ayahs. Preparing Gemini batch...`,
  });

  // 4. Resolve Gemini Key
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
      message: "Add your Gemini API key in Settings for live translation alignment",
      alignments,
    });
    return { alignments, source: "partial_cache" };
  }

  // 5. Fetch entire page's Malayalam translation in ONE call
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

  // 6. Read Arabic text from local Quran text file
  let quranData: Array<{ id: number; verses: Array<{ id: number; text: string }> }> = [];
  try {
    const quranPath = path.join(process.cwd(), "public", "quran-text.json");
    if (fs.existsSync(quranPath)) {
      quranData = JSON.parse(fs.readFileSync(quranPath, "utf-8"));
    }
  } catch {}

  // 7. Prepare batch items for all missing ayahs
  const batchItems: Array<{
    verseKey: string;
    surahNumber: number;
    ayahNumber: number;
    arabicWords: string[];
    numberedArabic: string;
    malayalamText: string;
  }> = [];

  for (const a of missingAyahs) {
    const surahObj = quranData[a.surahNumber - 1];
    const verseObj = surahObj?.verses?.find((v) => v.id === a.ayahNumber);
    const arabicText = verseObj?.text || "";
    const mlText = mlTranslationMap.get(a.verseKey) || "";

    if (arabicText && mlText) {
      const words = arabicText.trim().split(/\s+/).filter(Boolean);
      const numbered = words.map((w, idx) => `${idx + 1}: ${w}`).join(", ");
      batchItems.push({
        verseKey: a.verseKey,
        surahNumber: a.surahNumber,
        ayahNumber: a.ayahNumber,
        arabicWords: words,
        numberedArabic: numbered,
        malayalamText: mlText,
      });
    }
  }

  if (batchItems.length === 0) {
    const res = { alignments, source: "partial_cache" };
    onProgress?.({ type: "done", ...res, message: "Loaded partial cache" });
    return res;
  }

  // 8. Build a SINGLE batch prompt for all missing ayahs of this page
  let prompt = `You are an expert Quran linguist in Arabic and Malayalam.
For each Ayah on this Quran page, segment the Malayalam translation into ordered phrases that match the numbered Arabic words.

`;

  for (const item of batchItems) {
    prompt += `--- AYAH ${item.verseKey} ---
Arabic Words:
${item.numberedArabic}

Malayalam Translation:
${item.malayalamText}

`;
  }

  prompt += `Return ONLY a valid JSON object where keys are the exact verse keys (e.g. "${batchItems[0].verseKey}") and values are arrays of phrase objects:
{
  "${batchItems[0].verseKey}": [
    {
      "phrase": "exact Malayalam substring from the translation",
      "arabicPositions": [1, 2, 3]
    }
  ]
}

Rules:
1. For each Ayah, concatenating all its phrases in order MUST reconstruct the exact Malayalam translation text without losing words.
2. arabicPositions MUST contain 1-based indices corresponding to the Arabic words of that Ayah.
3. Every Arabic word position must be mapped.
4. Output ONLY the JSON object. No explanations, no markdown fences.`;

  // 9. Send single Gemini batch call with fallback candidate models
  const genai = new GoogleGenAI({ apiKey: geminiApiKey });
  const modelsToTry = [
    workingModel,
    ...CANDIDATE_MODELS.filter((m) => m !== workingModel),
  ];

  let parsed: Record<string, Array<{ phrase: string; arabicPositions: number[] }>> | null = null;
  let lastError = "";

  for (let i = 0; i < modelsToTry.length; i++) {
    const modelName = modelsToTry[i];
    onProgress?.({
      type: "trying_model",
      model: modelName,
      message: `Calling ${modelName} (${batchItems.length} ayahs)...`,
    });

    try {
      const resp = await genai.models.generateContent({
        model: modelName,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
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
          message: `Aligned Page ${pageNumber} using ${modelName}!`,
        });
        break;
      }
    } catch (err: unknown) {
      console.error(`[Gemini ar-ml-alignments Page ${pageNumber}] ${modelName} failed:`, err instanceof Error ? err.message : err);
      const { reason, isKeyError } = parseGeminiError(err);
      lastError = reason;

      const nextModel = modelsToTry[i + 1];
      onProgress?.({
        type: "model_failed",
        model: modelName,
        nextModel: isKeyError ? undefined : nextModel,
        error: reason,
        message: `${modelName}: ${reason}${!isKeyError && nextModel ? `, switching to ${nextModel}...` : ""}`,
      });

      // If the API key is invalid or unauthorized, stop immediately rather than failing all models
      if (isKeyError) {
        break;
      }
    }
  }

  // 10. If Gemini succeeded, upsert all to Supabase and local cache
  if (parsed) {
    const rowsToUpsert: Array<{ surah_number: number; ayah_number: number; alignment: unknown }> = [];
    let updatedLocalCache = false;

    for (const item of batchItems) {
      const phrases = parsed[item.verseKey];
      if (Array.isArray(phrases) && phrases.length > 0) {
        const sanitized = phrases.map((p: any) => ({
          phrase: typeof p?.phrase === "string" ? p.phrase : "",
          arabicPositions: Array.isArray(p?.arabicPositions)
            ? p.arabicPositions.map(Number).filter((n: number) => typeof n === "number" && !isNaN(n))
            : [],
        }));
        alignments[item.verseKey] = sanitized;
        rowsToUpsert.push({
          surah_number: item.surahNumber,
          ayah_number: item.ayahNumber,
          alignment: sanitized,
        });
        localCache[item.verseKey] = sanitized;
        updatedLocalCache = true;
      }
    }

    if (updatedLocalCache) {
      saveLocalCache(localCache);
    }

    if (supabase && rowsToUpsert.length > 0) {
      try {
        await supabase
          .from("ar_ml_alignments")
          .upsert(rowsToUpsert, { onConflict: "surah_number,ayah_number" });
      } catch {}
    }

    const res = { alignments, source: "gemini_batch" };
    onProgress?.({
      type: "done",
      source: "gemini_batch",
      model: workingModel,
      alignments,
      message: `Page ${pageNumber} alignments saved to Supabase`,
    });
    return res;
  }

  const fallbackRes = { alignments, source: "partial_cache" };
  onProgress?.({
    type: "error",
    message: lastError
      ? `All candidate Gemini models failed (${lastError}). Showing partial cache.`
      : "All candidate Gemini models failed. Showing partial cache.",
    alignments,
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
    const result = await processPageAlignments(pageNumber, geminiKeyHeader, cacheOnly);
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
        await processPageAlignments(pageNumber, geminiKeyHeader, cacheOnly, sendEvent);
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
