"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SURAH_NAMES } from "@/lib/qcf4";
import AuthModal from "@/components/AuthModal";
import {
  loadMushtabihat,
  filterByJuzRange,
  fetchPairTexts,
  fetchAyahText,
  shuffle,
  isBookmarked,
  toggleBookmark,
  getBookmarkedPairs,
  syncBookmarksToSupabase,
  loadBookmarksFromSupabase,
  isHidden,
  toggleHidden,
  filterHidden,
  getHiddenPairs,
  syncHiddenToSupabase,
  loadHiddenFromSupabase,
  discoverSimilarPairs,
  type MushtabihatPair,
} from "@/lib/mushtabihat";

type View = "select" | "quiz" | "saved" | "hidden" | "browse" | "discover";

export default function MushtabihatPage() {
  const router = useRouter();
  const [view, setView] = useState<View>("select");
  const [startJuz, setStartJuz] = useState(29);
  const [endJuz, setEndJuz] = useState(30);
  const [allPairs, setAllPairs] = useState<MushtabihatPair[]>([]);
  const [loading, setLoading] = useState(false);

  const [quizPairs, setQuizPairs] = useState<MushtabihatPair[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [showingAyah1, setShowingAyah1] = useState(true);
  const [loadingText, setLoadingText] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [savedPairs, setSavedPairs] = useState<MushtabihatPair[]>([]);
  const [hiddenPairs, setHiddenPairs] = useState<MushtabihatPair[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [browseSearch, setBrowseSearch] = useState("");
  const [browseTexts, setBrowseTexts] = useState<Record<string, string>>({});
  const [discoverPairs, setDiscoverPairs] = useState<MushtabihatPair[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ verseKey: string; text: string }[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    loadMushtabihat().then(setAllPairs);

    import("@/lib/supabase/client").then(({ createClient }) => {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data }) => {
        if (data.user) {
          setUserId(data.user.id);
          setUserEmail(data.user.email || null);
          loadBookmarksFromSupabase(data.user.id);
          loadHiddenFromSupabase(data.user.id);
        }
      });
    });
  }, []);

  const startQuiz = useCallback(() => {
    setLoading(true);
    loadMushtabihat().then((pairs) => {
      const filtered = filterHidden(filterByJuzRange(pairs, startJuz, endJuz));
      if (filtered.length === 0) {
        setLoading(false);
        return;
      }
      const shuffled = shuffle(filtered);
      setQuizPairs(shuffled);
      setCurrentIdx(0);
      setRevealed(false);
      setShowingAyah1(true);
      setView("quiz");
      setLoading(false);
    });
  }, [startJuz, endJuz]);

  const currentPair = quizPairs[currentIdx];

  const loadTexts = useCallback(async () => {
    if (!currentPair || (currentPair.text1 && currentPair.text2)) return;
    setLoadingText(true);
    const { text1, text2 } = await fetchPairTexts(currentPair);
    setQuizPairs((prev) => {
      const updated = [...prev];
      updated[currentIdx] = { ...updated[currentIdx], text1, text2 };
      return updated;
    });
    setLoadingText(false);
  }, [currentPair, currentIdx]);

  useEffect(() => {
    if (view === "quiz" && currentPair) loadTexts();
  }, [view, currentPair, loadTexts]);

  useEffect(() => {
    if (currentPair) {
      setBookmarked(isBookmarked(currentPair));
      setHidden(isHidden(currentPair));
    }
  }, [currentPair]);

  const handleReveal = () => setRevealed(true);

  const handleNext = () => {
    if (currentIdx < quizPairs.length - 1) {
      setCurrentIdx((i) => i + 1);
      setRevealed(false);
      setShowingAyah1(Math.random() > 0.5);
    }
  };

  const handlePrev = () => {
    if (currentIdx > 0) {
      setCurrentIdx((i) => i - 1);
      setRevealed(false);
    }
  };

  const runSearch = async () => {
    setSearchLoading(true);
    setSearchResults([]);
    const res = await fetch("/quran-text.json");
    const surahs: { id: number; name: string; verses: { id: number; text: string }[] }[] = await res.json();

    const versePageMap: Record<string, number> = await fetch("/verse-page-map.json").then((r) => r.json());
    const JUZ_START = [0,1,22,42,62,82,102,122,142,162,182,202,222,242,262,282,302,322,342,362,382,402,422,442,462,482,502,522,542,562,582,600];
    const getJuz = (vk: string) => {
      const page = versePageMap[vk] || 1;
      for (let j = 30; j >= 1; j--) { if (page >= JUZ_START[j]) return j; }
      return 30;
    };

    const query = searchQuery.trim();
    const results: { verseKey: string; text: string }[] = [];

    for (const surah of surahs) {
      for (const verse of surah.verses) {
        const vk = `${surah.id}:${verse.id}`;
        const juz = getJuz(vk);
        if (juz < startJuz || juz > endJuz) continue;
        if (verse.text.includes(query)) {
          results.push({ verseKey: vk, text: verse.text });
        }
      }
    }

    setSearchResults(results);
    setSearchLoading(false);
  };

  function highlightMatch(text: string, query: string): string {
    if (!query.trim()) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return text.replace(new RegExp(`(${escaped})`, "g"), '<span style="background:var(--accent);color:white;padding:0 2px;border-radius:3px">$1</span>');
  }

  if (view === "quiz" && quizPairs.length === 0) {
    return (
      <div className="max-w-lg mx-auto p-4 pb-20 text-center">
        <p className="text-sm text-[var(--muted)] py-12">
          No mushtabihat pairs found in this range.
        </p>
        <button onClick={() => setView("select")} className="text-sm text-[var(--accent)]">
          Go back
        </button>
      </div>
    );
  }

  if (view === "quiz" && currentPair) {
    const shown = showingAyah1
      ? currentPair
      : { ayah1: currentPair.ayah2, ayah2: currentPair.ayah1, text1: currentPair.text2, text2: currentPair.text1 };
    const hiddenVerse = showingAyah1
      ? { ayah: currentPair.ayah2, text: currentPair.text2 }
      : { ayah: currentPair.ayah1, text: currentPair.text1 };

    return (
      <div className="max-w-lg mx-auto p-4 pb-20">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setView("select")} className="p-1.5 rounded-md hover:bg-[var(--surface)]">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold">Mushtabihat</h1>
          <span className="ml-auto text-xs text-[var(--muted)] mr-2">
            {currentIdx + 1} / {quizPairs.length}
          </span>
          <button
            onClick={() => {
              if (currentPair) {
                const added = toggleBookmark(currentPair);
                setBookmarked(added);
                if (userId) syncBookmarksToSupabase(userId);
              }
            }}
            className="p-1.5 rounded-md hover:bg-[var(--surface)] transition-colors"
            aria-label={bookmarked ? "Remove bookmark" : "Bookmark this pair"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill={bookmarked ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
            </svg>
          </button>
          <button
            onClick={() => {
              if (currentPair) {
                const added = toggleHidden(currentPair);
                setHidden(added);
                if (userId) syncHiddenToSupabase(userId);
                if (added) handleNext();
              }
            }}
            className="p-1.5 rounded-md hover:bg-[var(--surface)] transition-colors"
            aria-label={hidden ? "Show this pair" : "Mark as not useful"}
            title={hidden ? "Show this pair" : "Not useful — skip in future"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
            </svg>
          </button>
        </div>

        <div className="w-full h-1 bg-[var(--surface)] rounded-full mb-6 overflow-hidden">
          <div
            className="h-full bg-[var(--accent)] rounded-full transition-all duration-300"
            style={{ width: `${((currentIdx + 1) / quizPairs.length) * 100}%` }}
          />
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden mb-4">
          <div className="p-5 text-center">
            <p className="text-[10px] text-[var(--muted)] mb-3 font-medium">
              {showingAyah1 ? currentPair.ayah1 : currentPair.ayah2} — {SURAH_NAMES[showingAyah1 ? currentPair.surah1 : currentPair.surah2]?.englishName || ""}
            </p>
            <p
              className="text-xl leading-relaxed font-arabic"
              dir="rtl"
              style={{ fontFamily: '"QCF4_Hafs_01", serif' }}
            >
              {loadingText ? (
                <span className="text-sm text-[var(--muted)]">Loading...</span>
              ) : (
                shown.text1 || "—"
              )}
            </p>
            <div className="flex items-center justify-center gap-2 mt-3">
              {currentPair.similarity != null && (
                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--accent)] text-white">
                  {currentPair.similarity}% match
                </span>
              )}
              {currentPair.origin && (
                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--surface)] text-[var(--muted)] border border-[var(--border)]">
                  {currentPair.origin === "waqar" ? "Qari-curated" : "srmdn"}
                </span>
              )}
              {currentPair.category && (
                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--background)] text-[var(--muted)]">
                  {currentPair.category.replace("_", " ")}
                </span>
              )}
            </div>
          </div>

          <div className="border-t border-[var(--border)]" />

          <div className={`p-5 text-center transition-all duration-300 ${revealed ? "bg-[var(--background)]" : ""}`}>
            {!revealed ? (
              <button
                onClick={handleReveal}
                className="py-8 w-full text-sm font-medium text-[var(--accent)] hover:opacity-80 transition-opacity"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 mx-auto mb-2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
                Tap to reveal the similar verse
              </button>
            ) : (
              <div className="animate-in fade-in duration-300">
                <p className="text-[10px] text-[var(--muted)] mb-3 font-medium">
                  {hiddenVerse.ayah} — {SURAH_NAMES[showingAyah1 ? currentPair.surah2 : currentPair.surah1]?.englishName || ""}
                </p>
                <p
                  className="text-xl leading-relaxed font-arabic mb-3"
                  dir="rtl"
                  style={{ fontFamily: '"QCF4_Hafs_01", serif' }}
                >
                  {hiddenVerse.text || "—"}
                </p>
                {currentPair.note && (
                  <div className="mt-3 p-3 rounded-lg bg-[var(--surface)] text-left">
                    <p className="text-xs text-[var(--muted)] leading-relaxed">
                      {currentPair.note}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handlePrev}
            disabled={currentIdx === 0}
            className="flex-1 py-2.5 rounded-lg border border-[var(--border)] text-xs font-medium disabled:opacity-30 hover:bg-[var(--surface)] transition-colors"
          >
            Previous
          </button>
          <button
            onClick={handleNext}
            disabled={currentIdx === quizPairs.length - 1}
            className="flex-1 py-2.5 rounded-lg bg-[var(--foreground)] text-[var(--background)] text-xs font-semibold disabled:opacity-30 hover:opacity-90 transition-opacity"
          >
            Next
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-4 pb-20">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => router.back()} className="p-1.5 rounded-md hover:bg-[var(--surface)]">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold">Mushtabihat</h1>
      </div>

      <div className="flex gap-0.5 bg-[var(--surface)] rounded-lg p-0.5 mb-4">
        {(["practice", "browse", "saved", "hidden", "discover"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              if (tab === "saved") {
                loadMushtabihat().then((pairs) => setSavedPairs(getBookmarkedPairs(pairs)));
                setView("saved");
              } else if (tab === "hidden") {
                loadMushtabihat().then((pairs) => setHiddenPairs(getHiddenPairs(pairs)));
                setView("hidden");
              } else if (tab === "discover") {
                setView("discover");
              } else if (tab === "browse") {
                setView("browse");
                setBrowseSearch("");
              } else {
                setView("select");
              }
            }}
            className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-all ${
              (view === "select" && tab === "practice") || (view === "saved" && tab === "saved") || (view === "hidden" && tab === "hidden") || (view === "browse" && tab === "browse") || (view === "discover" && tab === "discover")
                ? "bg-[var(--foreground)] text-[var(--background)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {tab === "practice" ? "Practice" : tab === "browse" ? "Browse" : tab === "saved" ? "Saved" : tab === "discover" ? "Discover" : "Hidden"}
          </button>
        ))}
      </div>

      {view === "saved" ? (
        savedPairs.length === 0 ? (
          <div className="text-center py-12">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 mx-auto mb-3 text-[var(--muted)]">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
            </svg>
            <p className="text-sm text-[var(--muted)]">No saved pairs yet</p>
            <p className="text-xs text-[var(--muted)] mt-1">Bookmark pairs during practice to save them here</p>
          </div>
        ) : (
          <div className="space-y-2">
            {savedPairs.map((p) => (
              <div key={`${p.ayah1}-${p.ayah2}`} className="p-3 rounded-lg bg-[var(--surface)]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-[var(--muted)]">
                    {p.ayah1} ({SURAH_NAMES[p.surah1]?.englishName}) ↔ {p.ayah2} ({SURAH_NAMES[p.surah2]?.englishName})
                  </span>
                  <button
                    onClick={() => {
                      toggleBookmark(p);
                      setSavedPairs((prev) => prev.filter((x) => x.ayah1 !== p.ayah1 || x.ayah2 !== p.ayah2));
                      if (userId) syncBookmarksToSupabase(userId);
                    }}
                    className="p-1 rounded hover:bg-[var(--background)] transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 text-[var(--muted)]">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
                    </svg>
                  </button>
                </div>
                {p.note && (
                  <p className="text-[10px] text-[var(--muted)] leading-relaxed">{p.note}</p>
                )}
                {p.category && (
                  <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full text-[10px] bg-[var(--background)] text-[var(--muted)]">
                    {p.category.replace("_", " ")}
                  </span>
                )}
              </div>
            ))}
          </div>
        )
      ) : view === "hidden" ? (
        hiddenPairs.length === 0 ? (
          <div className="text-center py-12">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 mx-auto mb-3 text-[var(--muted)]">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
            </svg>
            <p className="text-sm text-[var(--muted)]">No hidden pairs</p>
            <p className="text-xs text-[var(--muted)] mt-1">Mark pairs as &quot;not useful&quot; during practice to hide them</p>
          </div>
        ) : (
          <div className="space-y-2">
            {hiddenPairs.map((p) => (
              <div key={`${p.ayah1}-${p.ayah2}`} className="p-3 rounded-lg bg-[var(--surface)]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-[var(--muted)]">
                    {p.ayah1} ({SURAH_NAMES[p.surah1]?.englishName}) ↔ {p.ayah2} ({SURAH_NAMES[p.surah2]?.englishName})
                  </span>
                  <button
                    onClick={() => {
                      toggleHidden(p);
                      setHiddenPairs((prev) => prev.filter((x) => x.ayah1 !== p.ayah1 || x.ayah2 !== p.ayah2));
                      if (userId) syncHiddenToSupabase(userId);
                    }}
                    className="px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--accent)] text-white hover:opacity-80 transition-opacity"
                  >
                    Unhide
                  </button>
                </div>
                {p.note && (
                  <p className="text-[10px] text-[var(--muted)] leading-relaxed">{p.note}</p>
                )}
                {p.category && (
                  <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full text-[10px] bg-[var(--background)] text-[var(--muted)]">
                    {p.category.replace("_", " ")}
                  </span>
                )}
              </div>
            ))}
          </div>
        )
      ) : view === "discover" ? (
        <>
          <p className="text-xs text-[var(--muted)] mb-4 leading-relaxed">
            Search Quran text within a juz range. Type an Arabic phrase to find all verses containing it.
          </p>

          {/* Juz range */}
          <div className="mb-4">
            <label className="text-xs font-medium text-[var(--muted)] mb-2 block">Juz Range</label>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <select
                  value={startJuz}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    setStartJuz(v);
                    if (v > endJuz) setEndJuz(v);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-sm outline-none focus:border-[var(--accent)]"
                >
                  {Array.from({ length: 30 }, (_, i) => i + 1).map((j) => (
                    <option key={j} value={j}>Juz {j}</option>
                  ))}
                </select>
              </div>
              <span className="text-[var(--muted)]">—</span>
              <div className="flex-1">
                <select
                  value={endJuz}
                  onChange={(e) => setEndJuz(Math.max(startJuz, parseInt(e.target.value)))}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-sm outline-none focus:border-[var(--accent)]"
                >
                  {Array.from({ length: 30 }, (_, i) => i + 1).map((j) => (
                    <option key={j} value={j} disabled={j < startJuz}>Juz {j}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Search input */}
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              placeholder="Type Arabic text (e.g. إن الذين آمنوا)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && searchQuery.trim()) runSearch();
              }}
              className="flex-1 px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-sm outline-none focus:border-[var(--accent)]"
            />
            <button
              onClick={runSearch}
              disabled={searchLoading || !searchQuery.trim()}
              className="px-4 py-2.5 rounded-lg bg-[var(--accent)] text-white text-sm font-medium disabled:opacity-50 shrink-0"
            >
              {searchLoading ? "..." : "Search"}
            </button>
          </div>

          {searchResults.length > 0 && (
            <p className="text-[10px] text-[var(--muted)] mb-3">{searchResults.length} verses found</p>
          )}

          <div className="space-y-2">
            {searchResults.map((r) => {
              const surahNum = parseInt(r.verseKey.split(":")[0]);
              const highlighted = highlightMatch(r.text, searchQuery);
              return (
                <div key={r.verseKey} className="p-3 rounded-lg bg-[var(--surface)]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-[var(--muted)] font-medium">
                      {r.verseKey} — {SURAH_NAMES[surahNum]?.englishName || ""}
                    </span>
                  </div>
                  <p
                    className="text-sm leading-relaxed font-arabic text-right"
                    dir="rtl"
                    style={{ fontFamily: '"QCF4_Hafs_01", serif' }}
                    dangerouslySetInnerHTML={{ __html: highlighted }}
                  />
                </div>
              );
            })}
          </div>
        </>
      ) : view === "browse" ? (
        <>
          <input
            type="text"
            placeholder="Search by surah name or verse ref..."
            value={browseSearch}
            onChange={(e) => setBrowseSearch(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-sm outline-none focus:border-[var(--accent)] mb-4"
          />
          {(() => {
            const q = browseSearch.toLowerCase().trim();
            const filtered = allPairs.filter((p) => {
              if (!q) return true;
              const name1 = (SURAH_NAMES[p.surah1]?.englishName || "").toLowerCase();
              const name2 = (SURAH_NAMES[p.surah2]?.englishName || "").toLowerCase();
              return (
                p.ayah1.includes(q) || p.ayah2.includes(q) ||
                name1.includes(q) || name2.includes(q)
              );
            }).slice(0, 50);

            if (filtered.length > 0) {
              const needed = new Set<string>();
              for (const p of filtered) {
                if (!browseTexts[p.ayah1]) needed.add(p.ayah1);
                if (!browseTexts[p.ayah2]) needed.add(p.ayah2);
              }
              if (needed.size > 0) {
                const keys = [...needed];
                Promise.all(keys.map((k) => fetchAyahText(k))).then((texts) => {
                  setBrowseTexts((prev) => {
                    const next = { ...prev };
                    keys.forEach((k, i) => { if (texts[i]) next[k] = texts[i]; });
                    return next;
                  });
                });
              }
            }

            return filtered.length === 0 ? (
              <p className="text-xs text-[var(--muted)] text-center py-8">No pairs found</p>
            ) : (
              <div className="space-y-2">
                {filtered.map((p) => (
                  <div key={`${p.ayah1}-${p.ayah2}`} className="p-3 rounded-lg bg-[var(--surface)]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-[var(--muted)]">
                        {p.ayah1} ({SURAH_NAMES[p.surah1]?.englishName}) ↔ {p.ayah2} ({SURAH_NAMES[p.surah2]?.englishName})
                      </span>
                      <span className="text-[10px] font-medium text-[var(--accent)]">{p.similarity}%</span>
                    </div>
                    <div className="grid grid-cols-1 gap-1 mt-2">
                      <p className="text-sm leading-relaxed font-arabic text-right" dir="rtl" style={{ fontFamily: '"QCF4_Hafs_01", serif' }}>
                        {browseTexts[p.ayah1] || <span className="text-[var(--muted)] text-xs">loading...</span>}
                      </p>
                      <p className="text-sm leading-relaxed font-arabic text-right" dir="rtl" style={{ fontFamily: '"QCF4_Hafs_01", serif' }}>
                        {browseTexts[p.ayah2] || <span className="text-[var(--muted)] text-xs">loading...</span>}
                      </p>
                    </div>
                    {p.category && (
                      <span className="inline-block mt-2 px-2 py-0.5 rounded-full text-[10px] bg-[var(--background)] text-[var(--muted)]">
                        {p.category.replace("_", " ")}
                      </span>
                    )}
                  </div>
                ))}
                {allPairs.filter((p) => {
                  if (!q) return true;
                  const name1 = (SURAH_NAMES[p.surah1]?.englishName || "").toLowerCase();
                  const name2 = (SURAH_NAMES[p.surah2]?.englishName || "").toLowerCase();
                  return p.ayah1.includes(q) || p.ayah2.includes(q) || name1.includes(q) || name2.includes(q);
                }).length > 50 && (
                  <p className="text-[10px] text-[var(--muted)] text-center py-2">Showing first 50 results</p>
                )}
              </div>
            );
          })()}
        </>
      ) : (
        <>
          <p className="text-xs text-[var(--muted)] mb-6 leading-relaxed">
            Practice identifying similar-looking verses (مشتبهات) that are commonly confused during memorization. Select a juz range and test yourself.
          </p>

          <div className="mb-6">
            <label className="text-xs font-medium text-[var(--muted)] mb-3 block">
              Juz Range
            </label>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-[10px] text-[var(--muted)] mb-1 block">From</label>
                <select
                  value={startJuz}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    setStartJuz(v);
                    if (v > endJuz) setEndJuz(v);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-sm outline-none focus:border-[var(--accent)]"
                >
                  {Array.from({ length: 30 }, (_, i) => i + 1).map((j) => (
                    <option key={j} value={j}>Juz {j}</option>
                  ))}
                </select>
              </div>
              <span className="text-[var(--muted)] mt-4">—</span>
              <div className="flex-1">
                <label className="text-[10px] text-[var(--muted)] mb-1 block">To</label>
                <select
                  value={endJuz}
                  onChange={(e) => setEndJuz(Math.max(startJuz, parseInt(e.target.value)))}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-sm outline-none focus:border-[var(--accent)]"
                >
                  {Array.from({ length: 30 }, (_, i) => i + 1).map((j) => (
                    <option key={j} value={j} disabled={j < startJuz}>Juz {j}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="mb-6 p-3 rounded-lg bg-[var(--surface)]">
            <p className="text-xs text-[var(--muted)]">
              {allPairs.length > 0
                ? `${filterHidden(filterByJuzRange(allPairs, startJuz, endJuz)).length} pairs in selected range`
                : "Loading..."}
            </p>
          </div>

          <button
            onClick={startQuiz}
            disabled={loading || allPairs.length === 0}
            className="w-full py-3.5 rounded-xl bg-[var(--accent)] text-white text-sm font-semibold disabled:opacity-50"
          >
            {loading ? "Loading..." : "Start Practice"}
          </button>

          <div className="mt-8 pt-4 border-t border-[var(--border)]">
            {userId ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium">{userEmail}</p>
                  <p className="text-[10px] text-[var(--muted)]">Bookmarks & hidden pairs synced</p>
                </div>
                <button
                  onClick={async () => {
                    const supabase = createClient();
                    await supabase.auth.signOut();
                    setUserId(null);
                    setUserEmail(null);
                  }}
                  className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAuth(true)}
                className="w-full py-2.5 rounded-lg border border-[var(--border)] text-xs text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--accent)] transition-colors"
              >
                Sign in to sync bookmarks & hidden pairs
              </button>
            )}
          </div>

          <AuthModal
            open={showAuth}
            onClose={() => setShowAuth(false)}
            onAuth={(u) => {
              setUserId(u.id);
              setUserEmail(u.email);
              loadBookmarksFromSupabase(u.id);
              loadHiddenFromSupabase(u.id);
            }}
          />
        </>
      )}
    </div>
  );
}
