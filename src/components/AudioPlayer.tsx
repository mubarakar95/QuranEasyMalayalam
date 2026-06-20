"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Reciter, RECITERS, AyahInfo, HighlightWord, AudioMode, RepeatMode } from "@/lib/types";
import { getAudioUrl, getMalayalamAyahAudioUrl } from "@/lib/quran-api";
import { fetchChapterSegments, findWordAtTime } from "@/lib/audio-segments";

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
}

const audioHandlers = new WeakMap<HTMLAudioElement, {
  handleEnded: () => void;
  handleError: () => void;
  handleTimeUpdate: () => void;
  handleLoadedMetadata: () => void;
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
}: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentAyahIndex, setCurrentAyahIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playingMalayalam, setPlayingMalayalam] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("none");
  const [playLoop, setPlayLoop] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const onPageCompleteRef = useRef(onPageComplete);
  const onVerseChangeRef = useRef(onVerseChange);
  const onWordHighlightRef = useRef(onWordHighlight);
  const stoppedRef = useRef(false);
  const volumeRef = useRef(volume);
  const playbackRateRef = useRef(playbackRate);
  const segmentsRef = useRef<Awaited<ReturnType<typeof fetchChapterSegments>>>([]);
  const rafRef = useRef<number>(0);
  const currentWordIndexRef = useRef<number | null>(null);
  const isPlayingRef = useRef(isPlaying);
  const currentAyahIndexRef = useRef(currentAyahIndex);
  const ayahsRef = useRef(ayahs);
  const reciterRef = useRef(reciter);
  const audioModeRef = useRef(audioMode);
  const playingMalayalamRef = useRef(playingMalayalam);
  const repeatModeRef = useRef(repeatMode);
  const highlightVerseKeyRef = useRef(highlightVerseKey);

  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { playbackRateRef.current = playbackRate; }, [playbackRate]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { currentAyahIndexRef.current = currentAyahIndex; }, [currentAyahIndex]);
  useEffect(() => { ayahsRef.current = ayahs; }, [ayahs]);
  useEffect(() => { reciterRef.current = reciter; }, [reciter]);
  useEffect(() => { audioModeRef.current = audioMode; }, [audioMode]);
  useEffect(() => { playingMalayalamRef.current = playingMalayalam; }, [playingMalayalam]);
  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);
  useEffect(() => { highlightVerseKeyRef.current = highlightVerseKey; }, [highlightVerseKey]);
  useEffect(() => { onPageCompleteRef.current = onPageComplete; }, [onPageComplete]);
  useEffect(() => { onVerseChangeRef.current = onVerseChange; }, [onVerseChange]);
  useEffect(() => { onWordHighlightRef.current = onWordHighlight; }, [onWordHighlight]);

  useEffect(() => {
    if (ayahs.length === 0) return;
    const ayah = ayahs[currentAyahIndex];
    if (ayah) {
      onVerseChangeRef.current?.(`${ayah.surah.number}:${ayah.numberInSurah}`);
    }
  }, [currentAyahIndex, ayahs]);

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

  const trackWordFn = () => {
    const audio = audioRef.current;
    if (!audio || audio.paused) return;

    const ayah = ayahsRef.current[currentAyahIndexRef.current];
    if (!ayah) return;
    const shouldTrack = audioModeRef.current === "arabic" || (audioModeRef.current === "both" && !playingMalayalamRef.current);
    if (!shouldTrack || !reciterRef.current.quranComId) return;

    const verseKey = `${ayah.surah.number}:${ayah.numberInSurah}`;
    const currentTimeMs = audio.currentTime * 1000;
    const wordIndex = findWordAtTime(segmentsRef.current, verseKey, currentTimeMs);

    if (wordIndex !== currentWordIndexRef.current) {
      currentWordIndexRef.current = wordIndex;
      if (wordIndex !== null) {
        onWordHighlightRef.current?.({ verseKey, wordIndex });
      }
    }

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
      audioHandlers.delete(audio);
    }
  }, []);

  const playNextAyahOrMalayalam = useCallback(() => {
    if (stoppedRef.current) return;
    cancelAnimationFrame(rafRef.current);
    onWordHighlightRef.current?.(null);
    currentWordIndexRef.current = null;

    const mode = audioModeRef.current;
    const repeat = repeatModeRef.current;

    if (mode === "both" && playingMalayalamRef.current) {
      setPlayingMalayalam(false);
      return;
    }

    if (playingMalayalamRef.current) {
      setPlayingMalayalam(false);
    }

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
  }, [cleanupAudio]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        cleanupAudio(audioRef.current);
        audioRef.current = null;
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
    cancelAnimationFrame(rafRef.current);

    stoppedRef.current = false;
    const ayah = ayahs[currentAyahIndex];
    const mode = audioMode;

    let url: string;
    if (mode === "malayalam") {
      url = getMalayalamAyahAudioUrl(ayah.surah.number, ayah.numberInSurah);
    } else if (mode === "both" && playingMalayalam) {
      url = getMalayalamAyahAudioUrl(ayah.surah.number, ayah.numberInSurah);
    } else {
      url = getAudioUrl(reciter.id, ayah.number);
    }

    const audio = new Audio(url);
    audio.volume = volumeRef.current;
    audio.playbackRate = playbackRateRef.current;
    audioRef.current = audio;

    if (!playingMalayalam && mode !== "malayalam") {
      currentWordIndexRef.current = null;
    }

    const handleEnded = () => {
      playNextAyahOrMalayalam();
    };

    const handleError = () => {
      cancelAnimationFrame(rafRef.current);
      setIsPlaying(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      const shouldTrack = (mode === "arabic" || (mode === "both" && !playingMalayalam)) && reciter.quranComId;
      if (shouldTrack) {
        rafRef.current = requestAnimationFrame(trackWordFn);
      }
    };

    audioHandlers.set(audio, { handleEnded, handleError, handleTimeUpdate, handleLoadedMetadata });

    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);

    audio.play().catch(() => {
      setIsPlaying(false);
    });

    return () => {
      stoppedRef.current = true;
      cleanupAudio(audio);
      cancelAnimationFrame(rafRef.current);
      if (audioRef.current === audio) {
        audioRef.current = null;
      }
    };
  }, [isPlaying, currentAyahIndex, ayahs, reciter.id, audioMode, playingMalayalam, playLoop, cleanupAudio, playNextAyahOrMalayalam]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

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
          setPlayingMalayalam(true);
        }
        return true;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        cancelAnimationFrame(rafRef.current);
      }
      return false;
    });
  }, []);

  const stop = useCallback(() => {
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
    currentWordIndexRef.current = null;
    onWordHighlightRef.current?.(null);
  }, [cleanupAudio]);

  const skipAyah = useCallback(
    (direction: 1 | -1) => {
      setPlayingMalayalam(audioModeRef.current === "both");
      setPlayLoop(0);
      setCurrentAyahIndex((prev) => {
        const next = prev + direction;
        if (next < 0 || next >= ayahsRef.current.length) return prev;
        return next;
      });
    },
    []
  );

  const cycleSpeed = useCallback(() => {
    setPlaybackRate((prev) => {
      const idx = SPEEDS.indexOf(prev as (typeof SPEEDS)[number]);
      return SPEEDS[(idx + 1) % SPEEDS.length];
    });
  }, []);

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
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const idx = AUDIO_MODES.indexOf(audioMode);
              const next = AUDIO_MODES[(idx + 1) % AUDIO_MODES.length];
              stop();
              onAudioModeChange?.(next);
            }}
            className="px-2 py-1 rounded text-[11px] font-medium tabular-nums bg-[var(--surface)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--foreground)] transition-colors"
            aria-label="Audio mode"
          >
            {shortModeLabel(audioMode)}
          </button>
          {audioMode !== "malayalam" && (
            <select
              value={reciter.id}
              onChange={(e) => {
                const selected = RECITERS.find((r) => r.id === e.target.value);
                if (selected) {
                  stop();
                  onReciterChange(selected);
                }
              }}
              className="reciter-select"
              aria-label="Select reciter"
            >
              {RECITERS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <span className="text-[10px] text-[var(--muted)] tabular-nums">
          {isPlaying ? (
            <>
              {currentAyahIndex + 1} / {ayahs.length}
              {audioMode === "both" && (
                <span className="ml-1 text-[9px]">
                  {playingMalayalam ? "(മലയാളം)" : "(Arabic)"}
                </span>
              )}
            </>
          ) : (
            <span className="font-medium">{shortModeLabel(audioMode)}</span>
          )}
        </span>
      </div>

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

      <div className="flex items-center justify-center gap-1 mt-1.5">
        <button onClick={() => skipAyah(-1)} disabled={currentAyahIndex === 0} className="player-btn" aria-label="Previous ayah">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 16.811c0 .864-.933 1.406-1.683.947l-7.108-4.061a1.125 1.125 0 0 1 0-1.95l7.108-4.061A1.125 1.125 0 0 1 21 8.689v8.122ZM11.25 16.811c0 .864-.933 1.406-1.683.947l-7.108-4.061a1.125 1.125 0 0 1 0-1.95l7.108-4.061a1.125 1.125 0 0 1 1.683.947v8.122Z" />
          </svg>
        </button>

        <button onClick={togglePlay} className="player-btn-play" aria-label={isPlaying ? "Pause" : "Play"}>
          {isPlaying ? (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
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
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
            <path fillRule="evenodd" d="M4.5 7.5a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3v-9Z" clipRule="evenodd" />
          </svg>
        </button>

        <button
          onClick={() => setRepeatMode((r) => r === "none" ? "ayah" : r === "ayah" ? "page" : "none")}
          className={`player-btn relative ${repeatMode !== "none" ? "bg-[var(--foreground)] text-[var(--background)] rounded-sm" : ""}`}
          aria-label={`Repeat: ${repeatMode === "none" ? "off" : repeatMode === "ayah" ? "ayah" : "page"}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3" />
          </svg>
          {repeatMode === "ayah" && (
            <span className="absolute -top-0.5 -right-0.5 text-[7px] font-bold leading-none">1</span>
          )}
          {repeatMode === "page" && (
            <span className="absolute -top-0.5 -right-0.5 text-[7px] font-bold leading-none">↺</span>
          )}
        </button>

        <div className="flex items-center gap-1 ml-2 pl-2 border-l border-[var(--border)]">
          <button
            onClick={cycleSpeed}
            className="px-1.5 py-0.5 rounded text-[10px] font-medium tabular-nums bg-[var(--surface)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--foreground)] transition-colors"
            aria-label="Playback speed"
          >
            {playbackRate}x
          </button>
        </div>
      </div>
    </div>
  );
}