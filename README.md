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

Every row in the catalog (`/products`, and the import detail pages) also has a
cart button for a one-off order: pick an amount and it goes straight into the
supplier cart, without touching the assortment.

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

`npm run supplier:images` pre-fetches images (4 at a time) so browsing never
waits; `-- --limit 100` for a smaller run.

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
