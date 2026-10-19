# Inventory Manager

Next.js app for our Rust Food supplier catalog, assortment and ordering.

## Setup

```bash
npm install
cp .env.example .env   # fill in SUPPLIER_USERNAME / SUPPLIER_PASSWORD
npm run db:migrate
npm run dev
```

Then press **Import products** on http://localhost:3000.

## Assortment and ordering

`/assortment` is the bar's own list, grouped into categories that double as
headings. Walking around the stock, you raise the amount per item with the
+/− buttons; every change saves on its own and a bar at the bottom shows how
many items and roughly what it costs. Items are edited by tapping their name:
name, category, target, an optional note, and the link to a catalog product
(searchable, with images). Items can be archived and restored.

Each category also takes quick note lines (the note button next to its
heading) for jotting something down while walking around. "Rearrange" turns
the list into drag handles for reordering items, notes and whole categories;
moving an item to another category happens in its form.

A target is the desired stock in the supplier's sales unit, shown big next to
the +/− buttons as a reference while ordering.

"Review" (in the bar at the bottom) opens `/assortment/review`: notes and
products without a usable catalog link are listed on top as things to handle
yourself, followed by everything that goes into the supplier cart. "Add all to
the supplier cart" posts each line to `/OrderConfirm/quickItemAdd`, with
optional checkboxes to reset the amounts and delete the notes afterwards.
Amounts are only reset for lines that were actually accepted, notes only when
the whole order went through, and the order is refused when the list changed
while you were reviewing. Placing the order itself still happens at Rust Food.

The Google Sheets export was imported once with
`npm run assortment:import -- <file.csv>` (skips ARCHIEF, order amounts start
at zero). That script refuses to run when the assortment already has data.

Items the supplier has no photo for can get an image of our own: the edit
form searches Open Food Facts and Open Products Facts (free product databases,
no key needed) using the supplier's product name, which works better than our
own short label. Pick a result and it is downloaded, resized and stored with
the item; a link can also be pasted. Setting `SERPER_API_KEY` adds a general image
search (Google results through [serper.dev](https://serper.dev), 2500 free
queries, no card) whose results are shown first, because they match the
product better than the databases do. Google's own Custom Search JSON API is
closed to new customers since 2026, so `GOOGLE_CSE_KEY`/`GOOGLE_CSE_ID` only
work for accounts that already had access. Repeated searches are cached for
15 minutes.

Every row in the catalog (`/products`, and the import detail pages) also has a
cart button for a one-off order: pick an amount and it goes straight into the
supplier cart, without touching the assortment.

## Line discounts (regelkorting)

The supplier shows the line discount nowhere before ordering: the catalog JSON
has no discount fields and the cart quotes the full price. It appears as soon
as an order exists, in two places with the same shape:

| Source | Endpoint | When |
| --- | --- | --- |
| Open orders | `/Document/GetOrderDetails/<no>` | Right after ordering |
| Posted invoices | `/Document/GetPostedDocumentDetails/PostedInvoices/<no>` | Weeks later |
| Credit notes | `/Document/GetPostedDocumentDetails/PostedCreditMemos/<no>` | With a refund |

Both carry `Line_Discount_Percent` and `Amount` (the "regeltotaal", net of the
discount). **Import invoices & orders** on the imports page reads invoices
(newest first, in batches, continuing where it left off) and re-reads the open
orders every run, since those still change. An order that has been invoiced
drops out of the open list and its rows are removed, leaving the invoice as
the authority.

The discount shown per product is the one on its most recent line, whether
that is an open order or an invoice.
Products we never ordered stay "unknown". Note that the catalog price is the
price *after* this discount: comparing recent invoices with the catalog, the
catalog matches the net price and never the gross. The discount therefore says
where we have an agreement, not that something extra comes off at checkout.
The discount per unit stays constant while the percentage moves with the
price.

`npm run supplier:invoices -- --batch 250` does the same from the command line.
Both document endpoints answer with an error unless their own page has been
loaded in the same session first, which the service handles.

## Rust Financials

Everything that comes from Rust Food's own bookkeeping sits behind one nav
entry, since it is secondary to ordering: purchase history, invoices and
orders.

The section header says how much has been imported and how far it runs, with
the import button right there, so you can check and top it up from the pages
that use the data. (It is also still on the imports page.)

`/financials/invoices` lists the posted invoices and credit notes, searchable
by document number or by what is on them (searching "fireball" gives every
invoice that product is on). `/financials/orders` does the same for orders
that have not been invoiced yet. Both open a document page with all its
lines, the discount per line, what the discount saved and the total; item
numbers link through to the catalog.

### Purchase History

`/financials/purchase-history` totals what we bought per year from the imported invoices and
credit notes: number of invoices, products, units and the amount, plus the
date of the last invoice in that year so you can tell whether a year is
complete. Picking a year lists its products with units, the average unit price plus what
a unit cost on the first and the last document of that year (so you can see
which way it moved), the line discount on the last document of that year
(with how it moved since the first one) and when it was last bought. Prices are what we actually paid, net of the
discount. Any
of those columns sorts the list; it opens on spend, highest first.

Clicking a product opens every document it appears on, with the quantity,
price, discount and line total per document. Documents where the price or the
discount moved against the one before are highlighted, with an arrow on the
figure that changed, so the handful of moments that matter stand out. It opens on the selected year and switches to all
years in one click. Document numbers link straight to the invoice.

Credit notes count against the totals. Orders that are not invoiced yet are
left out, so a recent order only shows up once its invoice arrives. Deposits
on crates and kegs ("emballage") are excluded by default, with a toggle to
count them and a column showing what they came to. Amounts exclude VAT.

## Supplier import

The supplier webshop (DIN Online, `b2b-rustfood.dinonline.nl`) has no API. The
import logs in like a browser (`src/lib/supplier/auth-service.ts`) and pages
through the catalog's DataTables endpoint (`src/lib/supplier/catalog-service.ts`),
1000 rows per request.

Each import records which products are new, which prices changed and which
products disappeared from the catalog. Products are never deleted, only marked
removed. Partial imports (a row limit or an unreadable row) never mark anything
removed.

| Command | |
| --- | --- |
| `npm run supplier:import` | Same as the button |
| `npm run supplier:import -- --limit 50` | Only the first 50 rows, for testing |
| `npm run supplier:probe -- 5 [start]` | Dump a few raw rows to `data/probe.json` |

`SUPPLIER_IMPORT_LIMIT` and `SUPPLIER_PAGE_SIZE` in `.env` also cap the button's import.

## Product images

The supplier only serves images to a logged-in session, so they are proxied
through `/api/product-images/[itemNo]` and cached in the database (a small
webp thumbnail plus the original). Requests never wait on the supplier: an image that
isn't cached yet gets a `202` while it is fetched in the background, and the
page picks it up on a retry. Products the supplier has no image for are
recorded in the database and render an icon without any request.

Both the thumbnail and the larger version are re-encoded to webp before they
are stored (96px and 500px), because the large one only feeds a 256px preview:
roughly 10 KB per product instead of the 250 KB PNG the supplier serves. Our
own images are resized the same way on download.

| Command | |
| --- | --- |
| `npm run supplier:images` | Pre-fetch images for our assortment (4 at a time) |
| `npm run supplier:images -- --catalog` | The whole catalog, ~33 MB of database |
| `npm run images:compact` | Report on oversized cached images; `-- --apply` rewrites them |

## Deploying to Vercel

The app is prepared for Vercel: pages that read the database render per
request, the catalog import and cart calls get `maxDuration = 60`, product
images are cached in the database instead of on disk (serverless has no
persistent filesystem), and background image fetching uses `after()` so it
survives the response.

Access is protected by HTTP basic auth in `src/proxy.ts`: set `APP_PASSWORD`
and the browser asks for it once. Without that variable the app is open, which
is fine locally but never when hosted.

1. Create a database at [turso.tech](https://turso.tech) and copy its URL
   (`libsql://…`) plus an auth token.
2. Point your local `.env` at it temporarily and run `npm run db:migrate` to
   create the tables there.
3. Push this repository to GitHub and import it in Vercel.
4. Set the environment variables in Vercel: `SUPPLIER_USERNAME`,
   `SUPPLIER_PASSWORD`, `APP_PASSWORD`, `DATABASE_URL`, `DATABASE_AUTH_TOKEN`.
5. Deploy, open the app, log in and press **Import products**.

Migrations are not run automatically; after a schema change run
`npm run db:migrate` with the Turso variables in your environment.

## Database

SQLite through libSQL + Drizzle, stored in `data/app.db`. For hosting, point
`DATABASE_URL`/`DATABASE_AUTH_TOKEN` at a Turso database; no code changes
needed. Cached images live in the database too, so a fully warmed catalog adds
roughly 150–200 MB.

| Command | |
| --- | --- |
| `npm run db:generate` | Create a migration after changing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:studio` | Browse the database |
