// What goes in "Uw referentie" at Rust's checkout. It's pasted by hand: the
// portal keeps that field per login, so the app can't set it for your browser.
export function orderReference(orderId: number) {
  return `IM-${orderId}`;
}

// Forgiving, because it's typed or pasted into a free text field.
export function parseOrderReference(value: string | null | undefined) {
  const match = value?.match(/\bIM-(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

export function orderLabel(order: { id: number; name: string | null }) {
  return order.name?.trim() || `Order ${order.id}`;
}
