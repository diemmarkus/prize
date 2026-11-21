// node tests/parse.test.mjs — checks link parsing and the three ways a price is read from a page.
import assert from "node:assert/strict";
import { articleId, canonicalUrl, parsePage } from "../scripts/geizhals.mjs";

assert.equal(articleId("https://geizhals.at/apple-airpods-pro-3-generation-mfhp4zm-a-a3587143.html"), "a3587143");
assert.equal(articleId("https://geizhals.at/apple-airpods-pro-3-generation-mfhp4zm-a-a3587143.html?hloc=at&v=e"), "a3587143");
assert.equal(articleId("https://geizhals.de/3587143"), "a3587143");
assert.equal(articleId("https://geizhals.eu/a3587143.html"), "a3587143");
assert.equal(articleId("https://example.com/-a3587143.html"), null);
assert.equal(articleId("not a link"), null);
assert.equal(canonicalUrl("https://geizhals.de/sony-wh-1000xm6-a3456789.html?x=1"), "https://geizhals.at/sony-wh-1000xm6-a3456789.html");
assert.equal(canonicalUrl("https://geizhals.de/3587143"), "https://geizhals.at/a3587143.html");

const ld = `<html><script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Apple AirPods Pro 3. Generation","image":["https://gzhls.at/i/1.jpg"],
  "offers":{"@type":"AggregateOffer","lowPrice":"209.00","highPrice":"279.00","offerCount":"57","priceCurrency":"EUR"}}</script></html>`;
assert.deepEqual(parsePage(ld), { price: 209, offers: 57, name: "Apple AirPods Pro 3. Generation", image: "https://gzhls.at/i/1.jpg", how: "json-ld" });

const graph = `<script type="application/ld+json">{"@graph":[{"@type":"BreadcrumbList"},{"@type":["Product"],"name":"X","offers":[{"@type":"Offer","price":1299.5}]}]}</script>`;
assert.equal(parsePage(graph).price, 1299.5);

const micro = `<meta property="og:title" content="Sony WH-1000XM6 &amp; Case"><span itemprop="lowPrice" content="379.00"></span>`;
assert.deepEqual(parsePage(micro), { price: 379, offers: null, name: "Sony WH-1000XM6 & Case", image: null, how: "microdata" });

const gh = `<div><span class="gh_price">€ 1.234,56</span></div>`;
assert.equal(parsePage(gh).price, 1234.56);
assert.equal(parsePage(`<span class="price gh_price"><span>&euro; 99,90</span></span>`).price, 99.9);

assert.equal(parsePage("<html>Bitte bestätigen Sie, dass Sie kein Roboter sind</html>"), null);
console.log("parse tests passed");

// Keepa: minutes since 2011-01-01 UTC, cents, -1 = no offer; lower of Amazon and other new offers per day
const { keepaDaily } = await import("../scripts/update-prices.mjs");
const km = (iso) => Date.parse(iso + "T08:00:00Z") / 60000 - 21564000;
const csv = [[km("2026-11-01"), 24999, km("2026-11-10"), -1, km("2026-11-15"), 22999], [km("2026-11-05"), 23999]];
assert.deepEqual(keepaDaily(csv, 365, "2026-11-20"), [
  { d: "2026-11-01", p: 249.99 }, { d: "2026-11-05", p: 239.99 }, { d: "2026-11-15", p: 229.99 }, { d: "2026-11-20", p: 229.99 },
]);
console.log("keepa tests passed");
