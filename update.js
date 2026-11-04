import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tmdb, sleep } from "./tmdb.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const PUBLIC = path.join(ROOT, "public");
const STATE_FILE = path.join(DATA, "state.json");
const MAX_PAGES = Math.max(1, Number(process.env.MAX_PAGES_PER_TYPE || 5));
const HISTORY_DAYS = 90;
const LOOKBACK_DAYS = Math.max(90, Number(process.env.DISCOVERY_DAYS || 180));
const LIMIT = Math.max(20, Number(process.env.CATALOG_LIMIT || 100));
const REGIONS = ["FR", "CA"];
const MONETIZATION = ["flatrate", "rent", "buy", "free", "ads"];
const now = () => new Date().toISOString();
const iso = d => d.toISOString().slice(0, 10);
const todayISO = iso(new Date());
const fromISO = iso(new Date(Date.now() - LOOKBACK_DAYS * 86400000));

async function readState() {
  try { return JSON.parse(await fs.readFile(STATE_FILE, "utf8")); }
  catch { return { version: 2, items: {}, events: [], lastRun: null, bootstrapped: false }; }
}
async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await fs.rename(tmp, file);
}
async function discover(type, region, page) {
  const movie = type === "movie";
  const endpoint = movie ? "/discover/movie" : "/discover/tv";
  const dateParams = movie
    ? { "primary_release_date.gte": fromISO, "primary_release_date.lte": todayISO }
    : { "first_air_date.gte": fromISO, "first_air_date.lte": todayISO };
  return tmdb(endpoint, {
    language: "fr-FR", region, watch_region: region,
    with_watch_monetization_types: MONETIZATION.join("|"),
    include_adult: "false", sort_by: movie ? "primary_release_date.desc" : "first_air_date.desc",
    page, ...dateParams
  });
}
function baseMeta(type, item) {
  const movie = type === "movie";
  const id = `tmdb:${movie ? "movie" : "tv"}:${item.id}`;
  const name = movie ? item.title : item.name;
  const release = movie ? item.release_date : item.first_air_date;
  return {
    id, type: movie ? "movie" : "series", name,
    poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
    background: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
    description: item.overview || "",
    releaseInfo: (release || "").slice(0, 4),
    imdbRating: item.vote_average ? String(Number(item.vote_average.toFixed(1))) : undefined,
    tmdbId: item.id, mediaType: type,
    releaseDate: release || null, popularity: item.popularity || 0
  };
}
async function getOffers(type, id, region) {
  const route = type === "movie" ? `/movie/${id}/watch/providers` : `/tv/${id}/watch/providers`;
  const data = await tmdb(route);
  const result = data.results?.[region];
  if (!result) return [];
  const offers = [];
  for (const kind of MONETIZATION) {
    for (const p of result[kind] || []) offers.push({
      region, providerId: p.provider_id, provider: p.provider_name,
      monetization: kind
    });
  }
  return offers;
}
function offerKey(o) { return `${o.region}:${o.providerId}:${o.monetization}`; }
function addEvent(state, event) {
  state.events.push({ ...event, detectedAt: now() });
}
async function scanType(type, state, bootstrap) {
  const found = new Map();
  for (const region of REGIONS) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const data = await discover(type, region, page);
      for (const item of data.results || []) {
        const k = String(item.id);
        if (!found.has(k)) found.set(k, item);
      }
      if (page >= (data.total_pages || 1) || page >= MAX_PAGES) break;
      await sleep(220);
    }
  }
  let checked = 0, detected = 0;
  for (const item of found.values()) {
    const key = `${type}:${item.id}`;
    const old = state.items[key];
    const meta = baseMeta(type, item);
    const previousOffers = old?.offers || [];
    const previousKeys = new Set(previousOffers.map(offerKey));
    const currentOffers = [];
    const successfulRegions = new Set();
    for (const region of REGIONS) {
      try {
        const offers = await getOffers(type, item.id, region);
        currentOffers.push(...offers);
        successfulRegions.add(region);
      } catch (e) {
        console.error(`Offres ${region} ${type}/${item.id}: ${e.message}`);
        // Une panne API ne doit jamais être interprétée comme un retrait d'offre.
        currentOffers.push(...previousOffers.filter(o => o.region === region));
      }
      await sleep(180);
    }
    checked++;
    const currentKeys = new Set(currentOffers.map(offerKey));
    if (!bootstrap) {
      for (const offer of currentOffers) {
        if (!previousKeys.has(offerKey(offer))) {
          addEvent(state, { action: "added", ...meta, ...offer }); detected++;
        }
      }
      for (const offer of previousOffers) {
        if (successfulRegions.has(offer.region) && !currentKeys.has(offerKey(offer))) {
          addEvent(state, { action: "removed", ...meta, ...offer }); detected++;
        }
      }
    }
    state.items[key] = {
      ...meta, firstSeen: old?.firstSeen || now(), offers: currentOffers,
      lastChecked: now(), lastAvailableAt: currentOffers.length ? now() : old?.lastAvailableAt || null
    };
  }
  console.log(`${type}: ${found.size} titres, ${checked} vérifiés, ${detected} changements d'offres`);
}
function toMeta(item) {
  return {
    id: item.id, type: item.type, name: item.name,
    poster: item.poster || undefined, background: item.background || undefined,
    description: item.description || "", releaseInfo: item.releaseInfo || undefined,
    imdbRating: item.imdbRating || undefined,
    links: [{ name: "TMDB", category: "source", url: `https://www.themoviedb.org/${item.type === "movie" ? "movie" : "tv"}/${item.tmdbId}` }]
  };
}
function catalog(items, type) {
  return { metas: items.filter(x => x.type === type).slice(0, LIMIT).map(toMeta), cacheMaxAge: 10800, staleRevalidate: 3600, staleError: 86400 };
}
export async function updateCatalogs() {
  await fs.mkdir(DATA, { recursive: true }); await fs.mkdir(PUBLIC, { recursive: true });
  const state = await readState();
  const bootstrap = !state.bootstrapped;
  await scanType("movie", state, bootstrap);
  await scanType("tv", state, bootstrap);

  const cutoff = Date.now() - HISTORY_DAYS * 86400000;
  state.events = (state.events || []).filter(e => Date.parse(e.detectedAt) >= cutoff);
  const all = Object.values(state.items);
  const added = state.events.filter(e => e.action === "added");
  const recentFR = added.filter(e => e.region === "FR").sort((a,b) => Date.parse(b.detectedAt)-Date.parse(a.detectedAt));
  const recentCA = added.filter(e => e.region === "CA").sort((a,b) => Date.parse(b.detectedAt)-Date.parse(a.detectedAt));
  const removed = state.events.filter(e => e.action === "removed").sort((a,b) => Date.parse(b.detectedAt)-Date.parse(a.detectedAt));
  const activeFR = all.filter(x => x.offers?.some(o => o.region === "FR"));
  const activeCA = all.filter(x => x.offers?.some(o => o.region === "CA"));
  const trendingMovies = activeFR.filter(x => x.type === "movie").sort((a,b)=>b.popularity-a.popularity);
  const trendingSeries = activeFR.filter(x => x.type === "series").sort((a,b)=>b.popularity-a.popularity);
  const outputs = [
    ["nouveautes-films.json", catalog(recentFR.filter(x=>x.type==="movie"), "movie")],
    ["nouveautes-series.json", catalog(recentFR.filter(x=>x.type==="series"), "series")],
    ["sorties-canada-films.json", catalog(recentCA.filter(x=>x.type==="movie"), "movie")],
    ["sorties-canada-series.json", catalog(recentCA.filter(x=>x.type==="series"), "series")],
    ["retirements-films.json", catalog(removed.filter(x=>x.type==="movie"), "movie")],
    ["retirements-series.json", catalog(removed.filter(x=>x.type==="series"), "series")],
    ["tendances-films.json", catalog(trendingMovies, "movie")],
    ["tendances-series.json", catalog(trendingSeries, "series")]
  ];
  for (const [file, data] of outputs) await writeJson(path.join(PUBLIC, "catalogs", file), data);
  state.lastRun = now(); state.bootstrapped = true; state.version = 2;
  await writeJson(STATE_FILE, state);
  await writeJson(path.join(PUBLIC, "status.json"), {
    lastRun: state.lastRun, trackedTitles: all.length, events90Days: state.events.length,
    franceActiveTitles: activeFR.length, canadaActiveTitles: activeCA.length,
    bootstrap, note: "Date de détection locale, pas date officielle de mise en ligne. Les offres CA signalent une disponibilité au Canada, pas la présence garantie d'une piste audio québécoise."
  });
  console.log(`Catalogues générés. ${all.length} titres suivis, ${state.events.length} événements conservés 90 jours.`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await updateCatalogs();
