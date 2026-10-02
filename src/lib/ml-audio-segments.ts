import { AyahSegments } from "./types";
import { emitGeminiToast } from "@/lib/gemini-toast";

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
                for (const [verseKey, segments] of Object.entries(data.segmentsByVerse)) {
                  if (Array.isArray(segments) && segments.length > 0) {
                    cache.set(verseKey, {
                      ok: true,
                      data: { verseKey, segments: segments as import("./types").WordSegment[] },
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
        source = json?.source === "cache" ? "cache" : "gemini";
      }

      for (const [verseKey, segments] of Object.entries(map)) {
        if (Array.isArray(segments) && segments.length > 0) {
          cache.set(verseKey, {
            ok: true,
            data: { verseKey, segments: segments as import("./types").WordSegment[] },
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

    const result: SegmentResult = {
      ok: true,
      data: { verseKey: key, segments: json.segments },
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
