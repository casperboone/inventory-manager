// The ?item=<id> that opens the item dialog on the order list and the pricing
// screen. Whether that item exists is up to the page or the dialog.
export function parseItemParam(value: string | string[] | undefined) {
  return typeof value === "string" && /^\d+$/.test(value)
    ? Number(value)
    : null;
}
