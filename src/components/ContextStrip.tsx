"use client";

import { RUKU_DATA } from "@/lib/ruku-data";

interface ContextStripProps {
  rukuNumber?: number;
  ayahNumber?: number;
  juzNumber?: number;
}

export default function ContextStrip({
  rukuNumber,
  ayahNumber,
  juzNumber,
}: ContextStripProps) {
  if (!rukuNumber) return null;

  const ruku = RUKU_DATA[rukuNumber];
  if (!ruku) return null;

  return (
    <div className="context-strip max-w-[600px] mx-auto px-4 py-1.5 text-center border-b border-[var(--border)]">
      <div className="flex items-center justify-center gap-2 text-[11px] leading-tight">
        <span className="context-strip-surah font-medium text-[var(--foreground)]">
          {ruku.surahMl}
        </span>
        {ruku.surahRukuTotal > 1 && (
          <span className="context-strip-ruku text-[var(--muted)]">
            {ruku.surahRukuIdx}/{ruku.surahRukuTotal}
          </span>
        )}
        <span className="context-strip-sep text-[var(--muted)]">·</span>
        <span className="context-strip-info text-[var(--muted)]">
          {juzNumber ? `ജൂസ് ${juzNumber}` : `റുക്ഉ് ${rukuNumber}`}
        </span>
      </div>
    </div>
  );
}
