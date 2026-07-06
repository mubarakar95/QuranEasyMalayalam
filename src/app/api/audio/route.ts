import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }

  try {
    const parsed = new URL(url);
    const allowed = [
      "cdn.islamic.network",
      "verses.quran.com",
      "lalithasaram.net",
    ];
    if (!allowed.some((d) => parsed.hostname.endsWith(d))) {
      return NextResponse.json({ error: "Domain not allowed" }, { status: 403 });
    }

    const res = await fetch(parsed.toString(), {
      headers: { "User-Agent": "QuranEasyMalayalam/1.0" },
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Upstream error" }, { status: res.status });
    }

    const blob = await res.arrayBuffer();
    return new NextResponse(blob, {
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "audio/mpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Fetch failed" }, { status: 502 });
  }
}
