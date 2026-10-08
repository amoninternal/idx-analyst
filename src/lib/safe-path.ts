// Where to send a visitor after they connect their keys. Used by src/proxy.ts, the
// /connect page and the connect form, so all three agree. Browser-safe.
//
// Checking the prefix of the raw string isn't enough: URL parsers drop tabs and line
// breaks anywhere ("/\t/evil.com" becomes "//evil.com"), treat "\" like "/", and resolve
// dot segments ("/.//evil.com" becomes "//evil.com"). So the value is parsed against a
// placeholder origin and the *result* must still be a path on that origin.

const PLACEHOLDER = "http://same-site.invalid";

/** A same-site path (with query) to go to, or "/" when the input is anything else. */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || raw.length > 2048) return "/";
  // Control characters, backslashes, and anything not starting with a single slash.
  if (/[\u0000-\u001f\u007f\\]/.test(raw) || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  let url: URL;
  try {
    url = new URL(raw, PLACEHOLDER);
  } catch {
    return "/";
  }
  if (url.origin !== PLACEHOLDER || url.pathname.startsWith("//")) return "/";
  return `${url.pathname}${url.search}`;
}
