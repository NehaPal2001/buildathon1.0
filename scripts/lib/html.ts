import type { SurfaceElement } from '../schema';

// Any element is a candidate surface element now (I2: the old form|input|button|a|select|
// textarea whitelist hid the large majority of real assertion targets — `<li>`, `<span>`,
// `<p>`, `<ul>` carrying `data-testid` were invisible). `extractElements` below keeps only
// those actually carrying an identifying attribute (`data-testid`, `id`, or `name`), except
// `<form>` itself, which is always tracked (though not necessarily emitted) so the enclosing-
// form logic keeps working unchanged.
const TAG = /<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>|<\/form>/gi;
const MASK = '\x01';

/**
 * Replace exactly the given `[start, end)` ranges in `html` with same-length
 * filler characters, leaving everything else untouched. The result always has
 * the exact same length as `html`, so any `lineAt`/index computed against it
 * is still valid against the original string.
 *
 * Ranges are not inferred here — inferring `${...}` boundaries from the text
 * itself (brace-counting, quote-tracking, ...) is unfixably ambiguous without
 * a real parser (string/template/regex literals and comments inside the JS
 * expression all look like ordinary characters to a text scanner). The caller
 * — which has the TypeScript AST in hand and therefore knows the exact
 * boundary of every placeholder — supplies the ranges instead. Ranges that
 * are out of bounds, empty, reversed, or otherwise malformed are clamped or
 * dropped rather than throwing, so a genuinely truncated/unterminated
 * template literal degrades safely instead of corrupting or growing the
 * masked string.
 */
function maskRanges(html: string, ranges: ReadonlyArray<readonly [number, number]>): string {
  const chars = html.split('');
  for (const [rawStart, rawEnd] of ranges) {
    const start = Math.max(0, Math.min(rawStart, chars.length));
    const end = Math.max(start, Math.min(rawEnd, chars.length));
    for (let k = start; k < end; k++) chars[k] = MASK;
  }
  return chars.join('');
}

/**
 * Scan attributes from `maskedRaw` (placeholder-safe, so `=`/quotes/whitespace
 * inside a `${...}` can't be mistaken for attribute syntax) but read every
 * value back out of `originalRaw` at the same offsets, so a placeholder comes
 * out verbatim (`${p.id}` stays `${p.id}`) rather than as filler characters.
 * A bare attribute with no `=` yields an empty string rather than being dropped.
 */
function scanAttrs(maskedRaw: string, originalRaw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const n = maskedRaw.length;
  const isSpace = (c: string) => /\s/.test(c);
  const isNameChar = (c: string) => /[a-zA-Z-]/.test(c);
  let i = 0;
  while (i < n) {
    while (i < n && isSpace(maskedRaw[i])) i++;
    if (i >= n) break;
    const nameStart = i;
    while (i < n && isNameChar(maskedRaw[i])) i++;
    if (i === nameStart) { i++; continue; } // stray character; skip
    const name = maskedRaw.slice(nameStart, i).toLowerCase();
    let j = i;
    while (j < n && isSpace(maskedRaw[j])) j++;
    if (maskedRaw[j] === '=') {
      j++;
      while (j < n && isSpace(maskedRaw[j])) j++;
      const quote = maskedRaw[j];
      if (quote === '"' || quote === "'") {
        j++;
        const valStart = j;
        while (j < n && maskedRaw[j] !== quote) j++;
        attrs[name] = originalRaw.slice(valStart, j);
        i = j < n ? j + 1 : j;
      } else {
        const valStart = j;
        while (j < n && !isSpace(maskedRaw[j])) j++;
        attrs[name] = originalRaw.slice(valStart, j);
        i = j;
      }
    } else {
      attrs[name] = '';
      i = j;
    }
  }
  return attrs;
}

/**
 * Elements in an HTML string. `lineAt(offset)` maps an offset within `html`
 * to a 1-based line in `file` (the caller knows where the string sits).
 *
 * `placeholderRanges` is the `[start, end)` span of every `${...}` substitution
 * in `html`, as the caller's parser found it (empty/omitted for a plain HTML
 * file, or a no-substitution template literal, which have none). Those spans
 * are masked before scanning for tags/attributes, so a `"`, `>`, or anything
 * else inside a placeholder can never be mistaken for HTML syntax; every
 * attribute value is still read back out of the original text, so a
 * placeholder is preserved verbatim in the output.
 */
export function extractElements(
  html: string,
  file: string,
  lineAt: (offset: number) => number,
  placeholderRanges: ReadonlyArray<readonly [number, number]> = [],
): SurfaceElement[] {
  const masked = maskRanges(html, placeholderRanges);
  const out: SurfaceElement[] = [];
  let openForm: { method: string; action: string } | undefined;
  for (const m of masked.matchAll(TAG)) {
    if (m[0].toLowerCase() === '</form>') { openForm = undefined; continue; }
    const element = m[1].toLowerCase();
    const tagStart = m.index ?? 0;
    const attrsStart = tagStart + 1 + m[1].length;
    const attrsEnd = tagStart + m[0].length - 1;
    const maskedAttrsRaw = masked.slice(attrsStart, attrsEnd);
    const originalAttrsRaw = html.slice(attrsStart, attrsEnd);
    const attrs = scanAttrs(maskedAttrsRaw, originalAttrsRaw);
    if (element === 'form') {
      // Tracked for the enclosing-form logic regardless of whether it is itself emitted below.
      openForm = { method: (attrs.method ?? 'get').toLowerCase(), action: attrs.action ?? '' };
    }
    // Every element is a candidate now; keep only ones an assertion could actually target.
    const hasIdentity = attrs['data-testid'] !== undefined || attrs.id !== undefined || attrs.name !== undefined;
    if (!hasIdentity) continue;
    const el: SurfaceElement = { file, line: lineAt(tagStart), element, attrs };
    if (element !== 'form' && openForm) el.form = openForm;
    out.push(el);
  }
  return out;
}
