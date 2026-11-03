// The link a page belongs to, so a section stays lit on the pages below it. The
// longest match wins, because one section's link can be the start of another's.
export function findActiveHref(pathname: string, hrefs: string[]) {
  return hrefs
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
}
