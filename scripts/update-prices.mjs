// Daily prices for everything in data/watch.json, written to data/prices/<id>.json.
// Run by .github/workflows/update-prices.yml. Keys stay in GitHub Secrets, never in the browser.
//
//   KEEPA_API_KEY=… TRAVELPAYOUTS_TOKEN=… node scripts/update-prices.mjs
//   node scripts/update-prices.mjs --only k-maerklin-29890
//
// Sources (official APIs only):
//  - keepa:          Amazon price history (Keepa API). The first run brings the full past year.
//  - travelpayouts:  cheapest round trip for given dates found by Aviasales users in the last 48 h
//                    (Aviasales Data API). One price per day; the history builds up from today.
// Geizhals is not used: it answers GitHub's servers with HTTP 403, and we don't work around that.

import { readFile, writeFile, mkdir } from "node:fs/promises";

const DIR = new URL("../data/prices/", import.meta.url);
const WATCH = new URL("../data/watch.json", import.meta.url);
const STATUS = new URL("../data/status.json", import.meta.url);
const dayOf = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna" }).format(d);
const today = dayOf(new Date());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round2 = (n) => Math.round(n * 100) / 100;

async function readJson(url, fallback) { try { return JSON.parse(await readFile(url, "utf8")); } catch { return fallback; } }

async function getJson(url, label) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const text = await res.text();
    let body; try { body = JSON.parse(text); } catch { body = null; }
    if (res.status === 429) { // Keepa: not enough tokens yet
      const wait = Math.min(15 * 60e3, (body?.refillIn ?? 60e3) + 2e3);
      console.log(`${label}: waiting ${Math.round(wait / 1000)} s for tokens`);
      await sleep(wait); continue;
    }
    if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${text.slice(0, 200)}`);
    return body;
  }
  throw new Error(`${label}: still rate limited`);
}

/* ---------- Keepa (Amazon) ---------- */
// csv[0] = Amazon's own offer, csv[1] = new offers from other sellers; pairs of
// [keepaMinutes, priceInCents], -1 = no offer. keepaMinutes count from 2011-01-01 UTC.
const KEEPA_DOMAIN = { com: 1, "co.uk": 2, de: 3, fr: 4, it: 8, es: 9 };
const keepaTime = (m) => new Date((m + 21564000) * 60000);

// One price per day (the lower of Amazon and other new offers), kept only where it changed.
export function keepaDaily(csv, days = 365, end = today) {
  const series = [csv?.[0], csv?.[1]].filter(Array.isArray).map((a) => {
    const pts = [];
    for (let i = 0; i + 1 < a.length; i += 2) pts.push([dayOf(keepaTime(a[i])), a[i + 1]]);
    return pts;
  });
  if (!series.length || !series.some((s) => s.length)) return [];
  const first = series.flat().map((p) => p[0]).sort()[0];
  const startMs = Math.max(Date.parse(first + "T12:00:00Z"), Date.parse(end + "T12:00:00Z") - days * 864e5);
  const out = [];
  for (let t = startMs; ; t += 864e5) {
    const d = new Date(t).toISOString().slice(0, 10);
    if (d > end) break;
    const vals = series.map((pts) => { let v = -1; for (const [pd, pv] of pts) { if (pd <= d) v = pv; else break; } return v; }).filter((v) => v > 0);
    if (vals.length) out.push({ d, p: round2(Math.min(...vals) / 100) });
  }
  return out.filter((h, i) => i === 0 || i === out.length - 1 || h.p !== out[i - 1].p);
}

async function keepa(w, file) {
  const key = process.env.KEEPA_API_KEY;
  if (!key) throw new Error("KEEPA_API_KEY is not set");
  const domain = KEEPA_DOMAIN[w.domain || "de"];
  let asin = w.asin || file.asin;
  if (!asin) {
    const s = await getJson(`https://api.keepa.com/search?key=${key}&domain=${domain}&type=product&term=${encodeURIComponent(w.search)}`, `${w.id} search`);
    const hit = (s.products || []).find((p) => !w.match || (p.title || "").includes(w.match));
    if (!hit) throw new Error(`no Amazon product matching "${w.match}"; candidates: ${(s.products || []).slice(0, 5).map((p) => `${p.asin} ${p.title}`).join(" | ")}`);
    asin = hit.asin;
    console.log(`${w.id}: found ${asin} ${hit.title}`);
  }
  const r = await getJson(`https://api.keepa.com/product?key=${key}&domain=${domain}&asin=${asin}&history=1&days=365`, `${w.id} product`);
  const p = r.products?.[0];
  if (!p) throw new Error(`Keepa returned no product for ${asin}`);
  const history = keepaDaily(p.csv);
  if (!history.length) throw new Error("no price in the last year (out of stock on Amazon?)");
  const tld = Object.keys(KEEPA_DOMAIN).find((k) => KEEPA_DOMAIN[k] === domain);
  return { asin, name: p.title || w.name, url: `https://www.amazon.${tld}/dp/${asin}`, source: "Amazon via Keepa", history };
}

/* ---------- Travelpayouts / Aviasales (flights) ---------- */
async function travelpayouts(w, file) {
  const token = process.env.TRAVELPAYOUTS_TOKEN;
  if (!token) throw new Error("TRAVELPAYOUTS_TOKEN is not set");
  const q = (dep, ret) => `https://api.travelpayouts.com/aviasales/v3/prices_for_dates?origin=${w.origin}&destination=${w.destination}&departure_at=${dep}&return_at=${ret}&currency=eur&sorting=price&direct=false&one_way=false&limit=30&page=1&token=${token}`;
  let r = await getJson(q(w.depart, w.return), w.id);
  let exact = true;
  let offers = (r?.data || []).filter((o) => o.price > 0);
  if (!offers.length) { // nobody searched exactly these dates lately: same months, dates within 3 days
    exact = false;
    r = await getJson(q(w.depart.slice(0, 7), w.return.slice(0, 7)), w.id);
    const gap = (o) => Math.abs(Date.parse(o.departure_at) - Date.parse(w.depart)) + Math.abs(Date.parse(o.return_at) - Date.parse(w.return));
    offers = (r?.data || []).filter((o) => o.price > 0 && gap(o) <= 6 * 864e5);
  }
  if (!offers.length) throw new Error("no cached prices for these dates in the last 48 h");
  const o = offers.sort((a, b) => a.price - b.price)[0];
  const stops = o.transfers ? `${o.transfers} stop${o.transfers > 1 ? "s" : ""}` : "direct";
  const entry = { d: today, p: round2(o.price), shop: [o.airline, stops, exact ? null : `${o.departure_at.slice(5, 10)}→${o.return_at.slice(5, 10)}`].filter(Boolean).join(" · ") };
  const history = (file.history || []).filter((h) => h.d !== today).concat(entry).sort((a, b) => a.d.localeCompare(b.d));
  return { name: w.name, url: o.link ? `https://www.aviasales.com${o.link}` : file.url, source: "Aviasales (Travelpayouts)", history };
}

const SOURCES = { keepa, travelpayouts };

async function main() {
  const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
  const watch = (await readJson(WATCH, [])).filter((w) => !only || w.id === only);
  await mkdir(DIR, { recursive: true });
  const status = { ran: new Date().toISOString(), updated: 0, failed: [] };
  for (const w of watch) {
    const url = new URL(`${w.id}.json`, DIR);
    const file = await readJson(url, { id: w.id, history: [] });
    try {
      const fn = SOURCES[w.source];
      if (!fn) throw new Error(`unknown source ${w.source}`);
      Object.assign(file, await fn(w, file), { id: w.id, currency: "EUR", checked: new Date().toISOString() });
      delete file.error;
      status.updated++;
      const last = file.history[file.history.length - 1];
      console.log(`${w.id}: €${last.p} (${file.history.length} price points)`);
    } catch (e) {
      file.error = String(e.message || e);
      status.failed.push({ id: w.id, error: file.error });
      console.warn(`${w.id}: ${file.error}`);
    }
    await writeFile(url, JSON.stringify(file, null, 1) + "\n");
  }
  await writeFile(STATUS, JSON.stringify(status, null, 1) + "\n");
  console.log(`updated ${status.updated}, failed ${status.failed.length}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
