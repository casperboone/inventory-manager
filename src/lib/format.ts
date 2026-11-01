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

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "Europe/Amsterdam",
});

// For things that only have a day, like an invoice date.
export function formatDate(value: Date | null | undefined) {
  return value ? dateFormat.format(value) : "—";
}

const shortDateFormat = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  timeZone: "Europe/Amsterdam",
});

// For dense tables where a full date does not fit.
export function formatShortDate(value: Date | null | undefined) {
  return value ? shortDateFormat.format(value) : "—";
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

// For margins and rates, which are stored as fractions.
export function formatPercent(value: number | null | undefined, digits = 0) {
  return value == null ? "—" : `${(value * 100).toFixed(digits)}%`;
}
