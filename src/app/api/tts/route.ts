export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const text = searchParams.get("text");
  if (!text) return new Response("Missing text", { status: 400 });

  const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=gtx&q=${encodeURIComponent(text)}&tl=ml`;

  const resp = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  return new Response(resp.body, {
    status: resp.status,
    headers: {
      "Content-Type": resp.headers.get("Content-Type") || "audio/mpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
