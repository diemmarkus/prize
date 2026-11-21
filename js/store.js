// Where your watch list lives (prototype): this browser's localStorage, key "prize-list".
// Prices you log are kept with each item; prices from the (paused) daily job would come from data/prices/<id>.json.

export const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna" }).format(new Date());

const LIST_KEY = "prize-list";
export function localStore() {
  let items = [], cb = () => {};
  try { const saved = localStorage.getItem(LIST_KEY); items = saved ? JSON.parse(saved) : samples(); } catch { items = samples(); }
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
// Three made-up examples so the graphs have something to show. Marked sample: true.
function rnd(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }
function fakeLog({ seed, days, from, to, noise, dip }) {
  const r = rnd(seed), t = Date.parse(today()), out = [];
  for (let k = days; k >= 0; k -= 1 + Math.floor(r() * 3)) { // checked every 1–3 days
    const f = 1 - k / days;
    let p = from + (to - from) * f + (r() - 0.5) * noise;
    if (dip && k <= dip) p *= 0.93;
    out.push({ d: new Date(t - k * 864e5).toISOString().slice(0, 10), p: Math.round(p) - (r() < 0.5 ? 0.01 : 0) });
  }
  if (out[out.length - 1].d !== today()) out.push({ d: today(), p: Math.round(to) });
  return out;
}
export function samples() {
  return [
    { id: "s-maerklin", kind: "product", sample: true, name: "Märklin starter set", url: "", target: 249, addedAt: today(),
      log: fakeLog({ seed: 11, days: 58, from: 309, to: 279, noise: 14, dip: 4 }) },
    { id: "s-vegas", kind: "trip", sample: true, name: "Flight Vienna → Las Vegas", date: "2027-01-22", url: "", target: 750, addedAt: today(),
      log: fakeLog({ seed: 23, days: 40, from: 742, to: 868, noise: 40 }) },
    { id: "s-crete", kind: "trip", sample: true, name: "Car rental Crete (1 week)", date: "2027-06-12", url: "", target: 280, addedAt: today(),
      log: fakeLog({ seed: 37, days: 26, from: 355, to: 331, noise: 18 }) },
  ];
}
