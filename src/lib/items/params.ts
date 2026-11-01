// The ?item=<id> that opens an item's dialog on the order list and the pricing
// screen. Whether that item exists is up to the page.
export function parseItemParam(value: string | string[] | undefined) {
  return typeof value === "string" && /^\d+$/.test(value)
    ? Number(value)
    : null;
}
