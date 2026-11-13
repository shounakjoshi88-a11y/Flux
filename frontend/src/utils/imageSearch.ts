import { UNSPLASH_ACCESS_KEY } from "../lib/config";

export async function fetchImagesForQuery(q: string): Promise<string[]> {
  if (!q.trim()) return [];
  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=6&client_id=${UNSPLASH_ACCESS_KEY}`,
    );
    const data = await res.json();
    return (data.results ?? []).map((img: any) => img.urls.small);
  } catch {
    return [];
  }
}