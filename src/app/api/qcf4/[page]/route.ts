import { NextRequest, NextResponse } from "next/server";

const CDN_URL = "https://cdn.jsdelivr.net/gh/MohamadHajjRabee/quran-qcf4@main";
const RAW_BASE = "https://raw.githubusercontent.com/MohamadHajjRabee/quran-qcf4/main";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ page: string }> }
) {
  const { page } = await params;
  const padded = page.padStart(3, "0");

  const urls = [
    `${RAW_BASE}/pages/${padded}.json`,
    `${CDN_URL}/pages/${padded}.json`,
  ];

  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data);
      }
    } catch {
      /* try fallback */
    }
  }

  return NextResponse.json(
    { error: "Failed to load page data" },
    { status: 502 }
  );
}
