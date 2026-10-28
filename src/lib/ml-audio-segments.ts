import { AyahSegments, AyahClause, WordSegment } from "./types";
import { emitGeminiToast } from "@/lib/gemini-toast";

const WAQF_REGEX = /[\u06D6-\u06DC]/;

/**
 * Enforces strictly sequential, non-overlapping time boundaries across clauses.
 * Guarantees that Clause K never starts before Clause K-1 ended, preventing previous audio replay.
 */
export function sanitizeClauses(
  clauses: AyahClause[],
  totalAudioDurationMs?: number
): AyahClause[] {
  if (!clauses || clauses.length <= 1) {
    if (clauses && clauses.length === 1) {
      const end = Math.max(clauses[0].endMs, totalAudioDurationMs || 0, 1000);
      return [{ ...clauses[0], startMs: 0, endMs: end }];
    }
    return [];
  }

  const result: AyahClause[] = [];
  let currentStart = 0;

  for (let i = 0; i < clauses.length; i++) {
    const c = clauses[i];
    const isLast = i === clauses.length - 1;

    const startMs = Math.max(c.startMs || 0, currentStart);
    let endMs = Math.max(c.endMs || 0, startMs + 300);

    if (isLast) {
      if (totalAudioDurationMs && totalAudioDurationMs > startMs) {
        endMs = Math.max(endMs, totalAudioDurationMs);
      }
    } else {
      if (totalAudioDurationMs && endMs >= totalAudioDurationMs - 500) {
        const remaining = totalAudioDurationMs - startMs;
        const remainingClauses = clauses.length - i;
        endMs = startMs + Math.max(500, Math.round(remaining / remainingClauses));
      }
    }

    result.push({
      startMs,
      endMs,
      wordIndices: c.wordIndices,
      phrase: c.phrase,
    });

    currentStart = endMs;
  }

  return result;
}

/**
 * Derives meaning-completion clause segments for an ayah.
 * Uses explicit clauses if available, or groups matching word segments,
 * or splits by Quranic waqf marks, or partitions long ayahs into sequential clauses.
 * Always guarantees strictly monotonic non-overlapping time boundaries.
 */
export function extractAyahClauses(
  verseKey: string,
  segments: WordSegment[],
  arabicText?: string,
  existingClauses?: AyahClause[]
): AyahClause[] {
  const totalMs = segments && segments.length > 0 ? Math.max(...segments.map((s) => s.endMs)) : 0;
  if (existingClauses && existingClauses.length > 0) {
    return sanitizeClauses(existingClauses, totalMs);
  }
  if (!segments || segments.length === 0) {
    return [];
  }

  // 0. If segments already contain distinct timestamp groups (from AI alignment),
  // reconstruct natural clauses directly from these groups!
  const groups = new Map<string, { startMs: number; endMs: number; wordIndices: number[] }>();
  for (const seg of segments) {
    const key = `${seg.startMs}_${seg.endMs}`;
    if (!groups.has(key)) {
      groups.set(key, { startMs: seg.startMs, endMs: seg.endMs, wordIndices: [] });
    }
    groups.get(key)!.wordIndices.push(seg.wordIndex);
  }
  if (groups.size > 1) {
    const reconstructed = Array.from(groups.values()).sort((a, b) => a.startMs - b.startMs);
    return sanitizeClauses(reconstructed, totalMs);
  }

  const maxWord = Math.max(...segments.map((s) => s.wordIndex), 0);
  const totalWords = maxWord + 1;

  // 1. If arabicText contains waqf stop marks, segment according to waqf marks
  if (arabicText) {
    const arabicWords = arabicText.trim().split(/\s+/).filter(Boolean);
    const waqfStopIndices: number[] = [];
    arabicWords.forEach((word, idx) => {
      // Don't mark the very last word of ayah as an internal stop
      if (idx < arabicWords.length - 1 && WAQF_REGEX.test(word)) {
        waqfStopIndices.push(idx);
      }
    });

    if (waqfStopIndices.length > 0) {
      const clauses: AyahClause[] = [];
      let prevStop = -1;
      const allStops = [...waqfStopIndices, arabicWords.length - 1];
      let currentStart = 0;

      for (let sIdx = 0; sIdx < allStops.length; sIdx++) {
        const stopIdx = allStops[sIdx];
        const isLast = sIdx === allStops.length - 1;
        const sliceWords: number[] = [];
        for (let w = prevStop + 1; w <= stopIdx; w++) {
          sliceWords.push(w);
        }
        prevStop = stopIdx;

        let splitMs: number;
        if (isLast) {
          splitMs = totalMs;
        } else {
          const segsThis = segments.filter((s) => sliceWords.includes(s.wordIndex));
          const thisMax = segsThis.length > 0 ? Math.max(...segsThis.map((s) => s.endMs)) : 0;
          const propMs = Math.round(totalMs * ((stopIdx + 1) / totalWords));
          if (thisMax > currentStart && thisMax < totalMs) {
            splitMs = Math.min(Math.max(thisMax, propMs - 1500), propMs + 1500);
          } else {
            splitMs = propMs;
          }
          splitMs = Math.max(currentStart + 1000, Math.min(splitMs, totalMs - 1000));
        }

        clauses.push({
          startMs: currentStart,
          endMs: splitMs,
          wordIndices: sliceWords,
        });
        currentStart = splitMs;
      }

      if (clauses.length > 1) {
        return sanitizeClauses(clauses, totalMs);
      }
    }
  }

  // 2. Partition long ayahs (>= 7 words) into 2-4 contiguous sequential clauses
  if (totalWords >= 7) {
    const partsCount = totalWords >= 20 ? 4 : totalWords >= 12 ? 3 : 2;
    const wordsPerPart = Math.ceil(totalWords / partsCount);
    const artificialClauses: AyahClause[] = [];
    let currentStart = 0;

    for (let p = 0; p < partsCount; p++) {
      const startW = p * wordsPerPart;
      const endW = Math.min(totalWords - 1, (p + 1) * wordsPerPart - 1);
      if (startW > endW) break;

      const words: number[] = [];
      for (let w = startW; w <= endW; w++) words.push(w);

      const isLast = p === partsCount - 1 || endW === totalWords - 1;
      let splitMs: number;
      if (isLast) {
        splitMs = totalMs;
      } else {
        const segsThis = segments.filter((s) => words.includes(s.wordIndex));
        const thisMax = segsThis.length > 0 ? Math.max(...segsThis.map((s) => s.endMs)) : 0;
        const propMs = Math.round(totalMs * ((endW + 1) / totalWords));
        if (thisMax > currentStart && thisMax < totalMs) {
          splitMs = Math.min(Math.max(thisMax, propMs - 1500), propMs + 1500);
        } else {
          splitMs = propMs;
        }
        splitMs = Math.max(currentStart + 1000, Math.min(splitMs, totalMs - 1000));
      }

      artificialClauses.push({
        startMs: currentStart,
        endMs: splitMs,
        wordIndices: words,
      });
      currentStart = splitMs;
    }

    if (artificialClauses.length > 1) {
      return sanitizeClauses(artificialClauses, totalMs);
    }
  }

  return sanitizeClauses(
    [{ startMs: 0, endMs: Math.max(totalMs, 1000), wordIndices: segments.map((s) => s.wordIndex) }],
    totalMs
  );
}

// ── Result type ───────────────────────────────────────────────────────────────
export type SegmentResult =
  | { ok: true; data: AyahSegments; source: "cache" | "gemini" }
  | { ok: false; code: "no_key" | "rate_limit" | "overloaded" | "auth" | "not_found" | "error"; message: string };

const cache = new Map<string, SegmentResult>();
const pagePromises = new Map<number, Promise<void>>();

/**
 * Loads all Malayalam word segments for an entire Quran page at once.
 * Reuses existing in-flight promise if multiple calls happen simultaneously.
/**
 * Loads all Malayalam word segments for an entire Quran page at once.
 * Reuses existing in-flight promise if multiple calls happen simultaneously.
 * Populates in-memory cache for all ayahs on that page.
 */
export function fetchMalayalamPageSegments(pageNumber: number, allowGemini: boolean = true): Promise<void> {
  const promiseKey = allowGemini ? pageNumber : -pageNumber;
  if (pagePromises.has(promiseKey)) {
    return pagePromises.get(promiseKey)!;
  }

  const promise = (async () => {
    const geminiKey =
      typeof window !== "undefined"
        ? localStorage.getItem("gemini-api-key") || ""
        : "";

    const headers: Record<string, string> = {
      Accept: "text/event-stream",
    };
    if (geminiKey) headers["x-gemini-key"] = geminiKey;

    try {
      const url = `/api/ml-segments/page/${pageNumber}?stream=true${allowGemini ? "" : "&cacheOnly=true"}`;
      const res = await fetch(url, { headers });
      if (!res.ok) return;

      const contentType = res.headers.get("content-type") || "";
      let map: Record<string, unknown> = {};
      let clausesMap: Record<string, unknown> = {};
      let source: "cache" | "gemini" = "cache";

      if (contentType.includes("text/event-stream") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed.startsWith("data:")) continue;
            try {
              const data = JSON.parse(trimmed.slice(5).trim());

              // Immediately populate already-cached ayahs so playback doesn't wait!
              if (data.type === "cached_ayahs" && data.segmentsByVerse) {
                const clausesByVerse = data.clausesByVerse || {};
                clausesMap = { ...clausesMap, ...clausesByVerse };
                for (const [verseKey, segments] of Object.entries(data.segmentsByVerse)) {
                  if (Array.isArray(segments) && segments.length > 0) {
                    const segs = segments as WordSegment[];
                    const existing = (clausesByVerse[verseKey] as AyahClause[]) || undefined;
                    const clauses = extractAyahClauses(verseKey, segs, undefined, existing);
                    cache.set(verseKey, {
                      ok: true,
                      data: { verseKey, segments: segs, clauses },
                      source: "cache",
                    });
                  }
                }
              } else if (data.type === "trying_model") {
                emitGeminiToast({
                  id: `audio-${pageNumber}`,
                  title: `Page ${pageNumber} Audio Sync`,
                  status: "loading",
                  model: data.model,
                  message: data.message,
                });
              } else if (data.type === "model_failed") {
                emitGeminiToast({
                  id: `audio-${pageNumber}`,
                  title: "Model Fallback",
                  status: "fallback",
                  model: data.nextModel || data.model,
                  message: data.message,
                });
              } else if (data.type === "model_success") {
                emitGeminiToast({
                  id: `audio-${pageNumber}`,
                  title: "Audio Timings",
                  status: "success",
                  model: data.model,
                  message: data.message,
                });
              } else if (data.type === "error") {
                emitGeminiToast({
                  id: `audio-${pageNumber}`,
                  title: "Sync Error",
                  status: "error",
                  message: data.message,
                });
              } else if (data.type === "done") {
                if (data.segmentsByVerse) {
                  map = data.segmentsByVerse;
                }
                if (data.clausesByVerse) {
                  clausesMap = { ...clausesMap, ...data.clausesByVerse };
                }
                source = data.source === "cache" ? "cache" : "gemini";
                if (source === "gemini") {
                  emitGeminiToast({
                    id: `audio-${pageNumber}`,
                    title: `Page ${pageNumber} Audio Ready`,
                    status: "success",
                    model: data.model,
                    message: `Timings saved to Supabase (${data.model})`,
                  });
                }
              }
            } catch {}
          }
        }
      } else {
        const json = await res.json();
        map = json?.segmentsByVerse || {};
        clausesMap = json?.clausesByVerse || {};
        source = json?.source === "cache" ? "cache" : "gemini";
      }

      for (const [verseKey, segments] of Object.entries(map)) {
        if (Array.isArray(segments) && segments.length > 0) {
          const segs = segments as WordSegment[];
          const existing = (clausesMap[verseKey] as AyahClause[]) || undefined;
          const clauses = extractAyahClauses(verseKey, segs, undefined, existing);
          cache.set(verseKey, {
            ok: true,
            data: { verseKey, segments: segs, clauses },
            source,
          });
        }
      }
    } catch {
      // Ignore network error in page background prefetch
    } finally {
      pagePromises.delete(promiseKey);
    }
  })();

  pagePromises.set(promiseKey, promise);
  return promise;
}

/**
 * Fetches per-word timestamps for a Malayalam ayah audio.
 * Coordinates with the full-page batch first. If the page batch did not
 * populate this ayah, falls back to direct single-ayah fetch to retrieve real error or retry.
 */
export async function fetchMalayalamSegments(
  surahNumber: number,
  ayahInSurah: number,
  pageNumber?: number
): Promise<SegmentResult> {
  const key = `${surahNumber}:${ayahInSurah}`;
  if (cache.has(key)) return cache.get(key)!;

  // If pageNumber is available, try the page batch fetch first
  if (pageNumber) {
    try {
      await fetchMalayalamPageSegments(pageNumber, true);
    } catch {}
    if (cache.has(key)) return cache.get(key)!;
  }

  const geminiKey =
    typeof window !== "undefined"
      ? localStorage.getItem("gemini-api-key") || ""
      : "";

  const headers: Record<string, string> = {};
  if (geminiKey) headers["x-gemini-key"] = geminiKey;

  try {
    const res = await fetch(
      `/api/ml-segments/${surahNumber}/${ayahInSurah}`,
      { headers }
    );

    const json = await res.json().catch(() => ({}));
    let serverMsg: string = json?.message || json?.error || "";
    try {
      const idx = serverMsg.indexOf("{");
      if (idx !== -1) {
        const parsed = JSON.parse(serverMsg.slice(idx));
        if (parsed?.error?.message) {
          serverMsg = serverMsg.slice(0, idx) + parsed.error.message;
        }
      }
    } catch {
      // keep serverMsg
    }

    if (!res.ok) {
      let code: "no_key" | "rate_limit" | "overloaded" | "auth" | "not_found" | "error" = "error";

      if (res.status === 401) code = json?.error === "no_key" ? "no_key" : "auth";
      else if (res.status === 429) code = "rate_limit";
      else if (res.status === 503) code = "overloaded";
      else if (res.status === 404) code = "not_found";

      const result: SegmentResult = {
        ok: false,
        code,
        message: serverMsg || `Request failed (${res.status})`,
      };
      if (code !== "rate_limit" && code !== "overloaded" && code !== "error") {
        cache.set(key, result);
      }
      return result;
    }

    if (!Array.isArray(json.segments) || json.segments.length === 0) {
      const result: SegmentResult = {
        ok: false,
        code: "error",
        message: "No timing data returned by Gemini.",
      };
      return result;
    }

    const segs = json.segments as WordSegment[];
    const clauses = (json.clauses as AyahClause[]) || extractAyahClauses(key, segs);

    const result: SegmentResult = {
      ok: true,
      data: { verseKey: key, segments: segs, clauses },
      source: json.source === "cache" ? "cache" : "gemini",
    };
    cache.set(key, result);
    return result;
  } catch {
    return {
      ok: false,
      code: "error",
      message: "Network error. Please check your connection.",
    };
  }
}

/** Remove cached entry so the next call retries fresh */
export function clearSegmentCache(surahNumber?: number, ayahInSurah?: number, pageNumber?: number) {
  if (surahNumber !== undefined && ayahInSurah !== undefined) {
    cache.delete(`${surahNumber}:${ayahInSurah}`);
  }
  if (pageNumber !== undefined) {
    pagePromises.delete(pageNumber);
    pagePromises.delete(-pageNumber);
  }
}
