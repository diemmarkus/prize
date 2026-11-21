// Fetches today's lowest Geizhals price for every watched product and appends it to
// data/prices/<id>.json. Run by .github/workflows/update-prices.yml every hour; each product is
// fetched at most once per (Vienna) day, so new products get a first price within the hour.
//
//   node scripts/update-prices.mjs            (reads the watch list from Firestore)
//   node scripts/update-prices.mjs a3587143   (just these ids, handy for trying the parser)
//
// The watch list is the public `watched` collection (ids and links only, nobody's account).
// Geizhals' robots.txt allows product pages; price-history pages (?phist=) are disallowed for
// bots, so we never request them and build the history ourselves, one price a day.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parsePage, canonicalUrl } from "./geizhals.mjs";

const PROJECT = "stonks-6ec1f";
const API_KEY = "AIzaSyAE-QjP0JxtyXLTkJsYwFyqGCMimFNjgFA"; // public web key, see js/firebase-config.js
const DIR = new URL("../data/prices/", import.meta.url);
const STATUS = new URL("../data/status.json", import.meta.url);
const UA = "prize-bot/1.0 (+https://github.com/diemmarkus/prize; personal price tracker, one request per product per day)";
const STALE_DAYS = 30; // stop fetching products nobody has opened in the app for this long

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna" }).format(new Date()); // YYYY-MM-DD
const daysAgo = (d) => (Date.parse(today) - Date.parse(d)) / 864e5;

async function watched() {
  const out = [];
  let token = "";
  do {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/watched?pageSize=300&key=${API_KEY}${token ? `&pageToken=${token}` : ""}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Firestore: HTTP ${res.status} ${await res.text()}`);
    const j = await res.json();
    for (const d of j.documents || []) {
      const f = d.fields || {};
      out.push({ id: d.name.split("/").pop(), url: f.url?.stringValue, name: f.name?.stringValue, lastSeen: f.lastSeen?.stringValue });
    }
    token = j.nextPageToken || "";
  } while (token);
  return out;
}

async function load(id) {
  try { return JSON.parse(await readFile(new URL(`${id}.json`, DIR), "utf8")); } catch { return null; }
}

async function fetchPage(url) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "text/html", "Accept-Language": "de-AT,de;q=0.9,en;q=0.5" }, redirect: "follow" });
    if (res.status === 429 || res.status >= 500) { await sleep(15000 * attempt); continue; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }
  throw new Error("Geizhals kept answering 429/5xx");
}

async function main() {
  const ids = process.argv.slice(2).filter((a) => /^a\d+$/.test(a));
  const list = ids.length ? ids.map((id) => ({ id, url: `https://geizhals.at/${id}.html` })) : await watched();
  await mkdir(DIR, { recursive: true });
  const status = { ran: new Date().toISOString(), checked: 0, updated: 0, failed: [] };

  for (const w of list) {
    const file = (await load(w.id)) || { id: w.id, history: [] };
    if (!ids.length) {
      if (file.history.some((h) => h.d === today) || file.lastTry === today) continue; // done for today
      if (w.lastSeen && daysAgo(w.lastSeen) > STALE_DAYS) continue;                    // removed or forgotten
    }
    const url = canonicalUrl(w.url) || `https://geizhals.at/${w.id}.html`;
    status.checked++;
    try {
      const html = await fetchPage(url);
      const p = parsePage(html);
      if (!p) throw new Error("no price found on the page");
      file.url = url;
      file.name = p.name || file.name || w.name || null;
      if (p.image) file.image = p.image;
      file.currency = "EUR";
      file.history = file.history.filter((h) => h.d !== today);
      file.history.push({ d: today, p: Math.round(p.price * 100) / 100, ...(p.offers ? { n: p.offers } : {}) });
      file.history.sort((a, b) => a.d.localeCompare(b.d));
      file.checked = new Date().toISOString();
      delete file.error; delete file.lastTry;
      status.updated++;
      console.log(`${w.id}: €${p.price} (${p.how}) ${file.name || ""}`);
    } catch (e) {
      file.error = String(e.message || e);
      file.lastTry = today; // try again tomorrow, not every hour
      status.failed.push({ id: w.id, error: file.error });
      console.warn(`${w.id}: ${file.error} (${url})`);
    }
    await writeFile(new URL(`${w.id}.json`, DIR), JSON.stringify(file, null, 1) + "\n");
    await sleep(4000); // be gentle
  }
  if (!ids.length && status.checked) await writeFile(STATUS, JSON.stringify(status, null, 1) + "\n");
  console.log(`checked ${status.checked}, updated ${status.updated}, failed ${status.failed.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
