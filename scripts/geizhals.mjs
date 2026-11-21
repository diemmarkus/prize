// Reading a Geizhals product page: the article id from a link, and the lowest price from the HTML.
// Shared by scripts/update-prices.mjs and tests/parse.test.mjs.

// "https://geizhals.at/apple-airpods-pro-3-generation-mfhp4zm-a-a3587143.html" → "a3587143"
// "https://geizhals.de/3587143" → "a3587143"
export function articleId(link) {
  let u;
  try { u = new URL(String(link).trim()); } catch { return null; }
  if (!/(^|\.)geizhals\.(at|de|eu)$/.test(u.hostname)) return null;
  const m = /-a(\d{3,10})\.html$/.exec(u.pathname) || /^\/a?(\d{3,10})(\.html)?\/?$/.exec(u.pathname);
  return m ? "a" + m[1] : null;
}

// Always the Austrian site, so prices are what you'd pay in Austria.
export function canonicalUrl(link) {
  const id = articleId(link);
  if (!id) return null;
  const u = new URL(String(link).trim());
  const path = /-a\d+\.html$/.test(u.pathname) ? u.pathname : `/${id}.html`;
  return `https://geizhals.at${path}`;
}

const num = (s) => {
  if (s == null) return null;
  if (typeof s === "number") return s;
  s = String(s).replace(/[^\d.,]/g, "");
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", "."); // 1.234,56
  else s = s.replace(/,/g, "");                                       // 1234.56
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const decode = (s) => String(s || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").trim();

function* jsonLd(html) {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    let data;
    try { data = JSON.parse(m[1].trim()); } catch { continue; }
    const stack = [data];
    while (stack.length) {
      const x = stack.pop();
      if (!x || typeof x !== "object") continue;
      if (Array.isArray(x)) { stack.push(...x); continue; }
      yield x;
      if (x["@graph"]) stack.push(x["@graph"]);
    }
  }
}

// Returns { price, offers, name, image, how } or null. `how` says which part of the page the price came from.
export function parsePage(html) {
  let name = null, image = null;
  for (const x of jsonLd(html)) {
    const type = [].concat(x["@type"] || []).join(",");
    if (!/Product/i.test(type)) continue;
    name ||= x.name ? decode(x.name) : null;
    image ||= [].concat(x.image || [])[0] || null;
    const offers = [].concat(x.offers || []);
    for (const o of offers) {
      const price = num(o.lowPrice ?? o.price);
      if (price) return { price, offers: Number(o.offerCount) || null, name, image: typeof image === "string" ? image : null, how: "json-ld" };
    }
  }
  name ||= decode((/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i.exec(html) || [])[1]) || null;
  image ||= (/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i.exec(html) || [])[1] || null;
  const meta = /itemprop=["']lowPrice["'][^>]*content=["']([^"']+)/i.exec(html) || /content=["']([^"']+)["'][^>]*itemprop=["']lowPrice["']/i.exec(html);
  if (meta && num(meta[1])) return { price: num(meta[1]), offers: null, name, image, how: "microdata" };
  const gh = /class=["'][^"']*\bgh_price\b[^"']*["'][^>]*>\s*(?:<[^>]+>\s*)*(?:€|&euro;|EUR)?\s*([\d.]+,\d{2})/i.exec(html);
  if (gh && num(gh[1])) return { price: num(gh[1]), offers: null, name, image, how: "gh_price" };
  return null;
}
