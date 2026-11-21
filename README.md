# prize

Watch a price, buy at the right time. Paste a Geizhals link; prize saves the lowest Geizhals
price once a day, draws it over time and says **Buy now**, **Fair** or **Wait**.

Live: https://diemmarkus.github.io/prize/ · Demo with made-up prices: https://diemmarkus.github.io/prize/?demo

## How it works

| Part | What it does |
|---|---|
| `index.html`, `css/`, `js/` | The app (plain ES modules, no build). Design follows Stonks' `DESIGN.md`. |
| `js/store.js` | Your watch list in Firestore `users/{uid}/prize/{articleId}`, plus the public `watched/{articleId}` list. Also the demo store. |
| `scripts/update-prices.mjs` | Reads `watched`, fetches each Geizhals product page at most once a day, appends the lowest price to `data/prices/<id>.json`. |
| `.github/workflows/update-prices.yml` | Runs the script every hour and commits new prices. |
| `scripts/geizhals.mjs` | Article id from a link, price from a page (JSON-LD, then microdata, then `gh_price`). |
| `firestore.rules` | Shared with Stonks (same Firebase project `stonks-6ec1f`). Paste into Firebase console → Firestore → Rules. |

Being a good citizen: one request per product per day, an honest user agent, and no requests
to Geizhals' price-history pages (`?phist=`), which their robots.txt disallows for bots.
Products nobody opened for 30 days are no longer fetched.

## Try the parser

```sh
node tests/parse.test.mjs
node scripts/update-prices.mjs a3587143   # fetch one product by hand
```
