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
the supplier cart" sends the whole order in one request
(`/Product/additems`, the call behind their own "add all" button), with
optional checkboxes to reset the amounts and delete the notes afterwards.
The supplier refuses such a batch as a whole over a single line it does not
like, so anything that does not come back accepted is retried on its own
(`/OrderConfirm/quickItemAdd`) to find out which product was the problem.
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

## Pricing

`/pricing` sets what we charge, on the same assortment items as the order
page but on its own screen. The model comes from the bar's old
"Prijsberekening" sheet (`src/lib/pricing/calc.ts`):

- **Cost per portion** = purchase price × (1 + VAT) ÷ (portions × (1 − loss)).
  The purchase price is Rust's catalog price (already net of the line
  discount) unless the item has a manual one; portions follow from the liters
  in a unit and in a portion, or are filled in directly for what isn't poured.
- **Advice**: the cost is marked up with the category's *base margin* while the
  price stays under its *pivot price*; the part of the cost above that only
  gets the lower *premium margin*, like tax brackets. Rounded to the setting
  (€ 0,10).
- **Price** is chosen by hand, inline in the table, with a button to take the
  advice. Every change is kept in `sale_price_changes`.

Pricing categories (margins, pivot price, loss, default VAT) and the settings
live under *Categories & settings*. Each item has a pricing category, a VAT
override, contents, alcohol percentage and a "not for sale" flag; the dialog
can read the contents from the supplier's description ("24/20CL", "FUST
20LT"). Items bought elsewhere (the rotating whisky) are added with *Other
supplier item*: they get a manual purchase price and also show on the order
page, where the review lists them to order by hand.

Rows are flagged when data is missing, the price is more than the tolerance
(10%) below the advice, the margin is below the premium margin, the cost per
portion moved since the price was last saved (save it again to accept), or
10 ml of alcohol is cheaper than in the reference drink (Queer Beer).

The sheet was imported once with
`npm run pricing:import -- Prijsberekening.xlsx` (dry run; add `--apply` to
write). It matches rows to items by article number within the same heading,
then by name, skips ARCHIEF, prefers the alcohol percentage from the
supplier's description, and refuses to run once pricing categories exist.

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
lines, the discount per line, what the discount saved and the total, both
excluding and including VAT; item numbers link through to the catalog. An
order also says when it is promised, and an invoice which order it came
from — the supplier only names that while the invoice is unpaid, so older
invoices do not have it.

An invoice or credit note also has its original PDF, one click from the
document page and from the outstanding list. The supplier only hands it to a
logged-in session, so it comes through `/api/documents/<number>` with ours.
Orders have no PDF until they are invoiced.

### Outstanding

`/financials/outstanding` is the supplier's own list of what is still unpaid
("openstaande posten"): invoices waiting to be paid, plus credit notes that
have not been settled against them, with what it adds up to and what is past
its due date. Amounts include VAT, unlike everywhere else. The list is
replaced on every document import, since entries simply disappear once they
are paid. Anything overdue also shows next to the section header, so you
notice it from any of these pages.

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

[`docs/dinonline-portal.md`](docs/dinonline-portal.md) is the reference for
that portal: how the session works, every endpoint we know of with its
fields, the quirks (a JSON endpoint answers 500 unless its own page was
loaded first) and what we deliberately leave alone. Read it before building
anything that talks to the supplier.

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
