import { emitGeminiToast } from "@/lib/gemini-toast";

export interface PhraseAlignment {
  phrase: string;
  arabicPositions: number[];
}

const memoryCache = new Map<string, PhraseAlignment[]>();
const inflightPromises = new Map<string, Promise<PhraseAlignment[] | null>>();
const pagePromises = new Map<number, Promise<Record<string, PhraseAlignment[]>>>();

type AlignmentListener = (alignments: Record<string, PhraseAlignment[]>) => void;
const listeners = new Set<AlignmentListener>();

export function subscribeAlignments(listener: AlignmentListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Fetch phrase-level alignment for a single Ayah between Arabic words and Malayalam translation.
 * Uses page-level bundle exclusively when pageNumber is provided to avoid individual Gemini calls.
 */
export async function fetchAyahAlignment(
  surahNumber: number,
  ayahNumber: number,
  pageNumber?: number,
  allowGemini: boolean = false
): Promise<PhraseAlignment[] | null> {
  const key = `${surahNumber}:${ayahNumber}`;
  if (memoryCache.has(key)) return memoryCache.get(key)!;

  // If pageNumber is provided, ALWAYS use page-level bundle and NEVER call Gemini per ayah!
  if (pageNumber) {
    const pageAlignments = await fetchPageAlignments(pageNumber, allowGemini);
    if (pageAlignments && pageAlignments[key]) {
      return pageAlignments[key];
    }
    if (memoryCache.has(key)) return memoryCache.get(key)!;
    return null;
  }

  if (!allowGemini) return null;

  if (inflightPromises.has(key)) {
    return inflightPromises.get(key)!;
  }

  const promise = (async () => {
    try {
      const geminiKey =
        typeof window !== "undefined"
          ? localStorage.getItem("gemini-api-key") || ""
          : "";
      const headers: Record<string, string> = {};
      if (geminiKey) headers["x-gemini-key"] = geminiKey;

      const res = await fetch(`/api/ar-ml-alignments/${surahNumber}/${ayahNumber}`, { headers });
      if (!res.ok) return null;

      const json = await res.json();
      if (Array.isArray(json.phrases) && json.phrases.length > 0) {
        memoryCache.set(key, json.phrases);
        return json.phrases;
      }
      return null;
    } catch {
      return null;
    } finally {
      inflightPromises.delete(key);
    }
  })();

  inflightPromises.set(key, promise);
  return promise;
}

/**
 * Loads phrase alignments for an entire page in one shot.
 * When allowGemini is false (default), only loads from cache/Supabase with 0 Gemini calls.
 * When allowGemini is true (during playback), bundles all missing ayahs into 1 Gemini call.
 */
export async function fetchPageAlignments(
  pageNumber: number,
  allowGemini: boolean = false
): Promise<Record<string, PhraseAlignment[]>> {
  const promiseKey = allowGemini ? pageNumber : -pageNumber;
  if (pagePromises.has(promiseKey)) {
    return pagePromises.get(promiseKey)!;
  }

  const promise = (async () => {
    try {
      const geminiKey =
        typeof window !== "undefined"
          ? localStorage.getItem("gemini-api-key") || ""
          : "";
      const headers: Record<string, string> = {
        Accept: "text/event-stream",
      };
      if (geminiKey) headers["x-gemini-key"] = geminiKey;

      const url = `/api/ar-ml-alignments/page/${pageNumber}?stream=true${allowGemini ? "" : "&cacheOnly=true"}`;
      const res = await fetch(url, { headers });
      if (!res.ok) return {};

      const contentType = res.headers.get("content-type") || "";
      let alignments: Record<string, PhraseAlignment[]> = {};

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

              if (data.type === "trying_model") {
                emitGeminiToast({
                  id: `align-${pageNumber}`,
                  title: `Page ${pageNumber} AI Align`,
                  status: "loading",
                  model: data.model,
                  message: data.message,
                });
              } else if (data.type === "model_failed") {
                emitGeminiToast({
                  id: `align-${pageNumber}`,
                  title: "Model Fallback",
                  status: "fallback",
                  model: data.nextModel || data.model,
                  message: data.message,
                });
              } else if (data.type === "model_success") {
                emitGeminiToast({
                  id: `align-${pageNumber}`,
                  title: "AI Success",
                  status: "success",
                  model: data.model,
                  message: data.message,
                });
              } else if (data.type === "error") {
                emitGeminiToast({
                  id: `align-${pageNumber}`,
                  title: "Gemini Error",
                  status: "error",
                  message: data.message,
                });
              } else if (data.type === "done") {
                if (data.alignments) {
                  alignments = data.alignments;
                }
                if (data.source === "gemini_batch") {
                  emitGeminiToast({
                    id: `align-${pageNumber}`,
                    title: `Page ${pageNumber} Synced`,
                    status: "success",
                    model: data.model,
                    message: `Saved all alignments to Supabase (${data.model})`,
                  });
                } else if (allowGemini && (data.source === "cache" || data.source === "partial_cache")) {
                  emitGeminiToast({
                    id: `align-${pageNumber}`,
                    title: `Page ${pageNumber} Ready`,
                    status: "success",
                    message: `Loaded alignments from Supabase cache`,
                  }, 2500);
                }
              }
            } catch {}
          }
        }
      } else {
        const json = await res.json();
        alignments = json.alignments || {};
      }

      for (const [vk, phrases] of Object.entries(alignments)) {
        if (Array.isArray(phrases) && phrases.length > 0) {
          const sanitized: PhraseAlignment[] = phrases.map((p) => ({
            phrase: typeof p?.phrase === "string" ? p.phrase : "",
            arabicPositions: Array.isArray(p?.arabicPositions)
              ? p.arabicPositions.map(Number).filter((n) => typeof n === "number" && !isNaN(n))
              : [],
          }));
          memoryCache.set(vk, sanitized);
          alignments[vk] = sanitized;
        }
      }
      if (Object.keys(alignments).length > 0) {
        for (const l of listeners) {
          try {
            l(alignments);
          } catch {}
        }
      }
      return alignments;
    } catch {
      return {};
    } finally {
      pagePromises.delete(promiseKey);
    }
  })();

  pagePromises.set(promiseKey, promise);
  return promise;
}
