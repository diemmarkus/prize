// prize — watch Geizhals prices, see them over time, buy at the right moment.
// Design follows Stonks' DESIGN.md (colours, type, rows that unfold, sheets, undo toasts).
// Prototype: the list lives in this browser (localStorage), no account.
import { localStore, samples, fetchStatus, today } from "./store.js";
import { articleId, canonicalUrl } from "../scripts/geizhals.mjs";
import { imprint, privacy } from "./legal.js";

const DAY = 864e5;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const parseD = (s) => new Date(s + "T12:00:00");

const ICON = {
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>',
  edit: '<path d="M11 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6"/><path d="M17.6 3.4a2 2 0 0 1 2.9 2.9L12 14.8 8 16l1.2-4Z"/>',
  check: '<path d="M5 12.5 10 17 19 7"/>', ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
};
const ico = (n, c = "i") => `<svg class="${c}" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;

/* ---------- state ---------- */
const ui = { user: undefined, store: null, items: null, prices: {}, status: null, open: null, edit: false, sheet: null, toast: null, info: false, showAll: false, error: null };
let unsub = null;

/* ---------- formatting ---------- */
function fmt(v, c = "EUR") {
  if (v == null || isNaN(v)) return "—";
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: c, minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(v);
}
const fmtS = (v, c) => (v > 0 ? "+" : v < 0 ? "−" : "") + fmt(Math.abs(v), c);
const pctS = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1) + "%";
function bigPrice(v) { const s = fmt(v), m = /^(.*?)([.,]\d\d)$/.exec(s); return m ? `${esc(m[1])}<small>${esc(m[2])}</small>` : esc(s); }
function relDate(iso) {
  const d = Math.round((parseD(today()) - parseD(iso)) / DAY);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  const dt = parseD(iso), same = dt.getFullYear() === parseD(today()).getFullYear();
  return dt.toLocaleDateString("en-GB", same ? { weekday: "short", day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" }).replace(",", "");
}
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return "shop"; } };
const timeOf = (iso) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
function blackFriday(y) { const d = new Date(y, 10, 1); return new Date(y, 10, 1 + ((4 - d.getDay() + 7) % 7) + 22); }
const autoId = (i) => i.auto || (/^a\d+$/.test(i.id) ? i.id : null); // where daily prices come from, if anywhere
const autoOf = (i) => (autoId(i) ? ui.prices[autoId(i)] : null);
const nameOf = (i) => i.name || autoOf(i)?.name || `Geizhals ${i.id}`;
const isTrip = (i) => i.kind === "trip";
const shortDate = (iso) => parseD(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: parseD(iso).getFullYear() === parseD(today()).getFullYear() ? undefined : "numeric" });
// Prices over time: the daily job's (if any) plus the ones you logged; one per day, yours win.
function hist(i) {
  const m = new Map();
  for (const h of autoOf(i)?.history || []) m.set(h.d, h);
  for (const l of i.log || []) m.set(l.d, { ...l, own: true });
  return [...m.values()].sort((a, b) => a.d.localeCompare(b.d));
}

/* ---------- buy signal ---------- */
function analyze(item) {
  const ps = hist(item), n = ps.length, reasons = [];
  const out = { n, reasons, score: null, cls: "none", label: "Waiting", title: "Waiting for the first price" };
  if (!n) { out.label = "No price"; out.title = "No price yet"; out.sub = isTrip(item) ? "Log the price you see when you check." : "Look it up on Geizhals and log the lowest price you see."; return out; }
  const vals = ps.map((p) => p.p), now = vals[n - 1], min = Math.min(...vals), max = Math.max(...vals), avg = vals.reduce((a, b) => a + b, 0) / n;
  Object.assign(out, { now, min, max, avg, first: vals[0], last: ps[n - 1] });
  out.label = "Collecting"; out.title = "Collecting prices";
  let score = 50, w = 0;
  if (n >= 3) {
    const pos = max > min ? (now - min) / (max - min) : 0.5;
    score += (0.5 - pos) * 60; w++;
    if (now <= min) reasons.push(`Lowest price since ${relDate(ps[0].d)}.`);
    else if (pos <= 0.25) reasons.push(`Near the low end of its range (${fmt(min)} – ${fmt(max)}).`);
    else if (pos >= 0.75) reasons.push(`Near the high end of its range; it has been ${fmt(min)}.`);
    else reasons.push(`Middle of its range (${fmt(min)} – ${fmt(max)}).`);
    const d = (avg - now) / avg;
    score += Math.max(-20, Math.min(20, d * 100));
    if (Math.abs(d) >= 0.03) reasons.push(`${Math.abs(d * 100).toFixed(0)}% ${d > 0 ? "below" : "above"} the average of ${fmt(avg)}.`);
    const prev = vals.slice(-4, -1), pm = prev.reduce((a, b) => a + b, 0) / prev.length, tr = (now - pm) / pm;
    if (isTrip(item) && tr > 0.02) { score = Math.max(score + 10, 50); out.rising = true; reasons.push("Going up. Trips rarely get cheaper once that starts."); }
    else if (!isTrip(item) && tr < -0.02) { score -= 8; reasons.push("Still falling; it may drop a bit further."); }
    else if (tr > 0.02) reasons.push("Went up in the last few days.");
  }
  if (item.target != null && item.target !== "" && !isNaN(item.target)) {
    w++;
    if (now <= item.target) { score = Math.max(score, 80) + 5; reasons.unshift(`At or below your target of ${fmt(+item.target)}.`); }
    else { score -= Math.min(15, ((now - item.target) / item.target) * 50); reasons.push(`${fmt(now - item.target)} above your target of ${fmt(+item.target)}.`); }
  }
  const t = parseD(today());
  if (isTrip(item) && item.date) {
    const dd = Math.round((parseD(item.date) - t) / DAY);
    if (dd < 0) reasons.push("The date has passed.");
    else if (dd <= 21) { score += 15; w++; reasons.push(`${dd} day${dd === 1 ? "" : "s"} to go; prices usually climb close to the date.`); }
    else if (dd <= 60) { score += 7; w++; reasons.push(`${dd} days to go, the window where prices tend to rise.`); }
    else reasons.push(`${dd} days to go, so there's time to watch.`);
  }
  let bf = blackFriday(t.getFullYear());
  if (bf < t - 4 * DAY) bf = blackFriday(t.getFullYear() + 1);
  const days = Math.round((bf - t) / DAY);
  if (isTrip(item)) {}
  else if (days > 0 && days <= 21) { score -= 15; w++; reasons.push(`Black Friday is in ${days} day${days === 1 ? "" : "s"} (${bf.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "")}); many things drop then.`); }
  else if (days >= -3 && days <= 0) { score += 8; reasons.push("It's Black Friday weekend, usually one of the best times to buy."); }
  if (n < 3 && !w) { out.sub = `${3 - n} more day${3 - n === 1 ? "" : "s"} of prices, or a target price, for a verdict.`; return out; }
  if (n < 3) reasons.push(`Only ${n} day${n === 1 ? "" : "s"} of prices so far; the verdict gets better every day.`);
  if (out.rising) score = Math.max(score, 50); // a rising trip: buying soon is at least fair
  score = Math.max(0, Math.min(100, score));
  out.score = score;
  if (score >= 68) Object.assign(out, { cls: "good", label: "Buy now", title: "Good time to buy" });
  else if (score >= 45) Object.assign(out, { cls: "mid", label: "Fair", title: "Fair price, no rush" });
  else Object.assign(out, { cls: "bad", label: "Wait", title: "Better wait" });
  out.sub = out.rising && out.cls !== "good" ? "Going up. If you're sure, waiting may cost more." : reasons[0];
  return out;
}

/* ---------- chart ---------- */
function chart(item, a) {
  const ps = hist(item);
  if (!ps.length) return "";
  if (ps.length === 1) return chartOne(item, ps[0]);
  const W = Math.round(Math.max(280, $("main").clientWidth)), H = 190, T = 20, B = 22, P = 18;
  const xs = ps.map((p) => parseD(p.d).getTime());
  const x0 = xs[0], x1 = xs[xs.length - 1] === x0 ? x0 + DAY : xs[xs.length - 1];
  const vals = ps.map((p) => p.p);
  if (item.target) vals.push(+item.target);
  let y0 = Math.min(...vals), y1 = Math.max(...vals);
  const pad = (y1 - y0) * 0.12 || y1 * 0.05 || 1; y0 -= pad; y1 += pad;
  const X = (t) => ((t - x0) / (x1 - x0)) * W, Y = (v) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const col = a.now <= a.first ? "var(--up)" : "var(--down)";
  // a step line: the price holds until the next day's check
  const pts = [];
  ps.forEach((p, i) => { if (i) pts.push([X(xs[i]), Y(ps[i - 1].p)]); pts.push([X(xs[i]), Y(p.p)]); });
  const line = pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" L");
  let g = `<defs><linearGradient id="fill-${item.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".22"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>`;
  g += `<path d="M${line} L${W},${H - B} L0,${H - B}Z" fill="url(#fill-${item.id})"/>`;
  g += `<path d="M${line}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round"/>`;
  if (item.target) { const ty = Y(+item.target); g += `<line x1="0" x2="${W}" y1="${ty}" y2="${ty}" stroke="var(--ink-3)" stroke-dasharray="4 4"/><text x="${W - P}" y="${ty - 6}" text-anchor="end">target ${esc(fmt(+item.target))}</text>`; }
  const clampX = (x) => Math.min(Math.max(x, P + 30), W - P - 30);
  if (a.max !== a.min) {
    const iMax = vals.indexOf(a.max), iMin = vals.indexOf(a.min);
    g += `<text x="${clampX(X(xs[iMax]))}" y="${Y(a.max) - 8}" text-anchor="middle">${esc(fmt(a.max))}</text>`;
    g += `<text x="${clampX(X(xs[iMin]))}" y="${Y(a.min) + 16}" text-anchor="middle">${esc(fmt(a.min))}</text>`;
  }
  g += `<circle cx="${W - 4}" cy="${Y(a.now)}" r="4" fill="${col}" stroke="var(--bg-2)" stroke-width="2"/>`;
  g += `<text x="${P}" y="${H - 5}">${esc(relDate(ps[0].d))}</text><text x="${W - P}" y="${H - 5}" text-anchor="end">${esc(relDate(ps[ps.length - 1].d))}</text>`;
  g += `<rect class="scrub" x="0" y="0" width="${W}" height="${H}" fill="transparent"/>`;
  return `<div class="chart" data-chart="${item.id}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Price over time">${g}</svg><div class="readout hint" id="ro-${item.id}">&nbsp;</div></div>`;
}

// One price so far: a flat line up to today's dot, the target if set, and a hint.
function chartOne(item, p) {
  const W = Math.round(Math.max(280, $("main").clientWidth)), H = 130, P = 18;
  const vals = [p.p].concat(item.target ? [+item.target] : []);
  let y0 = Math.min(...vals), y1 = Math.max(...vals);
  const pad = (y1 - y0) * 0.35 || y1 * 0.1 || 1; y0 -= pad; y1 += pad;
  const Y = (v) => 18 + (1 - (v - y0) / (y1 - y0)) * (H - 40);
  const y = Y(p.p);
  let g = `<line x1="0" x2="${W - 8}" y1="${y}" y2="${y}" stroke="var(--ink-3)" stroke-dasharray="2 5"/>`;
  if (item.target) { const ty = Y(+item.target); g += `<line x1="0" x2="${W}" y1="${ty}" y2="${ty}" stroke="var(--ink-3)" stroke-dasharray="4 4"/><text x="${P}" y="${ty - 6}">target ${esc(fmt(+item.target))}</text>`; }
  g += `<circle cx="${W - 8}" cy="${y}" r="5" fill="var(--accent)" stroke="var(--bg-2)" stroke-width="2"/>`;
  g += `<text x="${W - P - 4}" y="${y - 10}" text-anchor="end">${esc(fmt(p.p))}</text>`;
  g += `<text x="${P}" y="${H - 6}">First price · ${esc(relDate(p.d))}</text><text x="${W - P}" y="${H - 6}" text-anchor="end">log again on another day →</text>`;
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="First price">${g}</svg></div>`;
}

/* ---------- views ---------- */
function render() {
  const keep = captureInputs();
  let h = "";
  h = ui.store ? appHTML() : `<div class="boot">prize</div>`;
  if (ui.sheet) h += sheetHTML();
  if (ui.toast) h += `<div class="toast" role="status"><span>${esc(ui.toast.msg)}</span>${ui.toast.undo ? `<button class="toast__act" data-act="undo">Undo</button>` : ""}</div>`;
  $("#root").innerHTML = h;
  restoreInputs(keep);
}
function brandHTML(right = "") {
  return `<header class="top"><div class="brand">${ico("tag")}<span class="brand__word">pri<b>z</b>e</span></div><div class="right">${right}</div></header>`;
}
function footHTML() { return `<nav class="foot"><button data-act="legal" data-which="imprint">Imprint</button><button data-act="legal" data-which="privacy">Privacy</button><a href="https://github.com/diemmarkus/prize" target="_blank" rel="noopener">GitHub</a></nav>`; }
function landingHTML() {
  return `<section class="hero"><p class="eyebrow">Geizhals prices over time</p>
    <h1>Prices go <em>down.</em><br>Sometimes <em class="down">up.</em></h1>
    <p>Add something you want to buy, from Geizhals, a flight or a rental car, and log its price when you check. prize draws it over time and tells you when it's a good moment to buy.</p>
    <div class="actions"><button class="btn btn--primary" data-act="add">${ico("plus")}Add a product</button><button class="btn" data-act="samples">Add 3 samples</button></div></section>
    <ol class="steps"><li>Add a product or trip, with a link to where you'd buy it.</li><li>Add it here, optionally with the price you'd pay.</li><li>Log the price whenever you look. The verdict says Buy now, Fair or Wait.</li></ol>`;
}
function appHTML() {
  let h = brandHTML(`${ui.items?.length ? `<button class="icon-btn ${ui.edit ? "on" : ""}" data-act="edit-mode" aria-label="${ui.edit ? "Done" : "Edit list"}" aria-pressed="${ui.edit}">${ico(ui.edit ? "check" : "edit")}</button>` : ""}`);
  if (ui.items?.some((i) => i.sample)) h += `<div class="demo-bar"><span>Samples with one real price each, found on 21 Nov. Your list stays in this browser.</span><button data-act="clear-samples">Remove samples</button></div>`;
  if (ui.items === null) return h + `<div class="boot">Loading your list…</div>`;
  const items = ui.items;
  if (!items.length) return h + landingHTML() + footHTML();
  const rows = items.map((i) => ({ i, a: analyze(i) }));
  const rank = { good: 0, mid: 1, bad: 2, none: 3 };
  rows.sort((x, y) => rank[x.a.cls] - rank[y.a.cls] || (y.a.score ?? 0) - (x.a.score ?? 0) || nameOf(x.i).localeCompare(nameOf(y.i)));
  const good = rows.filter((r) => r.a.cls === "good").length;
  h += `<div class="page-head"><h1 class="page-title">Watchlist</h1><div class="page-meta">${items.length} item${items.length === 1 ? "" : "s"}${good ? `<br><b>${good} to buy now</b>` : ""}</div></div>`;
  h += `<div class="card ${ui.edit ? "editing" : ""}"><ul class="rows">${rows.map(({ i, a }) => rowHTML(i, a)).join("")}</ul></div>`;
  const st = ui.status;
  if (st?.ran && st.updated) h += `<div class="stamp"><i></i>Geizhals prices · checked ${esc(relDate(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna" }).format(new Date(st.ran))))} ${esc(timeOf(st.ran))}</div>`;
  return h + footHTML() + fab();
}
const fab = () => `<button class="fab" data-act="add" aria-label="Add a product">${ico("plus")}</button>`;
function rowHTML(i, a) {
  const open = ui.open === i.id;
  const tag = isTrip(i) ? `<span class="row__tag">${i.date ? esc(shortDate(i.date)) : "Trip"}</span>` : "";
  const sub = tag + (a.n ? `${esc(relDate(a.last.d))}${a.last.shop ? ` · ${esc(a.last.shop)}` : a.last.n ? ` · ${a.last.n} offers` : ""}` : "No price yet");
  return `<li class="${open ? "is-open" : ""}" data-li="${i.id}"><div class="rw"><div class="swipe-bg">Remove</div>
    <div class="row" data-row="${i.id}" tabindex="0" role="button" aria-expanded="${open}">
      ${ui.edit ? `<button class="del" data-remove="${i.id}" aria-label="Remove ${esc(nameOf(i))}">${ico("minus")}</button>` : ""}
      <div><div class="row__name">${esc(nameOf(i))}</div><div class="row__sub">${sub}</div></div>
      <div class="row__nums"><div class="row__price">${a.n ? esc(fmt(a.now)) : "—"}</div><span class="pill ${a.cls}">${esc(a.label)}</span></div>
    </div></div>${open ? openHTML(i, a) : ""}</li>`;
}
function openHTML(i, a) {
  const ps = hist(i).slice().reverse(), auto = autoOf(i);
  let h = `<div class="open ${ui.anim === i.id ? "anim" : ""}">`;
  ui.anim = null;
  if (a.n) {
    const chg = a.n > 1 ? a.now - a.first : 0;
    h += `<div class="quote"><span class="quote__price">${bigPrice(a.now)}</span>${chg ? `<span class="pill ${chg < 0 ? "good" : "bad"}">${esc(fmtS(chg))} · ${esc(pctS((chg / a.first) * 100))}</span>` : ""}</div>`;
  }
  h += `<div class="verdict"><div class="verdict__txt"><h3 class="${a.cls}">${esc(a.title)}</h3>${a.sub ? `<p>${esc(a.sub)}</p>` : ""}</div>
    ${a.reasons.length > 1 ? `<button class="info-btn" data-act="info" aria-expanded="${ui.info}" aria-label="Why">i</button>` : ""}</div>`;
  if (ui.info && a.reasons.length > 1) h += `<div class="note"><ul>${a.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div>`;
  if (autoId(i)) h += `<p class="hint">${auto?.history?.length ? `Daily prices: ${esc(auto.source || "price job")}${auto.checked ? ` · checked ${esc(relDate(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna" }).format(new Date(auto.checked))))}` : ""}` : "Daily prices: waiting for the first run of the price job"}${auto?.error ? ` · <span class="warn">last run: ${esc(auto.error)}</span>` : ""}</p>`;
  h += chart(i, a);
  if (a.n > 1) h += `<div class="stats"><div class="stat"><small>Lowest</small><b>${esc(fmt(a.min))}</b></div><div class="stat"><small>Average</small><b>${esc(fmt(a.avg))}</b></div><div class="stat"><small>${i.target ? "Target" : "Highest"}</small><b>${esc(fmt(i.target ? +i.target : a.max))}</b></div></div>`;
  const link = i.url || auto?.url;
  const buy = link ? { href: link, label: articleId(link) ? "Buy on Geizhals" : `${isTrip(i) ? "Book" : "Buy"} at ${host(link)}` }
    : !isTrip(i) ? { href: `https://geizhals.at/?fs=${encodeURIComponent(nameOf(i))}`, label: "Find on Geizhals" } : null;
  h += `<div class="actions">${buy ? `<a class="btn btn--primary btn--grow" href="${esc(buy.href)}" target="_blank" rel="noopener">${ico("ext")}${esc(buy.label)}</a>` : ""}
    <button class="btn" data-act="edit-item">${ico("edit")}Edit</button></div>`;
  h += `<form class="log" id="logForm"><span>Today</span><input class="input inline" id="logPrice" name="price" type="number" step="0.01" min="0" inputmode="decimal" placeholder="€" required aria-label="Price today">
    <span>at</span><input class="input inline wide" id="logShop" name="shop" placeholder="shop" aria-label="Shop" autocomplete="off">
    <button class="btn btn--primary" type="submit">Log</button></form>`;
  if (ps.length) {
    const show = ui.showAll ? ps : ps.slice(0, 5);
    h += `<ul class="history">${show.map((p, k) => {
      const prev = ps[k + 1], d = prev ? p.p - prev.p : 0;
      return `<li><div><div class="when">${esc(relDate(p.d))}</div>${p.shop ? `<div class="shop">${esc(p.shop)}</div>` : p.n ? `<div class="shop">${p.n} offers</div>` : ""}</div>
        <div class="p">${esc(fmt(p.p))}${d ? `<span class="chg ${d > 0 ? "up" : "down"}">${esc(fmtS(d))}</span>` : ""}</div>
        ${p.own ? `<button class="x-sm" data-delp="${p.d}" aria-label="Delete this price">${ico("x")}</button>` : "<span></span>"}</li>`;
    }).join("")}</ul>`;
    if (ps.length > 5) h += `<button class="fold" data-act="more">${ui.showAll ? "Show less ▴" : `${ps.length - 5} more days ▾`}</button>`;
  }
  return h + `</div>`;
}
function sheetHTML() {
  const s = ui.sheet;
  if (s.type === "legal") {
    const doc = s.which === "imprint" ? imprint() : privacy();
    return sheetWrap(doc.title, `<div class="legal">${doc.sections.map((x) => `<h3>${esc(x.h)}</h3>${(x.p || []).map((p) => `<p>${esc(p)}</p>`).join("")}${x.list ? `<ul>${x.list.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}`).join("")}</div>`);
  }
  const it = s.item, isNew = !s.editing, trip = isTrip(it);
  return `<div class="sheet" role="dialog" aria-modal="true" aria-label="${isNew ? "Add" : "Edit"}"><div class="sheet__backdrop" data-act="close"></div><div class="sheet__panel"><div class="sheet__grip"></div>
    <form id="itemForm" class="form">
      <div class="sheet__head"><h2 class="sheet__title">${isNew ? "Add" : "Edit"}</h2>
        <div class="btns"><button class="btn btn--primary" type="submit">${isNew ? "Add" : "Save"}</button><button type="button" class="icon-btn" data-act="close" aria-label="Close">${ico("x")}</button></div></div>
      <div class="switch" role="radiogroup">${[["product", "Product"], ["trip", "Trip"]].map(([k, l]) => `<button type="button" role="radio" aria-checked="${(it.kind || "product") === k}" data-kind="${k}">${l}</button>`).join("")}</div>
      <label class="field"><span class="field__label">What</span><input class="input" id="fName" name="name" value="${esc(it.name || "")}" placeholder="${trip ? "Flight Vienna → Las Vegas" : "Märklin starter set"}" autocomplete="off"></label>
      <div class="sentence">${trip ? `On <input class="input inline wide" id="fDate" name="date" type="date" value="${esc(it.date || "")}" aria-label="Travel date">, ` : ""}I'd pay <input class="input inline" id="fTarget" name="target" type="number" step="0.01" min="0" inputmode="decimal" value="${esc(it.target ?? "")}" placeholder="€" aria-label="Target price"></div>
      <label class="field"><span class="field__label">Link <em>· ${trip ? "booking page, optional" : "Geizhals or shop page, optional"}</em></span><input class="input input--mono" id="fUrl" name="url" type="url" inputmode="url" value="${esc(it.url || "")}" placeholder="https://" autocomplete="off"><span class="hint" id="urlHint"></span></label>
      ${isNew ? "" : `<button type="button" class="btn btn--danger" data-remove="${it.id}">Remove from watchlist</button>`}
    </form></div></div>`;
}
const sheetWrap = (title, body) => `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="sheet__backdrop" data-act="close"></div><div class="sheet__panel"><div class="sheet__grip"></div>
  <div class="sheet__head"><h2 class="sheet__title">${esc(title)}</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">${ico("x")}</button></div>${body}</div></div>`;

function captureInputs() { const o = {}; document.querySelectorAll("input[id]").forEach((e) => (o[e.id] = e.value)); const a = document.activeElement; return { o, focus: a && a.id, sel: a && a.selectionStart }; }
function restoreInputs(k) {
  for (const id in k.o) { const e = document.getElementById(id); if (e && !e.value) e.value = k.o[id]; }
  if (k.focus) { const e = document.getElementById(k.focus); if (e) { e.focus(); try { if (k.sel != null) e.setSelectionRange(k.sel, k.sel); } catch {} } }
}

/* ---------- data ---------- */
async function loadPrices(items) {
  await Promise.all(items.filter((i) => autoId(i) && !(autoId(i) in ui.prices)).map(async (i) => { ui.prices[autoId(i)] = (await ui.store.prices(autoId(i))) || null; }));
  render();
}
async function useStore(store) {
  if (unsub) { try { unsub(); } catch {} unsub = null; }
  ui.store = store; ui.items = null; ui.prices = {}; ui.open = null; ui.edit = false;
  const m = /^#p-(a\d+)$/.exec(location.hash || ""); if (m) ui.open = m[1];
  render();
  unsub = await store.subscribe((items, err) => {
    if (err) { ui.items = []; toast("Couldn't load your list. Check your connection."); return; }
    ui.items = items; render(); loadPrices(items);
    store.touch(items).catch(() => {});
  });
  fetchStatus().then((s) => { ui.status = s; render(); });
}

/* ---------- actions ---------- */
let toastTimer;
function toast(msg, undo) { clearTimeout(toastTimer); ui.toast = { msg, undo }; render(); toastTimer = setTimeout(() => { ui.toast = null; render(); }, 5000); }
function setOpen(id) {
  ui.open = ui.open === id ? null : id; ui.anim = ui.open; ui.info = false; ui.showAll = false;
  try { history.replaceState(null, "", ui.open ? "#p-" + ui.open : location.pathname + location.search); } catch {}
  render();
  if (ui.open) document.querySelector(`[data-li="${ui.open}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
async function removeItem(id) {
  const it = ui.items.find((i) => i.id === id); if (!it) return;
  if (ui.open === id) ui.open = null;
  ui.sheet = null;
  ui.items = ui.items.filter((i) => i.id !== id); // show it gone right away
  if (!ui.items.length) ui.edit = false;
  toast(`Removed ${nameOf(it)}`, () => ui.store.save(it));
  try { await ui.store.remove(id); } catch (e) { console.warn(e); toast("Couldn't remove it. Try again."); }
}
function openAdd() { ui.sheet = { type: "item", item: {} }; render(); setTimeout(() => $("#fUrl")?.focus(), 60); }

let swallowClick = false;
document.addEventListener("click", async (e) => {
  if (swallowClick) { swallowClick = false; e.preventDefault(); return; }
  const t = e.target.closest("[data-act],[data-row],[data-remove],[data-delp],[data-kind]");
  if (!t) return;
  if (t.dataset.remove) { e.stopPropagation(); removeItem(t.dataset.remove); return; }
  if (t.dataset.kind) {
    const f = $("#itemForm"), d = Object.fromEntries(new FormData(f));
    Object.assign(ui.sheet.item, { name: d.name, target: d.target, url: d.url, date: d.date ?? ui.sheet.item.date, kind: t.dataset.kind });
    render(); return;
  }
  if (t.dataset.row) { if (!ui.edit) setOpen(t.dataset.row); return; }
  if (t.dataset.delp) {
    const it = ui.items.find((i) => i.id === ui.open), before = it.log || [];
    const upd = { ...it, log: before.filter((l) => l.d !== t.dataset.delp) };
    await ui.store.save(upd);
    toast("Price deleted", () => ui.store.save({ ...upd, log: before }));
    return;
  }
  switch (t.dataset.act) {
    case "samples": for (const x of samples()) if (!ui.items.some((i) => i.id === x.id)) await ui.store.save(x); break;
    case "clear-samples": { const gone = ui.items.filter((i) => i.sample); for (const x of gone) await ui.store.remove(x.id); ui.open = null; toast("Samples removed", async () => { for (const x of gone) await ui.store.save(x); }); break; }
    case "add": openAdd(); break;
    case "edit-item": { const it = ui.items.find((i) => i.id === ui.open); ui.sheet = { type: "item", editing: true, item: { ...it } }; render(); break; }
    case "legal": ui.sheet = { type: "legal", which: t.dataset.which }; render(); break;
    case "close": ui.sheet = null; render(); break;
    case "edit-mode": ui.edit = !ui.edit; if (ui.edit) ui.open = null; render(); break;
    case "info": ui.info = !ui.info; render(); break;
    case "more": ui.showAll = !ui.showAll; render(); break;
    case "undo": { const u = ui.toast?.undo; clearTimeout(toastTimer); ui.toast = null; render(); if (u) await u(); break; }
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && ui.sheet) { ui.sheet = null; render(); return; }
  const r = e.target.dataset?.row;
  if (r && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setOpen(r); }
});
document.addEventListener("input", (e) => {
  if (e.target.id !== "fUrl") return;
  const v = e.target.value.trim(), h = $("#urlHint"), id = articleId(v);
  h.className = "hint " + (id ? "ok" : "");
  h.textContent = id ? `✓ Geizhals article ${id}` : "";
});
document.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (e.target.id === "logForm") {
    const d = Object.fromEntries(new FormData(e.target)), p = parseFloat(d.price);
    if (isNaN(p)) return;
    const it = ui.items.find((i) => i.id === ui.open), t = today();
    ["logPrice", "logShop"].forEach((id) => { const x = document.getElementById(id); if (x) x.value = ""; });
    await ui.store.save({ ...it, log: (it.log || []).filter((l) => l.d !== t).concat({ d: t, p: Math.round(p * 100) / 100, ...(d.shop?.trim() ? { shop: d.shop.trim() } : {}) }) });
    return;
  }
  if (e.target.id !== "itemForm") return;
  const d = Object.fromEntries(new FormData(e.target)), s = ui.sheet;
  const target = d.target === "" || d.target == null ? null : parseFloat(d.target);
  const raw = (d.url || "").trim(), gid = articleId(raw), url = gid ? canonicalUrl(raw) : raw;
  const name = (d.name || "").trim(), kind = s.item.kind || "product";
  if (!name && !gid) { $("#fName")?.focus(); return; }
  let item;
  if (s.editing) item = { ...s.item, kind, name, target, url, ...(kind === "trip" ? { date: d.date || "" } : { date: undefined }) };
  else {
    const id = gid || "x" + Math.random().toString(36).slice(2, 9);
    if (ui.items.some((i) => i.id === id)) { ui.sheet = null; setOpen(id); toast("Already on your list"); return; }
    item = { id, kind, url, name, target, addedAt: today(), log: [], ...(kind === "trip" ? { date: d.date || "" } : {}) };
  }
  ui.sheet = null; ui.open = item.id; ui.edit = false; ui.info = false;
  try { history.replaceState(null, "", "#p-" + item.id); } catch {}
  ui.items = ui.items.filter((i) => i.id !== item.id).concat(item);
  render();
  try { await ui.store.save(item); if (autoId(item)) loadPrices([item]); }
  catch (err) { console.warn(err); toast("Couldn't save. Check your connection and try again."); }
});

/* chart readout: touch or hover shows the price of that day */
document.addEventListener("pointermove", (e) => {
  const c = e.target.closest?.("[data-chart]"); if (!c) return;
  const it = ui.items?.find((i) => i.id === c.dataset.chart), ps = it && hist(it); if (!ps?.length) return;
  const r = c.getBoundingClientRect(), f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  const t0 = parseD(ps[0].d).getTime(), t1 = parseD(ps[ps.length - 1].d).getTime(), t = t0 + f * (t1 - t0);
  let p = ps[0]; for (const q of ps) if (parseD(q.d).getTime() <= t + DAY / 2) p = q;
  const ro = document.getElementById("ro-" + it.id); if (ro) ro.textContent = `${relDate(p.d)} · ${fmt(p.p)}${p.n ? ` · ${p.n} offers` : ""}`;
});

/* swipe left to remove (as in MoneTrip) */
let sw = null;
document.addEventListener("pointerdown", (e) => { const r = e.target.closest(".row"); if (!r || e.target.closest("button,a,input")) return; sw = { r, x: e.clientX, y: e.clientY, dx: 0, on: false, bg: r.parentElement.querySelector(".swipe-bg") }; });
document.addEventListener("pointermove", (e) => {
  if (!sw) return;
  const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
  if (!sw.on) { if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.3 && dx < 0) { sw.on = true; sw.r.classList.add("dragging"); } else if (Math.abs(dy) > 10) { sw = null; return; } else return; }
  sw.dx = Math.min(0, dx); sw.r.style.transform = `translateX(${sw.dx}px)`; sw.bg.style.opacity = Math.min(1, -sw.dx / 80);
});
function endSwipe() {
  if (!sw) return;
  const { r, dx, on, bg } = sw; sw = null; if (!on) return;
  swallowClick = true; setTimeout(() => (swallowClick = false), 300);
  r.classList.remove("dragging");
  if (-dx > r.offsetWidth * 0.33) { r.style.transform = "translateX(-110%)"; setTimeout(() => removeItem(r.dataset.row), 180); }
  else { r.style.transform = ""; bg.style.opacity = 0; }
}
document.addEventListener("pointerup", endSwipe);
document.addEventListener("pointercancel", endSwipe);
window.addEventListener("resize", () => { if (ui.open) render(); });

/* ---------- start ---------- */
useStore(localStore());
