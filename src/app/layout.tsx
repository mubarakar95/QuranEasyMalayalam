import type { Metadata, Viewport } from "next";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import ThemeColorUpdater from "@/components/ThemeColorUpdater";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quran Easy Malayalam",
  description:
    "Read and listen to the Holy Quran. മലയാളം വിവർത്തനത്തോടെ ഖുർആൻ പാരായണം",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Quran Easy",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#ffffff",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ml" dir="ltr" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://api.alquran.cloud" />
        <link rel="preconnect" href="https://cdn.islamic.network" />
        <link rel="preconnect" href="https://api.quran.com" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Amiri+Quran&family=Amiri:ital,wght@0,400;0,700;1,400&family=Noto+Naskh+Arabic:wght@400;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen flex flex-col overflow-x-hidden overflow-y-hidden bg-[var(--background)] text-[var(--foreground)]">
        <ServiceWorkerRegistration />
        <ThemeColorUpdater />
        {children}
      </body>
    </html>
  );
}