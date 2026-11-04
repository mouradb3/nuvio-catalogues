import "dotenv/config";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { updateCatalogs } from "./update.js";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 7000);
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const INTERVAL = Math.max(1, Number(process.env.UPDATE_INTERVAL_HOURS || 3));
const app = express();
const catalogs = [
  ["movie","nuvio-streaming-new-movies","Nouveautés streaming — Films (France)","nouveautes-films.json"],
  ["series","nuvio-streaming-new-series","Nouveautés streaming — Séries (France)","nouveautes-series.json"],
  ["movie","nuvio-streaming-canada-movies","Sorties récentes — Films (Canada, VFQ possible)","sorties-canada-films.json"],
  ["series","nuvio-streaming-canada-series","Sorties récentes — Séries (Canada, VFQ possible)","sorties-canada-series.json"],
  ["movie","nuvio-streaming-removed-movies","Récemment retirés — Films (90 jours)","retirements-films.json"],
  ["series","nuvio-streaming-removed-series","Récemment retirés — Séries (90 jours)","retirements-series.json"],
  ["movie","nuvio-streaming-trending-movies","Tendances — Films disponibles en France","tendances-films.json"],
  ["series","nuvio-streaming-trending-series","Tendances — Séries disponibles en France","tendances-series.json"]
];
const fileById = Object.fromEntries(catalogs.map(c=>[c[1],c[3]]));
app.get("/", (_req,res)=>res.json({service:"Nuvio Streaming Nouveautés",manifest:`${BASE_URL}/manifest.json`}));
app.get("/health", (_req,res)=>res.json({ok:true,now:new Date().toISOString()}));
app.get("/manifest.json", (_req,res)=>res.json({
  id:"org.nuvio.streaming.fr",version:"1.1.0",name:"Nuvio — Nouveautés FR + Canada",
  description:"Nouveautés et changements de disponibilité France et Canada via TMDB/JustWatch. Les offres canadiennes ne garantissent pas une piste VFQ.",
  resources:["catalog","meta"],types:["movie","series"],
  catalogs:catalogs.map(([type,id,name])=>({type,id,name,extra:[{name:"search",isRequired:false}]})),
  idPrefixes:["tmdb:movie:","tmdb:tv:"],behaviorHints:{adult:false,p2p:false}
}));
app.get("/catalog/:type/:id.json",async(req,res)=>{
  const file=fileById[req.params.id]; if(!file)return res.status(404).json({metas:[]});
  try { const data=JSON.parse(await fs.readFile(path.join(ROOT,"public","catalogs",file),"utf8"));
    const search=String(req.query.search||"").trim().toLocaleLowerCase("fr");
    if(search)data.metas=data.metas.filter(m=>m.name.toLocaleLowerCase("fr").includes(search));
    res.set("Cache-Control","public, max-age=300, stale-while-revalidate=600").json(data);
  } catch {res.status(503).json({metas:[],error:"Catalogues pas encore générés. Relancer npm run update."});}
});
app.get("/meta/:type/:id.json",async(req,res)=>{
  const match=/^tmdb:(movie|tv):(\d+)$/.exec(req.params.id); if(!match)return res.status(404).json({meta:null});
  try {const state=JSON.parse(await fs.readFile(path.join(ROOT,"data","state.json"),"utf8"));
    const item=state.items[`${match[1]==="movie"?"movie":"tv"}:${match[2]}`]; if(!item)return res.status(404).json({meta:null});
    res.set("Cache-Control","public, max-age=3600").json({meta:{id:item.id,type:item.type,name:item.name,poster:item.poster||undefined,background:item.background||undefined,description:item.description||"",releaseInfo:item.releaseInfo||undefined,imdbRating:item.imdbRating||undefined,links:[{name:"TMDB",category:"source",url:`https://www.themoviedb.org/${item.type==="movie"?"movie":"tv"}/${item.tmdbId}`}]}});
  } catch {res.status(503).json({meta:null});}
});
app.get("/status.json",async(_req,res)=>{try{res.json(JSON.parse(await fs.readFile(path.join(ROOT,"public","status.json"),"utf8")));}catch{res.status(503).json({ok:false,message:"Pas encore mis à jour"});}});
app.listen(PORT,async()=>{
  console.log(`Addon Nuvio lancé sur ${BASE_URL}`);
  try{await updateCatalogs();}catch(e){console.error("Première mise à jour échouée:",e.message);}
  setInterval(async()=>{try{await updateCatalogs();}catch(e){console.error("Mise à jour échouée:",e.message);}},INTERVAL*3600000);
});
