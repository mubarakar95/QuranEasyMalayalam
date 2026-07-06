"use client";

import { useEffect } from "react";

const THEME_COLORS: Record<string, string> = {
  light: "#ffffff",
  creme: "#f5efe6",
  dark: "#0a0a0a",
};

export default function ThemeColorUpdater() {
  useEffect(() => {
    const updateThemeColor = (classList: DOMTokenList) => {
      let theme = "light";
      if (classList.contains("dark")) theme = "dark";
      else if (classList.contains("creme")) theme = "creme";

      const color = THEME_COLORS[theme];

      let meta = document.querySelector<HTMLMetaElement>(
        'meta[name="theme-color"]'
      );
      if (!meta) {
        meta = document.createElement("meta");
        meta.name = "theme-color";
        document.head.appendChild(meta);
      }
      meta.content = color;

      document.documentElement.style.setProperty("--theme-color", color);
    };

    const html = document.documentElement;
    updateThemeColor(html.classList);

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName === "class") {
          updateThemeColor(html.classList);
        }
      }
    });
    observer.observe(html, { attributes: true, attributeFilter: ["class"] });

    return () => observer.disconnect();
  }, []);

  return null;
}
