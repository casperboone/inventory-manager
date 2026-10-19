# The DIN Online portal (Rust Food)

Everything this app knows about `b2b-rustfood.dinonline.nl`, the webshop we
order from. There is no API: the app logs in like a browser and talks to the
endpoints the portal's own pages use. This file is the reference to read
before adding anything that touches the supplier — it records what exists,
what the fields mean and which quirks will bite.

**Never place an order from here.** Adding to the supplier cart is fine (the
review screen does it), but `/OrderConfirm/PlaceOrder` — "Order plaatsen" —
is off limits, and test lines are removed again right away.

## Session

`src/lib/supplier/auth-service.ts` does the login the browser does:

1. `GET /Login`, scrape `__RequestVerificationToken` out of the HTML.
2. `POST /Login` with that token plus `Login.UserName` / `Login.Password`
   (from `.env`).
3. Success is a `.ASPXAUTH` cookie, nothing else. The response body is not a
   reliable signal.

`src/lib/supplier/session.ts` keeps one logged-in `HttpClient` (a cookie jar
plus `get`/`postForm`) on `globalThis`, shared by every request, so pages and
imports reuse one session. An expired session is not an error: the portal
redirects to `/Login`, so a response whose final URL starts with `/login`
means "log in again and retry once" (`isLoginRedirect`).

### Priming: the quirk that costs the most time

**Most JSON endpoints answer 500, or an HTML error page, unless the page they
belong to was loaded in the same session first.** The portal keeps per-page
state server side. So before calling e.g. `/Document/GetPostedDocuments/…`,
`GET /Document/PostedDocuments/PostedInvoices` once. `invoice-service.ts`
tracks which pages a session has primed in a `WeakMap` and primes on demand;
the map is cleared when the session is re-established.

Symptom to recognise: a request that works in the browser's network tab and
500s from here, or that answers with HTML starting in `<`.

### Request shapes

| Shape | How |
| --- | --- |
| List endpoints | jQuery DataTables server-side POST, form-encoded: `draw`, `columns[i][data|name|searchable|orderable|search][…]`, `order[0][column|dir]`, `start`, `length`, `search[value|regex]`. Answers `{draw, recordsTotal, recordsFiltered, data: [...]}`. |
| Detail endpoints | plain `GET`, answering a bare JSON array of lines. |
| Actions | form-encoded POST, answering `{"Success":true,…}`. `/Product/additems` is the exception: it takes a JSON body. |

Headers that matter: `x-requested-with: XMLHttpRequest`, a `referer` pointing
at the owning page, and `origin` on POSTs. Without them some endpoints answer
a login page instead.

The columns in a DataTables POST are a formality — the portal returns the
full row object whatever you ask for — but sending the same ones its own page
sends is the safe default.

## Endpoints

### Catalog and products

| Endpoint | | |
| --- | --- | --- |
| `POST /Product/getProducts?type=catalog&edit=false` | DataTables | The whole catalog, ~3,300 rows. Used by `catalog-service.ts` at 1000/page. |
| `GET /Product/GetImage/<itemNo>` | | Product photo, logged-in only. Proxied and cached (`image-service.ts`). |
| `GET /Product/Details/<itemNo>` | | Modal with number, description, unit, price, image. **Nothing we don't already have.** |

Catalog row fields we map (`catalog-row.ts`): `Id`, `No`, `Description`,
`Description2`, `SalesUnitOfMeasure`, `UnitPrice`, `QtyPerUnitOfMeasure`,
`IntegerOnly`, `GTIN`, `AssortmentAction` (1 = can be added to their
assortment, 2 = already in it). Everything else is kept in `raw`.
`Catalog*` / `ItemCategoryCode` fields exist but are always null — the
supplier has no usable categories, which is why ours are our own.

`Id` is the portal's internal product id (1, 3, 7, …), *not* the item number,
and it is what the cart's bulk endpoint wants. It is stored as
`supplier_products.supplier_id`.

### Cart

| Endpoint | | |
| --- | --- | --- |
| `POST /OrderConfirm/quickItemAdd` | `itemNoOrGTIN`, `quantity` | One line. Answers `{"Success":true,totalItems,totalQuantity,totalPrice}` (`totalPrice` is HTML, e.g. `"&euro;&nbsp;47.71"`). |
| `POST /Product/additems` | JSON | Many lines at once, see below. |
| `POST /Product/delete` | `shoppingCartItemId` | Removes a cart line. |
| `POST /OrderConfirm/RefreshShoppingCart` | | Cart contents. |
| `POST /OrderConfirm/PlaceOrder` | | **Never call this.** |

`additems` takes `{"items": [[id, quantity, variant, unitOfMeasureCode, key], …]}`
with `content-type: application/json`, where `id` is the internal `Id` above,
`variant` is null for us, `unitOfMeasureCode` is e.g. `FUST`/`TRAY`, and
`key` is a correlation id the portal echoes back. It answers
`{Success, addedItems: [{Key: key, Value: shoppingCartItemId}], totalItems,
totalQuantity, totalPrice, Messages, showOrderItemWarning}`.

Two things about that key, both found by trying:

- **It has to be a uuid.** Their catalog page sends the `hdnUniqueId` of the
  row, a fresh one per rendered row (it sits in the `QuantityHtml` field of
  the catalog JSON), but any uuid we make up works just as well. Anything
  that is not a uuid — an item number, say — makes the portal answer
  `Success: false` with "Er is een probleem opgetreden…" and add nothing.
- **A batch is all or nothing.** One line the portal will not take fails the
  whole call, and `addedItems` comes back empty. So a failed batch says
  nothing about which line was wrong: retry them one at a time with
  `quickItemAdd` to find out, which is what the review screen does.

No priming is needed for this one, and 3 lines go through in about 400 ms,
against roughly that per line one at a time.

The cart quotes the **gross** price: no line discount is visible there
(verified against a product invoiced at 17.6% off).

### Documents

All of these need their page primed first.

| Page to prime | Endpoint | |
| --- | --- | --- |
| `/Document/PostedDocuments/PostedInvoices` | `POST /Document/GetPostedDocuments/PostedInvoices` | Invoice list |
| `/Document/PostedDocuments/PostedCreditMemos` | `POST /Document/GetPostedDocuments/PostedCreditMemos` | Credit notes, same shape |
| idem | `GET /Document/GetPostedDocumentDetails/<kind>/<no>` | Lines |
| `/Document/OpenOrders` | `POST /Document/GetOpenOrders` | Orders not yet invoiced |
| idem | `GET /Document/GetOrderDetails/<no>` | Lines |
| `/Document/OpenEntries` | `POST /Document/GetOpenEntries` | Outstanding payments |
| | `GET /Document/Download/<no>/Invoice` | The invoice PDF (`application/pdf`, `filename=<no>.pdf`, ~250 KB) |

Fields, exactly as the portal's own JS declares its columns:

**Posted documents**: `Document_No`, `Document_Date`, `Document_Type`,
`Customer_No`, `Your_Reference`, `Currency_Code`, `Amount`,
`Amount_Including_VAT`, `Download`.

**Open orders**: `No`, `Order_Date`, `Sell_to_Customer_No`,
`Sell_to_Customer_Name`, `Your_Reference`, `Currency_Code`, `Amount`,
`Amount_Including_VAT`, `Salesperson_Code`, `Requested_Delivery_Date`,
`Promised_Delivery_Date`.

**Open entries**: `Document_Date`, `Document_Type` (`Invoice` /
`Credit_Memo`), `Document_No`, `Customer_No`, `Description`, `Currency_Code`,
`Amount`, `Remaining_Amount`, `Due_Date`, `Pmt_Discount_Date`, `DSO`
(age in days), `Download`. Amounts here are **including VAT**, unlike the
document lists. `Description` reads like `Order WEB26-2128`, which is the
only place the portal links an invoice back to the order it came from.

**Lines** (both posted documents and open orders): `Type`, `No`,
`Description`, `Quantity`, `Unit_Price`, `Line_Discount_Percent`, `Amount`.
`Amount` is the line total *after* the discount ("regeltotaal").

### Their assortment, settings

`/Product/AddToAssortment`, `/Product/DeleteFromAssortment`,
`/Product/SaveAssortmentItems`, `/UserSettings/HideGoLiveWarning`,
`/OrderConfirm/{ProcessItemAvailability,changeDeliveryAddress,removeItem,setDeliveryDate,temporarySave}`.
We keep our own assortment, so the portal's is deliberately left alone.

## Data formats

- Dates are `dd-mm-yyyy` strings.
- Numbers are strings; discounts come as `"17.59%"`. `parseNumber` strips the
  `%` and turns `,` into `.`.
- Document amounts exclude VAT, except `Amount_Including_VAT` and everything
  in open entries.
- Prices are per sales unit (`SalesUnitOfMeasure`), not per piece.

## Things we established the hard way

- **The line discount ("regelkorting") exists only on documents.** Not in the
  catalog JSON, not in the cart. Invoices have it weeks later; open orders
  have it right after ordering, which is why open orders are re-read on every
  import and beat older invoices.
- **The catalog price is already net of that discount.** Compared against
  recent invoices it matched the net price 25 out of 30 times and the gross
  price never. The discount says where we have an agreement; nothing extra
  comes off at checkout. The amount per unit stays constant while the
  percentage moves with the price.
- Images are served to a logged-in session only, so they are proxied and
  cached as blobs; a cold fetch can take seconds, which is why the proxy
  answers `202` and fetches in the background.
- An order that gets invoiced disappears from the open-order list, so its
  rows are dropped and the invoice becomes the authority.

## Re-checking any of this

The portal is server-rendered jQuery, and every list's columns are declared
in its page bundle. From the browser, on the page in question:

```js
const srcs = [...document.querySelectorAll('script[src]')].map(s => s.src);
for (const u of srcs) {
  const t = await (await fetch(u)).text();
  const i = t.indexOf('GetOpenEntries');           // or any endpoint name
  if (i > -1) console.log(t.slice(i - 500, i + 500));
}
```

That gives the exact `{data: "…"}` column list and the AJAX url, which is
faster and more reliable than reading the rendered table.
