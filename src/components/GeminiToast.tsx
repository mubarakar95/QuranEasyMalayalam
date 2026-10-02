"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { GeminiToastEvent, subscribeGeminiToast, emitGeminiToast } from "@/lib/gemini-toast";

export default function GeminiToast() {
  const [toast, setToast] = useState<GeminiToastEvent | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return subscribeGeminiToast((t) => {
      setToast(t);
    });
  }, []);

  if (!mounted || !toast) return null;

  const getBorderColor = () => {
    switch (toast.status) {
      case "loading":
        return "border-blue-500/40 shadow-blue-500/10";
      case "fallback":
        return "border-amber-500/50 shadow-amber-500/15";
      case "success":
        return "border-emerald-500/50 shadow-emerald-500/15";
      case "error":
        return "border-rose-500/50 shadow-rose-500/15";
    }
  };

  const content = (
    <div
      className="fixed bottom-20 right-4 sm:bottom-20 sm:right-6 z-[100000] max-w-[340px] pointer-events-auto select-none transition-all duration-200"
      style={{ animation: "geminiToastSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)" }}
      role="status"
      aria-live="polite"
    >
      <div
        className={`flex items-start gap-2.5 p-3 rounded-xl bg-neutral-900/95 dark:bg-neutral-950/95 text-neutral-100 backdrop-blur-md border shadow-2xl ${getBorderColor()}`}
      >
        {/* Status Indicator Icon */}
        <div className="flex-shrink-0 mt-0.5">
          {toast.status === "loading" && (
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          )}
          {toast.status === "fallback" && (
            <div className="w-4 h-4 text-amber-400 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
              </svg>
            </div>
          )}
          {toast.status === "success" && (
            <div className="w-4 h-4 text-emerald-400 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
              </svg>
            </div>
          )}
          {toast.status === "error" && (
            <div className="w-4 h-4 text-rose-400 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22Z" clipRule="evenodd" />
              </svg>
            </div>
          )}
        </div>

        {/* Content Details */}
        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-[11px] text-neutral-200 tracking-wide uppercase">
              {toast.title}
            </span>
            {toast.model && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-md font-mono bg-neutral-800 text-blue-300 border border-neutral-700">
                {toast.model}
              </span>
            )}
          </div>
          <p className="text-[12px] text-neutral-300 leading-snug mt-1 break-words">
            {toast.message}
          </p>
        </div>

        {/* Close Button */}
        <button
          onClick={() => emitGeminiToast(null)}
          className="flex-shrink-0 text-neutral-400 hover:text-neutral-200 transition-colors p-0.5 rounded"
          aria-label="Dismiss notification"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(content, document.body) : null;
}
