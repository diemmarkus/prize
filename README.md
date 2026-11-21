# prize

Watch a price, buy at the right time. Paste a Geizhals link; prize saves the lowest Geizhals
price once a day, draws it over time and says **Buy now**, **Fair** or **Wait**.

Live: https://diemmarkus.github.io/prize/ · Demo with made-up prices: https://diemmarkus.github.io/prize/?demo

## Prototype

No accounts and no Firebase: your list lives in this browser (`localStorage["prize-list"]`).
Products and trips (with a travel date), any shop or booking link, and prices you log yourself.
On the first visit three samples with made-up prices are added (Märklin starter set, a flight
to Las Vegas in January, a rental car on Crete in June); "Remove samples" takes them out.

## Automatic Geizhals prices (paused)

`scripts/update-prices.mjs` and `.github/workflows/update-prices.yml` can save the lowest Geizhals
price of a product once a day into `data/prices/<id>.json`, which the app already shows. The
schedule is paused: Geizhals answers GitHub's servers with HTTP 403 (see `data/probe.json`), and
we don't work around a block. The job only requests product pages, never the price-history pages
(`?phist=`) that Geizhals' robots.txt disallows for bots.

```sh
node tests/parse.test.mjs
```
