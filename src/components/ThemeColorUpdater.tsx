"use client";

import { useEffect } from "react";

const LIGHT_THEME = "#ffffff";
const DARK_THEME = "#0a0a0a";

export default function ThemeColorUpdater() {
  useEffect(() => {
    const updateThemeColor = (isDark: boolean) => {
      const color = isDark ? DARK_THEME : LIGHT_THEME;
      let meta = document.querySelector<HTMLMetaElement>(
        'meta[name="theme-color"]'
      );
      if (!meta) {
        meta = document.createElement("meta");
        meta.name = "theme-color";
        document.head.appendChild(meta);
      }
      meta.content = color;
    };

    const html = document.documentElement;
    updateThemeColor(html.classList.contains("dark"));

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName === "class") {
          updateThemeColor(html.classList.contains("dark"));
        }
      }
    });
    observer.observe(html, { attributes: true, attributeFilter: ["class"] });

    return () => observer.disconnect();
  }, []);

  return null;
}
