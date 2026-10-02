"use client";

import React from "react";

interface MadaniSurahHeaderProps {
  char: string;
  font: string;
  title?: string;
}

function MadaniSurahHeaderInner({ char, font, title }: MadaniSurahHeaderProps) {
  return (
    <div
      className="madani-surah-header-container relative flex items-center justify-center select-none"
      title={title}
      style={{ aspectRatio: "872.674 / 100" }}
    >
      {/* Light & Creme mode authentic Madani vector banner */}
      <img
        src="/madani-surah-header.svg"
        alt=""
        aria-hidden="true"
        className="w-full h-full object-fill pointer-events-none select-none dark:hidden"
        draggable={false}
      />

      {/* Dark mode tuned authentic Madani vector banner */}
      <img
        src="/madani-surah-header-dark.svg"
        alt=""
        aria-hidden="true"
        className="w-full h-full object-fill pointer-events-none select-none hidden dark:block"
        draggable={false}
      />

      {/* Center arch slot: King Fahd Complex calligraphic Surah title */}
      <div
        className="madani-surah-header-title absolute flex items-center justify-center pointer-events-none"
        style={{
          left: "27.5%",
          right: "27.5%",
          top: "4%",
          bottom: "16%",
        }}
      >
        <span
          className="madani-surah-title-glyph"
          style={{
            fontFamily: `"${font}", serif`,
            lineHeight: 1,
          }}
        >
          {char}
        </span>
      </div>
    </div>
  );
}

const MadaniSurahHeader = React.memo(MadaniSurahHeaderInner);
export default MadaniSurahHeader;
