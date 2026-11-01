// A number as typed into a form, where a decimal comma is as good as a dot.
// Null when the field is empty or doesn't hold a number; callers that treat
// those two differently check for empty first.
export function parseTypedNumber(text: string) {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}
