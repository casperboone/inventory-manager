const priceFormat = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
});

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Amsterdam",
});

export function formatPrice(value: number | null | undefined) {
  return value == null ? "—" : priceFormat.format(value);
}

export function formatDateTime(value: Date | null | undefined) {
  return value ? dateTimeFormat.format(value) : "—";
}

export function formatDuration(start: Date, end: Date | null) {
  if (!end) return "—";
  const seconds = Math.round((end.getTime() - start.getTime()) / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function formatNumber(value: number | null | undefined) {
  return value == null ? "—" : value.toLocaleString("en-GB");
}
