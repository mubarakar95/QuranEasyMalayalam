type MalayalamWBW = Record<string, string[]>;

let cache: MalayalamWBW | null = null;

export async function fetchMalayalamWBW(): Promise<MalayalamWBW> {
  if (cache) return cache;

  const res = await fetch("/malayalam-wbw.json");
  if (!res.ok) throw new Error("Failed to load Malayalam word-by-word data");

  cache = await res.json();
  return cache!;
}