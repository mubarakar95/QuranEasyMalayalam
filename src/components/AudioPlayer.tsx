"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Reciter, AyahInfo, HighlightWord, AudioMode, RepeatMode, AyahClause } from "@/lib/types";
import { getAudioUrl, getMalayalamAyahAudioUrl } from "@/lib/quran-api";
import { fetchChapterSegments, findWordAtTime, findWordsAtTime } from "@/lib/audio-segments";
import { fetchMalayalamSegments, fetchMalayalamPageSegments, clearSegmentCache, SegmentResult, extractAyahClauses, sanitizeClauses } from "@/lib/ml-audio-segments";
import { fetchPageAlignments } from "@/lib/ar-ml-alignments";

function getArabicClauseTimings(
  verseKey: string,
  wordIndices: number[],
  reciterSegments: import("@/lib/types").AyahSegments[],
  arabicAudioDurationSec: number,
  totalWordsInAyah: number
): { arStartMs: number; arEndMs: number } {
  if (wordIndices.length === 0) {
    return { arStartMs: 0, arEndMs: (arabicAudioDurationSec || 5) * 1000 };
  }

  const minWord = Math.min(...wordIndices);
  const maxWord = Math.max(...wordIndices);

  const ayahSegs = reciterSegments.find((s) => s.verseKey === verseKey);
  if (ayahSegs && ayahSegs.segments.length > 0) {
    const segMin = ayahSegs.segments.find(
      (s) => s.wordIndex === minWord || s.wordIndex === minWord + 1
    );
    const segMax = ayahSegs.segments
      .slice()
      .reverse()
      .find((s) => s.wordIndex === maxWord || s.wordIndex === maxWord + 1);

    if (segMin && segMax) {
      return {
        arStartMs: segMin.startMs,
        arEndMs: Math.max(segMax.endMs, segMin.startMs + 500),
      };
    }
  }

  // Fallback: Proportional calculation
  const totalW = Math.max(totalWordsInAyah, maxWord + 1, 1);
  const totalMs = (arabicAudioDurationSec > 0 ? arabicAudioDurationSec : 6) * 1000;
  const arStartMs = Math.round((minWord / totalW) * totalMs);
  const arEndMs = Math.round(((maxWord + 1) / totalW) * totalMs);

  return {
    arStartMs,
    arEndMs: Math.max(arEndMs, arStartMs + 500),
  };
}

let dbModule: typeof import("@/lib/db") | null = null;
async function getDb() {
  if (!dbModule) {
    try { dbModule = await import("@/lib/db"); } catch { return null; }
  }
  return dbModule;
}

async function getAudioSource(url: string, reciterId: string, surahNumber: number, ayahInSurah: number): Promise<string> {
  const db = await getDb();
  if (db) {
    const cached = await db.getAudioBlob(reciterId, surahNumber, ayahInSurah);
    if (cached) {
      return URL.createObjectURL(cached);
    }
  }
  return url;
}

interface AudioPlayerProps {
  ayahs: AyahInfo[];
  reciter: Reciter;
  onReciterChange: (reciter: Reciter) => void;
  onPageComplete?: () => void;
  onVerseChange?: (verseKey: string | null) => void;
  onWordHighlight?: (word: HighlightWord | null) => void;
  audioMode?: AudioMode;
  onAudioModeChange?: (mode: AudioMode) => void;
  highlightVerseKey?: string | null;
  compact?: boolean;
  pageLabel?: string;
  currentPage?: number;
  onGoNext?: () => void;
  onGoPrev?: () => void;
  canGoNext?: boolean;
  canGoPrev?: boolean;
  arabicPlaybackRate?: number;
  onArabicPlaybackRateChange?: (rate: number) => void;
  malayalamPlaybackRate?: number;
  onMalayalamPlaybackRateChange?: (rate: number) => void;
  playbackRate?: number;
  onPlaybackRateChange?: (rate: number) => void;
  repeatMode?: RepeatMode;
  onRepeatModeChange?: (mode: RepeatMode) => void;
  playRequest?: { verseKey: string; mode?: AudioMode; timestamp: number } | null;
}


const audioHandlers = new WeakMap<HTMLAudioElement, {
  handleEnded: () => void;
  handleError: () => void;
  handleTimeUpdate: () => void;
  handleLoadedMetadata: () => void;
  handlePlay: () => void;
}>();

const SPEEDS = [1, 1.25, 1.5, 2] as const;

const AUDIO_MODES: AudioMode[] = ["arabic", "malayalam", "both"];

const MODE_LABELS: Record<AudioMode, string> = {
  arabic: "Ar",
  malayalam: "Ml",
  both: "Ml+Ar",
};

function shortModeLabel(mode: AudioMode): string {
  return MODE_LABELS[mode];
}

export default function AudioPlayer({
  ayahs,
  reciter,
  onReciterChange,
  onPageComplete,
  onVerseChange,
  onWordHighlight,
  audioMode = "arabic",
  onAudioModeChange,
  highlightVerseKey,
  compact = false,
  pageLabel,
  currentPage,
  onGoNext,
  onGoPrev,
  canGoNext = true,
  canGoPrev = true,
  arabicPlaybackRate: arabicPlaybackRateProp,
  onArabicPlaybackRateChange,
  malayalamPlaybackRate: malayalamPlaybackRateProp,
  onMalayalamPlaybackRateChange,
  playbackRate: playbackRateProp,
  onPlaybackRateChange,
  repeatMode: repeatModeProp,
  onRepeatModeChange,
  playRequest,
}: AudioPlayerProps) {

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentAyahIndex, setCurrentAyahIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playingMalayalam, setPlayingMalayalam] = useState(false);
  const [repeatModeInternal, setRepeatModeInternal] = useState<RepeatMode>("none");
  const [playLoop, setPlayLoop] = useState(0);
  const [arabicPlaybackRateInternal, setArabicPlaybackRateInternal] = useState(1);
  const [malayalamPlaybackRateInternal, setMalayalamPlaybackRateInternal] = useState(1);
  const [currentClauseIndex, setCurrentClauseIndex] = useState(0);
  const [totalClauses, setTotalClauses] = useState(1);
  const [clausePhase, setClausePhase] = useState<"ml" | "ar">("ml");
  const [segmentedMode, setSegmentedMode] = useState(true);

  // Independent playback rates for Arabic recitation and Malayalam translation
  const arabicPlaybackRate = arabicPlaybackRateProp ?? playbackRateProp ?? arabicPlaybackRateInternal;
  const malayalamPlaybackRate = malayalamPlaybackRateProp ?? playbackRateProp ?? malayalamPlaybackRateInternal;
  const repeatMode = repeatModeProp ?? repeatModeInternal;

  const arabicPlaybackRateRef = useRef(arabicPlaybackRate);
  const malayalamPlaybackRateRef = useRef(malayalamPlaybackRate);

  const setArabicPlaybackRate = useCallback((updater: number | ((prev: number) => number)) => {
    setArabicPlaybackRateInternal((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      arabicPlaybackRateRef.current = next;
      onArabicPlaybackRateChange?.(next);
      onPlaybackRateChange?.(next);
      return next;
    });
  }, [onArabicPlaybackRateChange, onPlaybackRateChange]);

  const setMalayalamPlaybackRate = useCallback((updater: number | ((prev: number) => number)) => {
    setMalayalamPlaybackRateInternal((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      malayalamPlaybackRateRef.current = next;
      onMalayalamPlaybackRateChange?.(next);
      return next;
    });
  }, [onMalayalamPlaybackRateChange]);

  const setRepeatMode = useCallback((updater: RepeatMode | ((prev: RepeatMode) => RepeatMode)) => {
    setRepeatModeInternal((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      onRepeatModeChange?.(next);
      return next;
    });
  }, [onRepeatModeChange]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mlAudioRef = useRef<HTMLAudioElement | null>(null);
  const arAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentClauseIndexRef = useRef(0);
  const clausePhaseRef = useRef<"ml" | "ar">("ml");
  const clausesRef = useRef<AyahClause[]>([]);
  const segmentedModeRef = useRef(true);
  const targetArEndSecRef = useRef<number>(0);
  const transitionTimerRef = useRef<NodeJS.Timeout | null>(null);

  const onPageCompleteRef = useRef(onPageComplete);
  const onVerseChangeRef = useRef(onVerseChange);
  const onWordHighlightRef = useRef(onWordHighlight);
  const stoppedRef = useRef(false);
  const volumeRef = useRef(volume);
  const segmentsRef = useRef<Awaited<ReturnType<typeof fetchChapterSegments>>>([]);
  const mlSegmentsRef = useRef<import("@/lib/types").AyahSegments | null>(null);

  // Single status state for all ML segment feedback
  type MLStatus =
    | { state: "idle" }
    | { state: "loading" }
    | { state: "ready"; source?: "cache" | "gemini" }
    | { state: "error"; code?: "no_key" | "rate_limit" | "overloaded" | "auth" | "not_found" | "error"; message?: string };
  const [mlStatus, setMlStatus] = useState<MLStatus>({ state: "idle" });
  const [alignStatus, setAlignStatus] = useState<MLStatus>({ state: "idle" });

  // Track which ayah the status is for so retry knows what to clear
  const mlAyahRef = useRef<{ surah: number; ayah: number } | null>(null);

  const rafRef = useRef<number>(0);
  const currentWordIndexRef = useRef<number | null>(null);
  const currentWordKeyRef = useRef<string | null>(null);
  const isPlayingRef = useRef(isPlaying);
  const currentAyahIndexRef = useRef(currentAyahIndex);
  const ayahsRef = useRef(ayahs);
  const reciterRef = useRef(reciter);
  const audioModeRef = useRef(audioMode);
  const playingMalayalamRef = useRef(playingMalayalam);
  const repeatModeRef = useRef(repeatMode);
  const highlightVerseKeyRef = useRef(highlightVerseKey);

  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { arabicPlaybackRateRef.current = arabicPlaybackRate; }, [arabicPlaybackRate]);
  useEffect(() => { malayalamPlaybackRateRef.current = malayalamPlaybackRate; }, [malayalamPlaybackRate]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { currentAyahIndexRef.current = currentAyahIndex; }, [currentAyahIndex]);
  useEffect(() => { ayahsRef.current = ayahs; }, [ayahs]);
  useEffect(() => { reciterRef.current = reciter; }, [reciter]);
  useEffect(() => { audioModeRef.current = audioMode; }, [audioMode]);
  useEffect(() => { playingMalayalamRef.current = playingMalayalam; }, [playingMalayalam]);
  useEffect(() => { currentClauseIndexRef.current = currentClauseIndex; }, [currentClauseIndex]);
  useEffect(() => { clausePhaseRef.current = clausePhase; }, [clausePhase]);
  useEffect(() => { segmentedModeRef.current = segmentedMode; }, [segmentedMode]);
  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);
  useEffect(() => { highlightVerseKeyRef.current = highlightVerseKey; }, [highlightVerseKey]);
  useEffect(() => { onPageCompleteRef.current = onPageComplete; }, [onPageComplete]);
  useEffect(() => { onVerseChangeRef.current = onVerseChange; }, [onVerseChange]);
  useEffect(() => { onWordHighlightRef.current = onWordHighlight; }, [onWordHighlight]);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }
    if (ayahs.length === 0) return;
    const ayah = ayahs[currentAyahIndex];
    if (ayah) {
      onVerseChangeRef.current?.(`${ayah.surah.number}:${ayah.numberInSurah}`);
    }
  }, [currentAyahIndex, ayahs, isPlaying]);

  useEffect(() => {
    const shouldFetchSegments = audioMode === "arabic" || audioMode === "both";
    if (!shouldFetchSegments || !reciter.quranComId || ayahs.length === 0) {
      segmentsRef.current = [];
      return;
    }

    let cancelled = false;
    const surahNumbers = new Set(ayahs.map((a) => a.surah.number));

    Promise.all(
      [...surahNumbers].map((sn) => fetchChapterSegments(reciter.quranComId!, sn))
    )
      .then((results) => {
        if (!cancelled) {
          segmentsRef.current = results.flat();
        }
      })
      .catch(() => {
        if (!cancelled) {
          segmentsRef.current = [];
        }
      });

    return () => { cancelled = true; };
  }, [reciter.quranComId, ayahs, audioMode]);

  // Pre-load Malayalam word segments for the full page in one shot
  useEffect(() => {
    if (!currentPage) return;
    const shouldFetch = audioMode === "malayalam" || audioMode === "both";
    if (shouldFetch) {
      fetchMalayalamPageSegments(currentPage);
    }
  }, [currentPage, audioMode]);


  const trackWordFn = () => {
    const audio = audioRef.current;
    if (!audio || audio.paused) return;

    const ayah = ayahsRef.current[currentAyahIndexRef.current];
    if (!ayah) return;

    const mode = audioModeRef.current;
    const isMl = playingMalayalamRef.current || mode === "malayalam";
    const verseKey = `${ayah.surah.number}:${ayah.numberInSurah}`;
    const currentTimeMs = audio.currentTime * 1000;

    let wordIndex: number | null = null;
    let wordIndices: number[] | undefined = undefined;

    if (isMl) {
      const clauses = clausesRef.current;
      const cIdx = currentClauseIndexRef.current;
      if (mode === "both" && segmentedModeRef.current && clauses.length > 0 && clauses[cIdx]) {
        const c = clauses[cIdx];
        if (c.wordIndices && c.wordIndices.length > 0) {
          wordIndex = c.wordIndices[0];
          wordIndices = c.wordIndices;
        }
      } else {
        // Use Malayalam-specific segments from Gemini/Supabase
        const mlSeg = mlSegmentsRef.current;
        if (mlSeg) {
          const words = findWordsAtTime([mlSeg], verseKey, currentTimeMs);
          if (words.length > 0) {
            wordIndex = words[0];
            wordIndices = words;
          }
        }
      }
    } else {
      // Arabic reciter segments
      const words = findWordsAtTime(segmentsRef.current, verseKey, currentTimeMs);
      if (words.length > 0) {
        wordIndex = words[0];
        wordIndices = words;
      } else if (!reciterRef.current.quranComId || segmentsRef.current.length === 0) {
        // Proportional word timing fallback for reciters without Quran.com segments
        const wordsCount = ayah.text ? ayah.text.trim().split(/\s+/).length : 0;
        if (wordsCount > 0 && audio.duration > 0) {
          const wordDurMs = (audio.duration * 1000) / wordsCount;
          const idx = Math.min(wordsCount - 1, Math.max(0, Math.floor(currentTimeMs / wordDurMs)));
          wordIndex = idx;
          wordIndices = [idx];
        }
      }
    }

    const highlightKey = wordIndices && wordIndices.length > 0
      ? wordIndices.slice().sort((a, b) => a - b).join(",")
      : (wordIndex !== null ? String(wordIndex) : null);

    if (highlightKey !== currentWordKeyRef.current) {
      currentWordKeyRef.current = highlightKey;
      currentWordIndexRef.current = wordIndex;
      if (wordIndex !== null) {
        onWordHighlightRef.current?.({ verseKey, wordIndex, wordIndices, bundle: isMl });
      } else {
        // Clear highlight when between words
        onWordHighlightRef.current?.(null);
      }
    }

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(trackWordFn);
  };



  const cleanupAudio = useCallback((audio: HTMLAudioElement) => {
    audio.pause();
    const handlers = audioHandlers.get(audio);
    if (handlers) {
      audio.removeEventListener("ended", handlers.handleEnded);
      audio.removeEventListener("error", handlers.handleError);
      audio.removeEventListener("timeupdate", handlers.handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handlers.handleLoadedMetadata);
      audio.removeEventListener("play", handlers.handlePlay);
      audioHandlers.delete(audio);
    }
  }, []);

  const advanceToNextAyah = useCallback(() => {
    if (stoppedRef.current) return;
    cancelAnimationFrame(rafRef.current);
    onWordHighlightRef.current?.(null);
    currentWordIndexRef.current = null;
    currentWordKeyRef.current = null;

    const mode = audioModeRef.current;
    const repeat = repeatModeRef.current;
    const isLastAyah = currentAyahIndexRef.current >= ayahsRef.current.length - 1;

    if (repeat === "ayah") {
      setPlayingMalayalam(mode === "both");
      setPlayLoop((l) => l + 1);
      return;
    }

    if (isLastAyah) {
      if (repeat === "page") {
        setCurrentAyahIndex(0);
        setCurrentTime(0);
        setDuration(0);
        if (mode === "both") setPlayingMalayalam(true);
        onVerseChangeRef.current?.(null);
        return;
      }
      setIsPlaying(false);
      setCurrentAyahIndex(0);
      setCurrentTime(0);
      setDuration(0);
      setPlayingMalayalam(false);
      onPageCompleteRef.current?.();
      onVerseChangeRef.current?.(null);
    } else {
      setCurrentAyahIndex((prev) => prev + 1);
      if (mode === "both") {
        setPlayingMalayalam(true);
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        cleanupAudio(audioRef.current);
        audioRef.current = null;
      }
      if (mlAudioRef.current) {
        cleanupAudio(mlAudioRef.current);
        mlAudioRef.current = null;
      }
      if (arAudioRef.current) {
        cleanupAudio(arAudioRef.current);
        arAudioRef.current = null;
      }
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }
      cancelAnimationFrame(rafRef.current);
    };
  }, [cleanupAudio]);

  useEffect(() => {
    if (!isPlaying || ayahs.length === 0) return;
    if (currentAyahIndex >= ayahs.length) return;

    if (audioRef.current) {
      cleanupAudio(audioRef.current);
      audioRef.current = null;
    }
    if (mlAudioRef.current) {
      cleanupAudio(mlAudioRef.current);
      mlAudioRef.current = null;
    }
    if (arAudioRef.current) {
      cleanupAudio(arAudioRef.current);
      arAudioRef.current = null;
    }
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
    cancelAnimationFrame(rafRef.current);

    stoppedRef.current = false;
    const ayah = ayahs[currentAyahIndex];
    const verseKey = `${ayah.surah.number}:${ayah.numberInSurah}`;
    const mode = audioMode;

    if (mode === "both") {
      // ══════════════════════════════════════════════════════════════════════
      // DUAL AUDIO SEGMENTED PLAYBACK (ML CLAUSE -> AR CLAUSE -> NEXT CLAUSE)
      // ══════════════════════════════════════════════════════════════════════
      currentClauseIndexRef.current = 0;
      setCurrentClauseIndex(0);
      clausePhaseRef.current = "ml";
      setClausePhase("ml");
      setPlayingMalayalam(true);
      playingMalayalamRef.current = true;
      clausesRef.current = [];
      setTotalClauses(1);

      const mlAudio = new Audio();
      const arAudio = new Audio();
      mlAudio.volume = volumeRef.current;
      mlAudio.defaultPlaybackRate = malayalamPlaybackRateRef.current;
      mlAudio.playbackRate = malayalamPlaybackRateRef.current;

      arAudio.volume = volumeRef.current;
      arAudio.defaultPlaybackRate = arabicPlaybackRateRef.current;
      arAudio.playbackRate = arabicPlaybackRateRef.current;

      mlAudioRef.current = mlAudio;
      arAudioRef.current = arAudio;
      audioRef.current = mlAudio;

      let arObjectUrl: string | null = null;

      // 1. Setup Arab reciter audio preloading in background
      const arUrl = getAudioUrl(reciter, ayah.surah.number, ayah.numberInSurah, ayah.number);
      getAudioSource(arUrl, reciter.id, ayah.surah.number, ayah.numberInSurah).then((src) => {
        if (stoppedRef.current || arAudioRef.current !== arAudio) {
          if (src.startsWith("blob:")) URL.revokeObjectURL(src);
          return;
        }
        if (src.startsWith("blob:")) arObjectUrl = src;
        arAudio.src = src;
        arAudio.load();
      });

      // 2. Setup Malayalam audio
      const mlUrl = getMalayalamAyahAudioUrl(ayah.surah.number, ayah.numberInSurah);
      mlAudio.src = mlUrl;
      mlAudio.load();

      // Handlers to coordinate transitions between Malayalam translation and Arabic recitation
      function scheduleTransitionToAr(cIdx: number) {
        if (stoppedRef.current) return;
        if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
        mlAudio.pause();
        onWordHighlightRef.current?.(null);

        // Smooth pause (220ms) between Malayalam translation and Arabic recitation
        transitionTimerRef.current = setTimeout(() => {
          if (stoppedRef.current) return;
          playArabicClause(cIdx);
        }, 220);
      }

      function playArabicClause(cIdx: number) {
        if (stoppedRef.current) return;
        currentClauseIndexRef.current = cIdx;
        setCurrentClauseIndex(cIdx);
        clausePhaseRef.current = "ar";
        setClausePhase("ar");
        playingMalayalamRef.current = false;
        setPlayingMalayalam(false);
        audioRef.current = arAudio;

        const clauses = clausesRef.current;
        const clause = clauses[cIdx];
        const isLastClause = clauses.length <= 1 || cIdx >= clauses.length - 1;

        let startSec = 0;
        let endSec = arAudio.duration || 999999;

        if (segmentedModeRef.current && clauses.length > 1 && clause) {
          const totalWords = ayah.text ? ayah.text.trim().split(/\s+/).length : 0;
          const timings = getArabicClauseTimings(
            verseKey,
            clause.wordIndices,
            segmentsRef.current,
            arAudio.duration,
            totalWords
          );
          startSec = timings.arStartMs / 1000;
          endSec = isLastClause && arAudio.duration > 0
            ? arAudio.duration
            : timings.arEndMs / 1000;
        }

        targetArEndSecRef.current = endSec;

        try {
          arAudio.currentTime = Math.max(0, startSec);
        } catch {}

        setDuration(arAudio.duration || endSec);
        setCurrentTime(startSec);

        arAudio.defaultPlaybackRate = arabicPlaybackRateRef.current;
        arAudio.playbackRate = arabicPlaybackRateRef.current;
        arAudio.play().then(() => {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = requestAnimationFrame(trackWordFn);
        }).catch(() => {});
      }

      function scheduleTransitionToNextClause(cIdx: number) {
        if (stoppedRef.current) return;
        if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
        arAudio.pause();
        onWordHighlightRef.current?.(null);

        const nextIdx = cIdx + 1;
        const clauses = clausesRef.current;

        if (nextIdx >= clauses.length) {
          // Completed all clauses for this ayah! Advance to next ayah!
          advanceToNextAyah();
          return;
        }

        // Smooth pause (250ms) before starting next Malayalam clause
        transitionTimerRef.current = setTimeout(() => {
          if (stoppedRef.current) return;
          playMalayalamClause(nextIdx);
        }, 250);
      }

      function playMalayalamClause(cIdx: number) {
        if (stoppedRef.current) return;
        currentClauseIndexRef.current = cIdx;
        setCurrentClauseIndex(cIdx);
        clausePhaseRef.current = "ml";
        setClausePhase("ml");
        playingMalayalamRef.current = true;
        setPlayingMalayalam(true);
        audioRef.current = mlAudio;

        const clauses = clausesRef.current;
        const clause = clauses[cIdx];
        let startSec = 0;
        if (segmentedModeRef.current && clauses.length > 1 && clause) {
          if (cIdx > 0 && clauses[cIdx - 1]) {
            const minStartSec = (clauses[cIdx - 1].endMs || 0) / 1000;
            startSec = Math.max((clause.startMs || 0) / 1000, minStartSec);
          } else {
            startSec = (clause.startMs || 0) / 1000;
          }
        }

        try {
          mlAudio.currentTime = Math.max(0, startSec);
        } catch {}

        setDuration(mlAudio.duration || 0);
        setCurrentTime(startSec);

        // Immediately highlight the clause bundle on Mushaf
        trackWordFn();

        mlAudio.defaultPlaybackRate = malayalamPlaybackRateRef.current;
        mlAudio.playbackRate = malayalamPlaybackRateRef.current;
        mlAudio.play().then(() => {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = requestAnimationFrame(trackWordFn);
        }).catch(() => {});
      }

      // Wire ML audio event listeners
      const handleMlLoadedMetadata = () => {
        if (audioRef.current === mlAudio) {
          setDuration(mlAudio.duration);
        }
        mlAudio.defaultPlaybackRate = malayalamPlaybackRateRef.current;
        mlAudio.playbackRate = malayalamPlaybackRateRef.current;
      };

      const handleMlTimeUpdate = () => {
        if (audioRef.current === mlAudio) {
          setCurrentTime(mlAudio.currentTime);
        }
        trackWordFn();

        if (stoppedRef.current) return;
        const clauses = clausesRef.current;
        const cIdx = currentClauseIndexRef.current;

        if (segmentedModeRef.current && clauses.length > 1 && cIdx < clauses.length) {
          const isLastClause = cIdx === clauses.length - 1;
          const targetEndSec = isLastClause
            ? (mlAudio.duration > 0 ? mlAudio.duration : clauses[cIdx].endMs / 1000)
            : (clauses[cIdx].endMs / 1000);

          if (mlAudio.currentTime >= targetEndSec - 0.08) {
            mlAudio.pause();
            scheduleTransitionToAr(cIdx);
          }
        }
      };

      const handleMlEnded = () => {
        if (stoppedRef.current) return;
        scheduleTransitionToAr(currentClauseIndexRef.current);
      };

      const handleMlError = () => {
        if (stoppedRef.current) return;
        // Fallback to playing Arabic if Malayalam audio fails
        scheduleTransitionToAr(0);
      };

      const handleMlPlay = () => {
        mlAudio.defaultPlaybackRate = malayalamPlaybackRateRef.current;
        mlAudio.playbackRate = malayalamPlaybackRateRef.current;
      };

      audioHandlers.set(mlAudio, {
        handleEnded: handleMlEnded,
        handleError: handleMlError,
        handleTimeUpdate: handleMlTimeUpdate,
        handleLoadedMetadata: handleMlLoadedMetadata,
        handlePlay: handleMlPlay,
      });

      mlAudio.addEventListener("ended", handleMlEnded);
      mlAudio.addEventListener("error", handleMlError);
      mlAudio.addEventListener("timeupdate", handleMlTimeUpdate);
      mlAudio.addEventListener("loadedmetadata", handleMlLoadedMetadata);
      mlAudio.addEventListener("play", handleMlPlay);

      // Wire AR audio event listeners
      const handleArLoadedMetadata = () => {
        if (audioRef.current === arAudio) {
          setDuration(arAudio.duration);
        }
        arAudio.defaultPlaybackRate = arabicPlaybackRateRef.current;
        arAudio.playbackRate = arabicPlaybackRateRef.current;
      };

      const handleArTimeUpdate = () => {
        if (audioRef.current === arAudio) {
          setCurrentTime(arAudio.currentTime);
        }
        trackWordFn();

        if (stoppedRef.current) return;
        const clauses = clausesRef.current;
        const cIdx = currentClauseIndexRef.current;

        if (segmentedModeRef.current && clauses.length > 1 && cIdx < clauses.length) {
          const isLastClause = cIdx === clauses.length - 1;
          const targetEndSec = targetArEndSecRef.current;

          if (!isLastClause && targetEndSec > 0 && arAudio.currentTime >= targetEndSec - 0.08) {
            arAudio.pause();
            scheduleTransitionToNextClause(cIdx);
          }
        }
      };

      const handleArEnded = () => {
        if (stoppedRef.current) return;
        const clauses = clausesRef.current;
        const cIdx = currentClauseIndexRef.current;
        const isLastClause = clauses.length <= 1 || cIdx >= clauses.length - 1;

        if (isLastClause) {
          advanceToNextAyah();
        } else {
          scheduleTransitionToNextClause(cIdx);
        }
      };

      const handleArError = () => {
        if (stoppedRef.current) return;
        advanceToNextAyah();
      };

      const handleArPlay = () => {
        arAudio.defaultPlaybackRate = arabicPlaybackRateRef.current;
        arAudio.playbackRate = arabicPlaybackRateRef.current;
      };

      audioHandlers.set(arAudio, {
        handleEnded: handleArEnded,
        handleError: handleArError,
        handleTimeUpdate: handleArTimeUpdate,
        handleLoadedMetadata: handleArLoadedMetadata,
        handlePlay: handleArPlay,
      });

      arAudio.addEventListener("ended", handleArEnded);
      arAudio.addEventListener("error", handleArError);
      arAudio.addEventListener("timeupdate", handleArTimeUpdate);
      arAudio.addEventListener("loadedmetadata", handleArLoadedMetadata);
      arAudio.addEventListener("play", handleArPlay);

      // Start fetching ML word segments & clauses
      mlSegmentsRef.current = null;
      mlAyahRef.current = { surah: ayah.surah.number, ayah: ayah.numberInSurah };
      setMlStatus({ state: "loading" });

      fetchMalayalamSegments(ayah.surah.number, ayah.numberInSurah, currentPage).then((result) => {
        if (stoppedRef.current) return;
        if (result.ok) {
          mlSegmentsRef.current = result.data;
          const extractedClauses = (result.data.clauses && result.data.clauses.length > 0)
            ? result.data.clauses
            : extractAyahClauses(verseKey, result.data.segments, ayah.text);
          const sanitized = sanitizeClauses(extractedClauses, (mlAudio.duration || 0) * 1000);
          clausesRef.current = sanitized;
          setTotalClauses(sanitized.length);
          setMlStatus({ state: "ready", source: result.source });
          trackWordFn();
        } else {
          setMlStatus({ state: "error", code: result.code, message: result.message });
        }
      });

      // Start playing Malayalam clause 0
      playMalayalamClause(0);

      return () => {
        stoppedRef.current = true;
        if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
        if (arObjectUrl) URL.revokeObjectURL(arObjectUrl);
        cleanupAudio(mlAudio);
        cleanupAudio(arAudio);
        cancelAnimationFrame(rafRef.current);
        if (mlAudioRef.current === mlAudio) mlAudioRef.current = null;
        if (arAudioRef.current === arAudio) arAudioRef.current = null;
        if (audioRef.current === mlAudio || audioRef.current === arAudio) {
          audioRef.current = null;
        }
      };
    }

    // ══════════════════════════════════════════════════════════════════════
    // SINGLE AUDIO PLAYBACK (ARABIC ONLY OR MALAYALAM ONLY)
    // ══════════════════════════════════════════════════════════════════════
    let url: string;
    if (mode === "malayalam") {
      url = getMalayalamAyahAudioUrl(ayah.surah.number, ayah.numberInSurah);
    } else {
      url = getAudioUrl(reciter, ayah.surah.number, ayah.numberInSurah, ayah.number);
    }

    const isOfflineCheck = mode === "malayalam";
    const audioSourcePromise = isOfflineCheck
      ? Promise.resolve(url)
      : getAudioSource(url, reciter.id, ayah.surah.number, ayah.numberInSurah);

    if (mode === "malayalam") {
      mlSegmentsRef.current = null;
      mlAyahRef.current = { surah: ayah.surah.number, ayah: ayah.numberInSurah };
      setMlStatus({ state: "loading" });
      fetchMalayalamSegments(ayah.surah.number, ayah.numberInSurah, currentPage).then((result) => {
        if (stoppedRef.current) return;
        if (result.ok) {
          mlSegmentsRef.current = result.data;
          setMlStatus({ state: "ready", source: result.source });
          trackWordFn();
        } else {
          setMlStatus({ state: "error", code: result.code, message: result.message });
        }
      });
    } else {
      setMlStatus({ state: "idle" });
    }

    if (mode === "arabic" && currentPage) {
      setAlignStatus({ state: "loading" });
      fetchPageAlignments(currentPage, true)
        .then((res) => {
          if (stoppedRef.current) return;
          if (res && Object.keys(res).length > 0) {
            setAlignStatus({ state: "ready", source: "cache" });
          } else {
            setAlignStatus({ state: "idle" });
          }
        })
        .catch(() => {
          if (!stoppedRef.current) {
            setAlignStatus({ state: "idle" });
          }
        });
    } else {
      setAlignStatus({ state: "idle" });
    }

    let objectUrl: string | null = null;
    const initialRate = mode === "malayalam" ? malayalamPlaybackRateRef.current : arabicPlaybackRateRef.current;
    const audio = new Audio();
    audio.volume = volumeRef.current;
    audio.defaultPlaybackRate = initialRate;
    audio.playbackRate = initialRate;
    audioRef.current = audio;

    const handleEnded = () => {
      advanceToNextAyah();
    };

    const handleError = () => {
      cancelAnimationFrame(rafRef.current);
      setIsPlaying(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      trackWordFn();
    };

    const handleLoadedMetadata = () => {
      const currentModeRate = audioModeRef.current === "malayalam" ? malayalamPlaybackRateRef.current : arabicPlaybackRateRef.current;
      setDuration(audio.duration);
      audio.defaultPlaybackRate = currentModeRate;
      audio.playbackRate = currentModeRate;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(trackWordFn);
    };

    const handlePlay = () => {
      const currentModeRate = audioModeRef.current === "malayalam" ? malayalamPlaybackRateRef.current : arabicPlaybackRateRef.current;
      audio.defaultPlaybackRate = currentModeRate;
      audio.playbackRate = currentModeRate;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(trackWordFn);
    };

    audioHandlers.set(audio, { handleEnded, handleError, handleTimeUpdate, handleLoadedMetadata, handlePlay });

    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("play", handlePlay);

    audioSourcePromise.then((src) => {
      if (stoppedRef.current || audioRef.current !== audio) {
        if (src.startsWith("blob:")) URL.revokeObjectURL(src);
        return;
      }
      const currentModeRate = audioModeRef.current === "malayalam" ? malayalamPlaybackRateRef.current : arabicPlaybackRateRef.current;
      if (src.startsWith("blob:")) objectUrl = src;
      audio.src = src;
      audio.load();
      audio.defaultPlaybackRate = currentModeRate;
      audio.playbackRate = currentModeRate;
      audio.play().then(() => {
        audio.defaultPlaybackRate = currentModeRate;
        audio.playbackRate = currentModeRate;
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(trackWordFn);
      }).catch(() => {
        if (audioRef.current === audio) {
          setIsPlaying(false);
        }
      });
    });

    return () => {
      stoppedRef.current = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      cleanupAudio(audio);
      cancelAnimationFrame(rafRef.current);
      if (audioRef.current === audio) {
        audioRef.current = null;
      }
    };
  }, [isPlaying, currentAyahIndex, ayahs, reciter.id, audioMode, playLoop, segmentedMode, cleanupAudio, advanceToNextAyah]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    if (arAudioRef.current) {
      arAudioRef.current.defaultPlaybackRate = arabicPlaybackRate;
      arAudioRef.current.playbackRate = arabicPlaybackRate;
    }
    if (audioRef.current && (audioMode === "arabic" || (audioMode === "both" && !playingMalayalam))) {
      audioRef.current.defaultPlaybackRate = arabicPlaybackRate;
      audioRef.current.playbackRate = arabicPlaybackRate;
    }
  }, [arabicPlaybackRate, audioMode, playingMalayalam]);

  useEffect(() => {
    if (mlAudioRef.current) {
      mlAudioRef.current.defaultPlaybackRate = malayalamPlaybackRate;
      mlAudioRef.current.playbackRate = malayalamPlaybackRate;
    }
    if (audioRef.current && (audioMode === "malayalam" || (audioMode === "both" && playingMalayalam))) {
      audioRef.current.defaultPlaybackRate = malayalamPlaybackRate;
      audioRef.current.playbackRate = malayalamPlaybackRate;
    }
  }, [malayalamPlaybackRate, audioMode, playingMalayalam]);

  const prevPlayRequestRef = useRef<number | null>(null);
  useEffect(() => {
    if (!playRequest || playRequest.timestamp === prevPlayRequestRef.current) return;
    prevPlayRequestRef.current = playRequest.timestamp;

    const targetIdx = ayahs.findIndex(
      (a) => `${a.surah.number}:${a.numberInSurah}` === playRequest.verseKey
    );
    if (targetIdx !== -1) {
      if (playRequest.mode) {
        onAudioModeChange?.(playRequest.mode);
      }
      const targetMode = playRequest.mode ?? audioMode;
      if (targetMode === "malayalam" || targetMode === "both") {
        setPlayingMalayalam(true);
      } else {
        setPlayingMalayalam(false);
      }
      setCurrentAyahIndex(targetIdx);
      setIsPlaying(true);
      setPlayLoop((l) => l + 1);
    }
  }, [playRequest, ayahs, audioMode, onAudioModeChange]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isPlaying) return;
    let rafId: number;
    const tick = () => {
      if (audio && !audio.paused) {
        setCurrentTime(audio.currentTime);
        rafId = requestAnimationFrame(tick);
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying]);

  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => {
      if (!prev) {
        const hk = highlightVerseKeyRef.current;
        if (hk) {
          const idx = ayahsRef.current.findIndex(
            (a) => `${a.surah.number}:${a.numberInSurah}` === hk
          );
          if (idx !== -1) setCurrentAyahIndex(idx);
        }
        if (audioModeRef.current === "both") {
          if (audioRef.current && audioRef.current.src) {
            audioRef.current.play().catch(() => {});
            cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(trackWordFn);
            return true;
          }
          setPlayingMalayalam(true);
        }
        return true;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        cancelAnimationFrame(rafRef.current);
      }
      if (mlAudioRef.current) mlAudioRef.current.pause();
      if (arAudioRef.current) arAudioRef.current.pause();
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
      return false;
    });
  }, []);

  const stop = useCallback(() => {
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    if (mlAudioRef.current) {
      cleanupAudio(mlAudioRef.current);
      mlAudioRef.current = null;
    }
    if (arAudioRef.current) {
      cleanupAudio(arAudioRef.current);
      arAudioRef.current = null;
    }
    if (audioRef.current) {
      cleanupAudio(audioRef.current);
      audioRef.current = null;
    }
    cancelAnimationFrame(rafRef.current);
    setIsPlaying(false);
    setCurrentAyahIndex(0);
    setCurrentTime(0);
    setDuration(0);
    setPlayingMalayalam(false);
    setPlayLoop(0);
    currentClauseIndexRef.current = 0;
    setCurrentClauseIndex(0);
    setTotalClauses(1);
    currentWordIndexRef.current = null;
    currentWordKeyRef.current = null;
    onWordHighlightRef.current?.(null);
  }, [cleanupAudio]);

  const skipAyah = useCallback(
    (direction: 1 | -1) => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
      setPlayingMalayalam(audioModeRef.current === "both");
      setPlayLoop(0);
      currentClauseIndexRef.current = 0;
      setCurrentClauseIndex(0);
      setCurrentAyahIndex((prev) => {
        const next = prev + direction;
        if (next < 0 || next >= ayahsRef.current.length) return prev;
        return next;
      });
    },
    []
  );

  const handleModeNavigation = useCallback((direction: 1 | -1, mode: AudioMode) => {
    if (ayahsRef.current.length === 0) return;
    if (audioModeRef.current !== mode) {
      onAudioModeChange?.(mode);
    }
    setPlayingMalayalam(mode === "both");
    setPlayLoop(0);
    setCurrentAyahIndex((prev) => {
      const next = prev + direction;
      if (next < 0 || next >= ayahsRef.current.length) return prev;
      return next;
    });
    setIsPlaying(true);
  }, [onAudioModeChange]);

  const handleSwitchMode = useCallback(() => {
    if (ayahsRef.current.length === 0) return;
    const current = audioModeRef.current;
    if (current === "arabic") {
      onAudioModeChange?.("malayalam");
      setPlayingMalayalam(false);
    } else {
      onAudioModeChange?.("arabic");
      setPlayingMalayalam(false);
    }
    setPlayLoop(0);
    setIsPlaying(true);
  }, [onAudioModeChange]);

  const cycleArabicSpeed = useCallback(() => {
    const currentRate = arabicPlaybackRateRef.current;
    const idx = SPEEDS.indexOf(currentRate as (typeof SPEEDS)[number]);
    const nextRate = SPEEDS[(idx + 1) % SPEEDS.length];
    setArabicPlaybackRate(nextRate);
  }, [setArabicPlaybackRate]);

  const cycleMalayalamSpeed = useCallback(() => {
    const currentRate = malayalamPlaybackRateRef.current;
    const idx = SPEEDS.indexOf(currentRate as (typeof SPEEDS)[number]);
    const nextRate = SPEEDS[(idx + 1) % SPEEDS.length];
    setMalayalamPlaybackRate(nextRate);
  }, [setMalayalamPlaybackRate]);

  const cycleActiveSpeed = useCallback(() => {
    if (audioModeRef.current === "arabic") {
      cycleArabicSpeed();
    } else if (audioModeRef.current === "malayalam") {
      cycleMalayalamSpeed();
    } else {
      // dual mode ("both")
      if (clausePhaseRef.current === "ar" || (!playingMalayalamRef.current && isPlayingRef.current)) {
        cycleArabicSpeed();
      } else {
        cycleMalayalamSpeed();
      }
    }
  }, [cycleArabicSpeed, cycleMalayalamSpeed]);

  const cycleRepeatMode = useCallback(() => {
    setRepeatMode((r) => r === "none" ? "ayah" : r === "ayah" ? "page" : "none");
  }, [setRepeatMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        handleModeNavigation(-1, "malayalam");
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        handleModeNavigation(1, "malayalam");
        return;
      }

      switch (e.key.toLowerCase()) {
        case "w":
          e.preventDefault();
          handleModeNavigation(-1, "arabic");
          break;
        case "s":
          e.preventDefault();
          handleModeNavigation(1, "arabic");
          break;
        case "e":
          e.preventDefault();
          handleSwitchMode();
          break;
        case "r":
          e.preventDefault();
          cycleRepeatMode();
          break;
        case "p":
          e.preventDefault();
          if (e.shiftKey && audioModeRef.current === "both") {
            if (clausePhaseRef.current === "ar" || (!playingMalayalamRef.current && isPlayingRef.current)) {
              cycleMalayalamSpeed();
            } else {
              cycleArabicSpeed();
            }
          } else {
            cycleActiveSpeed();
          }
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleModeNavigation, handleSwitchMode, togglePlay, cycleRepeatMode, cycleActiveSpeed, cycleArabicSpeed, cycleMalayalamSpeed]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
    setCurrentTime(time);
  };

  const formatTime = (t: number) => {
    if (!isFinite(t)) return "0:00";
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="audio-player">
      <div className="flex items-center gap-2">
        <span className="text-[10px] tabular-nums text-[var(--muted)] min-w-[2.5rem] text-right">{formatTime(currentTime)}</span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.01}
          value={currentTime}
          onChange={handleSeek}
          className="seek-bar"
          style={{ '--seek-value': `${progressPercent}%` } as React.CSSProperties}
          aria-label="Seek"
        />
        <span className="text-[10px] tabular-nums text-[var(--muted)] min-w-[2.5rem]">{formatTime(duration)}</span>
      </div>

      {/* ── ML error message strip — always visible when something goes wrong ── */}
      {mlStatus.state === "error" && (audioMode === "malayalam" || audioMode === "both") && (
        <div className="flex items-center gap-2 px-1 py-1 mt-0.5 rounded bg-red-50 border border-red-200 text-red-600" style={{ fontSize: "10px" }}>
          <span className="shrink-0">
            {mlStatus.code === "rate_limit" ? "⏳" :
             mlStatus.code === "overloaded" ? "⚠️" :
             mlStatus.code === "no_key" || mlStatus.code === "auth" ? "🔑" : "✗"}
          </span>
          <span className="flex-1 leading-tight">{mlStatus.message}</span>
          {mlStatus.code !== "no_key" && (
            <button
              onClick={() => {
                const ayah = ayahsRef.current[currentAyahIndexRef.current];
                if (!ayah) return;
                clearSegmentCache(ayah.surah.number, ayah.numberInSurah, currentPage);
                setMlStatus({ state: "loading" });
                fetchMalayalamSegments(ayah.surah.number, ayah.numberInSurah, currentPage).then((result) => {
                  if (result.ok) {
                    mlSegmentsRef.current = result.data;
                    setMlStatus({ state: "ready", source: result.source });
                    trackWordFn();
                  } else {
                    setMlStatus({ state: "error", code: result.code, message: result.message });
                  }
                });
              }}
              className="shrink-0 px-2 py-0.5 rounded border border-red-300 hover:bg-red-100 transition-colors font-medium text-[11px]"
            >
              Retry
            </button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between" style={compact ? { marginTop: '0.125rem' } : { marginTop: '0.375rem' }}>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              const idx = AUDIO_MODES.indexOf(audioMode);
              const next = AUDIO_MODES[(idx + 1) % AUDIO_MODES.length];
              onAudioModeChange?.(next);
              setPlayLoop(0);
              setPlayingMalayalam(next === "both");
              currentClauseIndexRef.current = 0;
              setCurrentClauseIndex(0);
              if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
              if (mlAudioRef.current) {
                cleanupAudio(mlAudioRef.current);
                mlAudioRef.current = null;
              }
              if (arAudioRef.current) {
                cleanupAudio(arAudioRef.current);
                arAudioRef.current = null;
              }
              if (audioRef.current) {
                cleanupAudio(audioRef.current);
                audioRef.current = null;
              }
              cancelAnimationFrame(rafRef.current);
              currentWordIndexRef.current = null;
              currentWordKeyRef.current = null;
              onWordHighlightRef.current?.(null);
              if (isPlaying) {
                setCurrentTime(0);
                setDuration(0);
              }
            }}
            className="px-2 py-1 rounded text-[11px] font-medium tabular-nums bg-[var(--surface)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--foreground)] transition-colors"
            aria-label="Audio mode"
          >
            {shortModeLabel(audioMode)}
          </button>

          {/* ── Segmented Mode toggle for Both (Ml+Ar) mode ── */}
          {audioMode === "both" && (
            <button
              onClick={() => setSegmentedMode((prev) => !prev)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                segmentedMode
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                  : "bg-[var(--surface)] text-[var(--muted)] border border-[var(--border)]"
              }`}
              title={
                segmentedMode
                  ? `Segmented Mode Active: Ayah is split into ${totalClauses > 1 ? `${totalClauses} meaning parts` : "meaning parts"} (Malayalam then Arabic for each part). Click to switch to Full Ayah mode.`
                  : "Full Ayah Mode Active: Full Malayalam followed by full Arabic. Click to switch to Segmented mode."
              }
              aria-label="Toggle segmented audio playback"
            >
              {segmentedMode ? (
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>{totalClauses > 1 ? `Part ${currentClauseIndex + 1}/${totalClauses}` : "Clauses"}</span>
                </span>
              ) : (
                <span>Full</span>
              )}
            </button>
          )}


          {/* ── Arabic translation alignment status indicator ───────────────────────── */}
          {audioMode === "arabic" && alignStatus.state !== "idle" && (
            <>
              {alignStatus.state === "loading" && (
                <span className="flex items-center gap-1 shrink-0" title="Aligning translation for Arabic playback…">
                  <span className="w-2.5 h-2.5 border border-amber-400 border-t-transparent rounded-full animate-spin" />
                </span>
              )}
              {alignStatus.state === "ready" && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" title="Translation alignments ready" />
              )}
            </>
          )}

          {/* ── ML word-highlight status indicator ───────────────────────── */}
          {(audioMode === "malayalam" || audioMode === "both") && mlStatus.state !== "idle" && (
            <>
              {mlStatus.state === "loading" && (
                <span className="flex items-center gap-1 shrink-0" title="Analysing audio for word timing…">
                  <span className="w-2.5 h-2.5 border border-amber-400 border-t-transparent rounded-full animate-spin" />
                </span>
              )}
              {mlStatus.state === "ready" && mlStatus.source === "cache" && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" title="Word timing loaded from cache" />
              )}
              {mlStatus.state === "ready" && mlStatus.source === "gemini" && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" title="Word timing generated by Gemini ✨" />
              )}
            </>
          )}


          <button onClick={() => skipAyah(-1)} disabled={currentAyahIndex === 0} className="player-btn" aria-label="Previous ayah">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 16.811c0 .864-.933 1.406-1.683.947l-7.108-4.061a1.125 1.125 0 0 1 0-1.95l7.108-4.061A1.125 1.125 0 0 1 21 8.689v8.122ZM11.25 16.811c0 .864-.933 1.406-1.683.947l-7.108-4.061a1.125 1.125 0 0 1 0-1.95l7.108-4.061a1.125 1.125 0 0 1 1.683.947v8.122Z" />
            </svg>
          </button>

          <button onClick={togglePlay} className="player-btn-play" aria-label={isPlaying ? "Pause" : "Play"}>
            {isPlaying ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={compact ? "w-4 h-4" : "w-5 h-5"}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={compact ? "w-4 h-4" : "w-5 h-5"}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
              </svg>
            )}
          </button>

          <button onClick={() => skipAyah(1)} disabled={currentAyahIndex >= ayahs.length - 1} className="player-btn" aria-label="Next ayah">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.189c0-.864.933-1.406 1.683-.947l7.108 4.061a1.125 1.125 0 0 1 0 1.95l-7.108 4.061A1.125 1.125 0 0 1 3 16.311V7.189ZM12.75 7.189c0-.864.933-1.406 1.683-.947l7.108 4.061a1.125 1.125 0 0 1 0 1.95l-7.108 4.061a1.125 1.125 0 0 1-1.683-.986V7.189Z" />
            </svg>
          </button>

          <button onClick={stop} className="player-btn" aria-label="Stop">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={compact ? "w-3 h-3" : "w-3.5 h-3.5"}>
              <path fillRule="evenodd" d="M4.5 7.5a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3v-9Z" clipRule="evenodd" />
            </svg>
          </button>

          <button
            onClick={() => setRepeatMode((r) => r === "none" ? "ayah" : r === "ayah" ? "page" : "none")}
            className={`player-btn relative ${repeatMode !== "none" ? "bg-[var(--foreground)] text-[var(--background)] rounded-sm" : ""}`}
            aria-label={`Repeat: ${repeatMode === "none" ? "off" : repeatMode === "ayah" ? "ayah" : "page"}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={compact ? "w-3 h-3" : "w-3.5 h-3.5"}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3" />
            </svg>
            {repeatMode === "ayah" && (
              <span className="absolute -top-0.5 -right-0.5 text-[7px] font-bold leading-none">1</span>
            )}
            {repeatMode === "page" && (
              <span className="absolute -top-0.5 -right-0.5 text-[7px] font-bold leading-none">↺</span>
            )}
          </button>

          <div className="flex items-center gap-1" style={compact ? { paddingLeft: '0.25rem', borderLeft: '1px solid var(--border)' } : { paddingLeft: '0.5rem', borderLeft: '1px solid var(--border)' }}>
            {audioMode === "both" ? (
              <>
                <button
                  onClick={cycleArabicSpeed}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium tabular-nums border transition-colors cursor-pointer ${
                    clausePhase === "ar" && isPlaying
                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40"
                      : "bg-[var(--surface)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--foreground)]"
                  }`}
                  title={`Arabic voice speed: ${arabicPlaybackRate}x (Click to cycle, or press P while Arabic is active)`}
                  aria-label={`Arabic speed: ${arabicPlaybackRate}x`}
                >
                  Ar {arabicPlaybackRate}x
                </button>
                <button
                  onClick={cycleMalayalamSpeed}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium tabular-nums border transition-colors cursor-pointer ${
                    clausePhase === "ml" && isPlaying
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40"
                      : "bg-[var(--surface)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--foreground)]"
                  }`}
                  title={`Malayalam translation speed: ${malayalamPlaybackRate}x (Click to cycle, or press P while Malayalam is active)`}
                  aria-label={`Malayalam speed: ${malayalamPlaybackRate}x`}
                >
                  Ml {malayalamPlaybackRate}x
                </button>
              </>
            ) : audioMode === "malayalam" ? (
              <button
                onClick={cycleMalayalamSpeed}
                className="px-1.5 py-0.5 rounded text-[10px] font-medium tabular-nums bg-[var(--surface)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--foreground)] transition-colors cursor-pointer"
                title={`Malayalam translation speed: ${malayalamPlaybackRate}x (Click to cycle, or press P)`}
                aria-label={`Malayalam speed: ${malayalamPlaybackRate}x`}
              >
                Ml {malayalamPlaybackRate}x
              </button>
            ) : (
              <button
                onClick={cycleArabicSpeed}
                className="px-1.5 py-0.5 rounded text-[10px] font-medium tabular-nums bg-[var(--surface)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--foreground)] transition-colors cursor-pointer"
                title={`Arabic voice speed: ${arabicPlaybackRate}x (Click to cycle, or press P)`}
                aria-label={`Arabic speed: ${arabicPlaybackRate}x`}
              >
                Ar {arabicPlaybackRate}x
              </button>
            )}
          </div>
        </div>

        {compact && (
          <div className="player-page-nav">
            <button onClick={onGoNext} disabled={!canGoNext} aria-label="Next page">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
            <span className="tabular-nums whitespace-nowrap">{pageLabel}</span>
            <button onClick={onGoPrev} disabled={!canGoPrev} aria-label="Previous page">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
        )}

        {!compact && (
          <span className="text-[10px] text-[var(--muted)] tabular-nums">
            {isPlaying ? (
              <>
                {currentAyahIndex + 1} / {ayahs.length}
                {audioMode === "both" && (
                  <span className="ml-1 text-[9px]">
                    {segmentedMode && totalClauses > 1 ? (
                      <span className="font-medium text-emerald-600 dark:text-emerald-400">
                        [{currentClauseIndex + 1}/{totalClauses} {clausePhase === "ml" ? "മലയാളം" : "Arabic"}]
                      </span>
                    ) : (
                      <span>{playingMalayalam ? "(മലയാളം)" : "(Arabic)"}</span>
                    )}
                  </span>
                )}
              </>
            ) : (
              <span className="font-medium">{shortModeLabel(audioMode)}</span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}