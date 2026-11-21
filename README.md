# prize

Watch a price, buy at the right time. Paste a Geizhals link; prize saves the lowest Geizhals
price once a day, draws it over time and says **Buy now**, **Fair** or **Wait**.

Live: https://diemmarkus.github.io/prize/ · Demo with made-up prices: https://diemmarkus.github.io/prize/?demo

## Prototype

No accounts and no Firebase: your list lives in this browser (`localStorage["prize-list"]`).
Products and trips (with a travel date), any shop or booking link, and prices you log yourself.
On the first visit three samples with made-up prices are added (Märklin starter set, a flight
to Las Vegas in January, a rental car on Crete in June); "Remove samples" takes them out.

## Automatic prices

`data/watch.json` lists what the daily job (`.github/workflows/update-prices.yml`, 05:23 Vienna)
fetches into `data/prices/<id>.json`. An item in the app points at one with its `auto` field and
shows that history merged with the prices you log.

| Source | Secret | What you get |
|---|---|---|
| `keepa` | `KEEPA_API_KEY` | Amazon price history (the past year on the first run), lower of Amazon and other new offers per day |
| `travelpayouts` | `TRAVELPAYOUTS_TOKEN` | Cheapest round trip for the dates, found by Aviasales users in the last 48 h; one price a day |

Geizhals is not used: it answers GitHub's servers with HTTP 403, and its robots.txt disallows the
price-history pages for bots. `scripts/geizhals.mjs` is still used by the app to recognise links.

```sh
node tests/parse.test.mjs
KEEPA_API_KEY=… node scripts/update-prices.mjs --only k-maerklin-29890
```
