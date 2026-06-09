import type { Metadata, Viewport } from "next";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
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
  themeColor: "#111111",
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
      </head>
      <body className="min-h-screen flex flex-col overflow-x-hidden bg-[var(--background)] text-[var(--foreground)]">
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}