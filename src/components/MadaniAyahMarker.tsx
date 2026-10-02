"use client";

import React from "react";
import { toArabicDigits } from "@/lib/types";

interface MadaniAyahMarkerProps {
  char?: string;
  verseKey?: string | null;
  highlighted?: boolean;
  onClick?: () => void;
}

function MadaniAyahMarkerInner({ char, verseKey, highlighted, onClick }: MadaniAyahMarkerProps) {
  const verseNumber = verseKey ? verseKey.split(":")[1] : null;
  const displayNum = verseNumber ? toArabicDigits(verseNumber) : (char || "");
  const numLength = displayNum.length;
  // Font size: carefully calibrated for 1, 2, or 3 digits to sit cleanly inside the sage green disc
  const fontSize = numLength >= 3 ? "16px" : numLength >= 2 ? "19.5px" : "23px";

  return (
    <span
      className={`madani-ayah-marker relative inline-flex items-center justify-center cursor-pointer select-none transition-transform duration-150 ${
        highlighted ? "highlighted scale-110" : "hover:scale-105 active:scale-95"
      }`}
      onClick={onClick}
      title={verseKey ? `Ayah ${verseKey}` : undefined}
    >
      <svg
        viewBox="0 0 52 69"
        className="w-full h-full select-none pointer-events-none"
        style={{ overflow: "visible" }}
        aria-hidden="true"
      >
        {/* Authentic Madani Mushaf Ayah Ornament (Sage disc, pink lotus, white scrolls) */}
        <image
          href="/madani-ayah-marker.png"
          width="52"
          height="69"
          preserveAspectRatio="xMidYMid meet"
          className="dark:brightness-95 dark:contrast-110"
        />
        {/* Centered Arabic verse number in crisp dark charcoal ink */}
        <text
          x={numLength >= 2 ? "26.4" : "26"}
          y="36.5"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={fontSize}
          fontWeight="700"
          fontFamily='"Amiri", "Noto Naskh Arabic", "Traditional Arabic", sans-serif'
          fill="#111827"
          style={{ fill: "#111827" }}
        >
          {displayNum}
        </text>
      </svg>
    </span>
  );
}

const MadaniAyahMarker = React.memo(MadaniAyahMarkerInner);
export default MadaniAyahMarker;

export function MadaniMarkerDefs() {
  return null;
}
