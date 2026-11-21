// Where your watch list lives.
//  - Signed in: Firestore users/{uid}/prize/{id}  (private, covered by the users/{uid}/** rule)
//    plus the public `watched/{id}` list the daily GitHub Action reads (link and product name only).
//  - Demo: this browser's localStorage, with made-up price histories.
import { getDb } from "./firebase.js";

export const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna" }).format(new Date());

export function firebaseStore(uid) {
  let fs;
  const ready = getDb().then((x) => (fs = x));
  const col = () => fs.collection(fs.db, "users", uid, "prize");
  return {
    kind: "firebase",
    async subscribe(cb) {
      await ready;
      return fs.onSnapshot(col(), (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => { console.warn(e); cb(null, e); });
    },
    async save(item) {
      await ready;
      const { id, ...data } = item;
      await Promise.all([
        fs.setDoc(fs.doc(col(), id), data),
        fs.setDoc(fs.doc(fs.db, "watched", id), { url: item.url, name: item.name || "", lastSeen: today() }, { merge: true }),
      ]);
    },
    async remove(id) { await ready; await fs.deleteDoc(fs.doc(col(), id)); },
    // Tells the daily job these products are still wanted (it skips ones nobody opened for 30 days).
    async touch(items) {
      await ready;
      const key = "prize-seen", t = today();
      let seen = {};
      try { seen = JSON.parse(localStorage.getItem(key) || "{}"); } catch {}
      const due = items.filter((i) => seen[i.id] !== t);
      await Promise.all(due.map((i) => fs.setDoc(fs.doc(fs.db, "watched", i.id), { url: i.url, name: i.name || "", lastSeen: t }, { merge: true }).catch(() => {})));
      due.forEach((i) => (seen[i.id] = t));
      try { localStorage.setItem(key, JSON.stringify(seen)); } catch {}
    },
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

/* ---------- demo ---------- */
const DEMO_KEY = "prize-demo";
const DEMO = [
  { id: "a3587143", url: "https://geizhals.at/apple-airpods-pro-3-generation-mfhp4zm-a-a3587143.html", name: "Apple AirPods Pro 3", target: 199, base: 249, drift: -0.0025, noise: 9 },
  { id: "a1000001", url: "https://geizhals.at/a1000001.html", name: "Espresso machine", target: 450, base: 529, drift: -0.004, noise: 14 },
  { id: "a1000002", url: "https://geizhals.at/a1000002.html", name: "Märklin starter set", target: null, base: 189, drift: 0.0012, noise: 6 },
];
function rnd(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }
function fakeHistory(d) {
  const r = rnd(parseInt(d.id.slice(1), 10) % 100000 + 7), out = [];
  const t = Date.parse(today());
  let p = d.base;
  for (let k = 60; k >= 0; k--) {
    p = Math.max(d.base * 0.6, p * (1 + d.drift) + (r() - 0.5) * d.noise * 0.6);
    if (k === 6) p *= 0.94; // a small Black Friday-ish drop
    out.push({ d: new Date(t - k * 864e5).toISOString().slice(0, 10), p: Math.round(p) - 0.01 * (r() < 0.5 ? 1 : 10), n: 20 + Math.round(r() * 30) });
  }
  return out;
}
export function demoStore() {
  let items, cb = () => {};
  try { items = JSON.parse(localStorage.getItem(DEMO_KEY) || "null"); } catch {}
  items ||= DEMO.map(({ id, url, name, target }) => ({ id, url, name, target, addedAt: today() }));
  const persist = () => { try { localStorage.setItem(DEMO_KEY, JSON.stringify(items)); } catch {} cb(items.slice()); };
  return {
    kind: "demo",
    async subscribe(f) { cb = f; f(items.slice()); return () => {}; },
    async save(item) { items = items.filter((i) => i.id !== item.id).concat(item); persist(); },
    async remove(id) { items = items.filter((i) => i.id !== id); persist(); },
    async touch() {},
    async prices(id) {
      const d = DEMO.find((x) => x.id === id) || { id, base: 80 + (parseInt(id.slice(1), 10) % 400), drift: -0.001, noise: 5 };
      const it = items.find((i) => i.id === id);
      return { id, url: it?.url, name: d.name || null, currency: "EUR", history: fakeHistory(d), checked: new Date().toISOString() };
    },
    reset() { try { localStorage.removeItem(DEMO_KEY); } catch {} },
  };
}
