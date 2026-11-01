// Every number and date on screen goes through here, so they look the same
// everywhere: Dutch numbers (1.234,5) and numeric dates (01-11-2026).
const LOCALE = "nl-NL";
const TIME_ZONE = "Europe/Amsterdam";

// `digits` is for the rare price that needs more than cents, like a pivot
// price of € 1,875.
export function formatPrice(value: number | null | undefined, digits = 2) {
  return value == null
    ? "—"
    : value.toLocaleString(LOCALE, {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2,
        maximumFractionDigits: digits,
      });
}

const dateFormat = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: TIME_ZONE,
});

// For things that only have a day, like an invoice date.
export function formatDate(value: Date | null | undefined) {
  return value ? dateFormat.format(value) : "—";
}

const shortDateFormat = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  timeZone: TIME_ZONE,
});

// For dense tables where a full date does not fit.
export function formatShortDate(value: Date | null | undefined) {
  return value ? shortDateFormat.format(value) : "—";
}

const timeFormat = new Intl.DateTimeFormat(LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: TIME_ZONE,
});

export function formatDateTime(value: Date | null | undefined) {
  return value ? `${dateFormat.format(value)} ${timeFormat.format(value)}` : "—";
}

export function formatDuration(start: Date, end: Date | null) {
  if (!end) return "—";
  const seconds = Math.round((end.getTime() - start.getTime()) / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function formatNumber(value: number | null | undefined, digits = 3) {
  return value == null
    ? "—"
    : value.toLocaleString(LOCALE, { maximumFractionDigits: digits });
}

// For margins and rates, which are stored as fractions.
export function formatPercent(value: number | null | undefined, digits = 0) {
  return value == null
    ? "—"
    : value.toLocaleString(LOCALE, {
        style: "percent",
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
}

// The text a form field starts with: no thousands separator, and empty rather
// than a dash. `factor` is for what is typed in another unit than it's stored
// in, like a percentage kept as a fraction.
export function formatInputNumber(
  value: number | null | undefined,
  factor = 1,
) {
  return value == null
    ? ""
    : (value * factor).toLocaleString(LOCALE, {
        maximumFractionDigits: 4,
        useGrouping: false,
      });
}

// A price in a form field, which always shows its cents.
export function formatInputPrice(value: number | null | undefined) {
  return value == null
    ? ""
    : value.toLocaleString(LOCALE, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        useGrouping: false,
      });
}
