"use client";

import React from "react";

interface MadaniFrameProps {
  children: React.ReactNode;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  isSinglePage?: boolean;
}

export default function MadaniFrame({
  children,
  header,
  footer,
  className = "",
  isSinglePage = false,
}: MadaniFrameProps) {
  return (
    <div
      className={`madani-page-wrapper w-full h-full relative overflow-hidden select-none ${
        isSinglePage ? "is-single-page" : ""
      } ${className}`}
    >
      {/* Top Margin: Surah & Juz Header (positioned directly above the ornate frame) */}
      {header && (
        <div
          className="madani-sheet-header absolute z-20 flex items-center"
          style={
            isSinglePage
              ? { top: "0.8%", height: "3.2%", left: "1.5%", right: "1.5%" }
              : { top: "8.6%", height: "3.4%", left: "11.8%", right: "11.6%" }
          }
        >
          {header}
        </div>
      )}

      {/* Ornate Frame Area (authentic page margins matching Madani Mushaf for two-page spread, or small border for single page) */}
      <div
        className="madani-sheet-frame-area absolute"
        style={
          isSinglePage
            ? { top: "4.2%", bottom: "4.2%", left: "1.5%", right: "1.5%" }
            : { top: "12.6%", bottom: "12.8%", left: "11.8%", right: "11.6%" }
        }
      >
        {/* Ornate Official Madani Vector Border Overlay */}
        <div className="madani-frame-border pointer-events-none absolute inset-0 z-10">
          <img
            src="/madani-frame.png"
            alt="Madani Mushaf Frame"
            className="w-full h-full object-fill select-none pointer-events-none opacity-100 dark:opacity-60"
            draggable={false}
          />
        </div>

        {/* Text Area Content: authentic inset inside the ornate border */}
        <div className="madani-slot-area absolute z-0 left-[9.5%] right-[9.5%] top-[5.2%] bottom-[5.2%] overflow-visible">
          {children}
        </div>
      </div>

      {/* Bottom Margin: Page Number Footer (centered horizontally) */}
      {footer && (
        <div
          className="madani-sheet-footer absolute z-20 flex items-center justify-center"
          style={
            isSinglePage
              ? { bottom: "0.8%", height: "3.2%", left: 0, right: 0 }
              : { bottom: "8.5%", height: "3.5%", left: 0, right: 0 }
          }
        >
          {footer}
        </div>
      )}
    </div>
  );
}
