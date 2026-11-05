import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");
const STATE = path.join(ROOT, "data", "state.json");
const LIMIT = Math.max(20, Number(process.env.CATALOG_LIMIT || 100));
const BASE_URL = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");

const catalogs = [
  ["movie", "nuvio-streaming-new-movies", "Nouveautés streaming — Films (France)", "nouveautes-films.json"],
  ["series", "nuvio-streaming-new-series", "Nouveautés streaming — Séries (France)", "nouveautes-series.json"],
  ["movie", "nuvio-streaming-canada-movies", "Sorties récentes — Films (Canada, VFQ possible)", "sorties-canada-films.json"],
  ["series", "nuvio-streaming-canada-series", "Sorties récentes — Séries (Canada, VFQ possible)", "sorties-canada-series.json"],
  ["movie", "nuvio-streaming-removed-movies", "Récemment retirés — Films (90 jours)", "retirements-films.json"],
  ["series", "nuvio-streaming-removed-series", "Récemment retirés — Séries (90 jours)", "retirements-series.json"],
  ["movie", "nuvio-streaming-trending-movies", "Tendances — Films disponibles en France", "tendances-films.json"],
  ["series", "nuvio-streaming-trending-series", "Tendances — Séries disponibles en France", "tendances-series.json"]
];

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}
function toMeta(item) {
  return {
    id: item.id,
    type: item.type,
    name: item.name,
    poster: item.poster || undefined,
    background: item.background || undefined,
    description: item.description || "",
    releaseInfo: item.releaseInfo || undefined,
    imdbRating: item.imdbRating || undefined,
    links: [{ name: "TMDB", category: "source", url: `https://www.themoviedb.org/${item.type === "movie" ? "movie" : "tv"}/${item.tmdbId}` }]
  };
}
function catalog(items, type) {
  return { metas: items.filter(x => x.type === type).slice(0, LIMIT).map(toMeta), cacheMaxAge: 10800, staleRevalidate: 3600, staleError: 86400 };
}

const state = JSON.parse(await fs.readFile(STATE, "utf8"));
const all = Object.values(state.items || {});
const added = (state.events || []).filter(e => e.action === "added");
const recentFR = added.filter(e => e.region === "FR").sort((a,b) => Date.parse(b.detectedAt)-Date.parse(a.detectedAt));
const recentCA = added.filter(e => e.region === "CA").sort((a,b) => Date.parse(b.detectedAt)-Date.parse(a.detectedAt));
const removed = (state.events || []).filter(e => e.action === "removed").sort((a,b) => Date.parse(b.detectedAt)-Date.parse(a.detectedAt));
const activeFR = all.filter(x => x.offers?.some(o => o.region === "FR"));
const trendingMovies = activeFR.filter(x => x.type === "movie").sort((a,b) => b.popularity-a.popularity);
const trendingSeries = activeFR.filter(x => x.type === "series").sort((a,b) => b.popularity-a.popularity);
const dataByFile = new Map([
  ["nouveautes-films.json", catalog(recentFR.filter(x=>x.type==="movie"), "movie")],
  ["nouveautes-series.json", catalog(recentFR.filter(x=>x.type==="series"), "series")],
  ["sorties-canada-films.json", catalog(recentCA.filter(x=>x.type==="movie"), "movie")],
  ["sorties-canada-series.json", catalog(recentCA.filter(x=>x.type==="series"), "series")],
  ["retirements-films.json", catalog(removed.filter(x=>x.type==="movie"), "movie")],
  ["retirements-series.json", catalog(removed.filter(x=>x.type==="series"), "series")],
  ["tendances-films.json", catalog(trendingMovies, "movie")],
  ["tendances-series.json", catalog(trendingSeries, "series")]
]);

for (const [type, id, , filename] of catalogs) {
  const file = dataByFile.get(filename);
  await writeJson(path.join(PUBLIC, "catalog", type, `${id}.json`), file);
}
for (const item of all) {
  const mediaType = item.type === "movie" ? "movie" : "series";
  await writeJson(path.join(PUBLIC, "meta", mediaType, `${item.id}.json`), { meta: toMeta(item) });
}
await writeJson(path.join(PUBLIC, "manifest.json"), {
  id: "org.nuvio.streaming.fr", version: "1.2.0", name: "Nuvio — Nouveautés FR + Canada",
  description: "Nouveautés et changements de disponibilité France et Canada via TMDB/JustWatch. Les offres canadiennes ne garantissent pas une piste VFQ.",
  resources: ["catalog", "meta"], types: ["movie", "series"],
  catalogs: catalogs.map(([type,id,name]) => ({ type, id, name, extra: [{ name: "search", isRequired: false }] })),
  idPrefixes: ["tmdb:movie:", "tmdb:tv:"], behaviorHints: { adult: false, p2p: false }
});
console.log(`Export statique terminé : ${catalogs.length} catalogues, ${all.length} fiches meta.`);
