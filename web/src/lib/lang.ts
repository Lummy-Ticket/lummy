// Which language a page is first rendered in, decided on the server, so a visitor never sees one
// language and then the other: Indonesian phones got English first and the switch about two
// seconds later (UX audit, 4 Nov 2026). The switch, and a choice the browser had stored, write
// LANG_COOKIE; until there is one, the browser's first language decides, as the client always did
// (some Android builds still report the old code "in"). No server or client code here, so both
// sides read it.

export type Lang = "en" | "id";

/** Holds "en" or "id": a preference, not personal data, sent with each request so the page opens in it. */
export const LANG_COOKIE = "lummy-lang";

export function pickLang(cookie: string | null | undefined, acceptLanguage: string | null | undefined): Lang {
  if (cookie === "id" || cookie === "en") return cookie;
  const first = (acceptLanguage ?? "").split(",")[0]?.trim() ?? "";
  return /^(id|in)\b/i.test(first) ? "id" : "en";
}
