// Reads pack contents out of a supplier description, as a suggestion for the
// pricing fields. The supplier has no structured data for this, but its
// descriptions follow a few patterns: "KRAT 24/20CL", "24X33CL 4,5%",
// "FUST 20LT", "1LTR", "CAPSULES 22ST", "20X40GR".

export type ParsedContents = {
  // Liters per purchase unit.
  unitVolume: number | null;
  // Liters per bottle or can, when the unit holds several.
  packVolume: number | null;
  // Bottles, cans or pieces in a unit.
  count: number | null;
  alcoholPercentage: number | null;
};

const LITERS: Record<string, number> = {
  ML: 0.001,
  CL: 0.01,
  L: 1,
  LT: 1,
  LTR: 1,
};

const number = (value: string) => Number(value.replace(",", "."));
const tidy = (value: number) => Number(value.toFixed(4));

export function parseContents(description: string | null): ParsedContents {
  const result: ParsedContents = {
    unitVolume: null,
    packVolume: null,
    count: null,
    alcoholPercentage: null,
  };
  if (!description) return result;
  const text = description.toUpperCase();

  const alcohol = text.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (alcohol) result.alcoholPercentage = tidy(number(alcohol[1]) / 100);

  const pack = text.match(
    /(\d+)\s*[/X]\s*(\d+(?:[.,]\d+)?)\s*(ML|CL|LTR|LT|L)\b/,
  );
  if (pack) {
    result.count = Number(pack[1]);
    result.packVolume = tidy(number(pack[2]) * LITERS[pack[3]]);
    result.unitVolume = tidy(result.count * result.packVolume);
    return result;
  }

  const volume = text.match(/(\d+(?:[.,]\d+)?)\s*(ML|CL|LTR|LT|L)\b/);
  if (volume) {
    result.unitVolume = tidy(number(volume[1]) * LITERS[volume[2]]);
    return result;
  }

  // Things that aren't poured: "22ST", "20X40GR".
  const pieces =
    text.match(/(\d+)\s*ST\b/) ??
    text.match(/(\d+)\s*X\s*\d+(?:[.,]\d+)?\s*GR\b/);
  if (pieces) result.count = Number(pieces[1]);
  return result;
}
