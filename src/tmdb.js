const BASE = "https://api.themoviedb.org/3";

export async function tmdb(path, params = {}) {
  const token = process.env.TMDB_API_TOKEN;
  if (!token) throw new Error("TMDB_API_TOKEN absent. Copiez .env.example vers .env et renseignez votre token.");
  const url = new URL(BASE + path);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`TMDB ${response.status} sur ${path}: ${body.slice(0, 300)}`);
  }
  return response.json();
}

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
