// Where your watch list lives (prototype): this browser's localStorage, key "prize-list".
// Prices you log are kept with each item; prices from the (paused) daily job would come from data/prices/<id>.json.

export const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna" }).format(new Date());

const LIST_KEY = "prize-list";
export function localStore() {
  let items = [], cb = () => {};
  try { const saved = localStorage.getItem(LIST_KEY); items = saved ? JSON.parse(saved) : samples(); } catch { items = samples(); }
  // replace the old made-up samples, keep the user's own items
  const crete = items.find((i) => i.id === "s-crete" && i.sample === 2 && !(i.log || []).length);
  if (crete) Object.assign(crete, samples().find((x) => x.id === "s-crete"));
  if (items.some((i) => i.sample === true)) {
    const fresh = samples().filter((x) => items.some((i) => i.id === x.id && i.sample === true));
    items = items.filter((i) => i.sample !== true).concat(fresh);
    try { localStorage.setItem(LIST_KEY, JSON.stringify(items)); } catch {}
  }
  const persist = () => { try { localStorage.setItem(LIST_KEY, JSON.stringify(items)); } catch {} cb(items.slice()); };
  return {
    kind: "local",
    async subscribe(f) { cb = f; f(items.slice()); return () => {}; },
    async save(item) { const i = items.findIndex((x) => x.id === item.id); if (i >= 0) items[i] = item; else items.push(item); persist(); },
    async remove(id) { items = items.filter((i) => i.id !== id); persist(); },
    async touch() {},
    prices: (id) => fetchPrices(id),
  };
}

async function fetchPrices(id) {
  try {
    const res = await fetch(`data/prices/${id}.json?t=${Math.floor(Date.now() / 6e5)}`, { cache: "no-cache" });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}
export async function fetchStatus() {
  try {
    const res = await fetch(`data/status.json?t=${Math.floor(Date.now() / 6e5)}`, { cache: "no-cache" });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

/* ---------- samples (first visit) ---------- */
// Three examples with real prices found on the web on 21 Nov 2026 (one price each, so the graph
// starts there). Marked sample: true, version 2 (older made-up samples are replaced on load).
export function samples() {
  return [
    { id: "s-maerklin", kind: "product", sample: 2, name: "Märklin 29890 Digital-Startpackung Güterzug mit BR 89.0", url: "", target: 210, addedAt: "2026-11-21",
      log: [{ d: "2026-11-21", p: 226.72, shop: "Geizhals.de lowest" }] },
    { id: "s-vegas", kind: "trip", sample: 2, name: "Flight Vienna → Las Vegas, 15–29 Jan", date: "2027-01-15", url: "", target: 600, addedAt: "2026-11-21",
      log: [{ d: "2026-11-21", p: 651, shop: "SAS, 1+ stops" }] },
    // billiger-mietwagen.de price barometer: June 2027 at €56.20 (median of the lowest search prices,
    // read as per day) × 7 days.
    { id: "s-crete", kind: "trip", sample: 2, name: "Car rental Crete, Heraklion airport (1 week)", date: "2027-06-12", url: "https://www.billiger-mietwagen.de/mietwagen-flughafen-heraklion.html", target: 300, addedAt: "2026-11-21",
      log: [{ d: "2026-11-21", p: 393.4, shop: "billiger-mietwagen, 7 × €56.20" }] },
  ];
}
