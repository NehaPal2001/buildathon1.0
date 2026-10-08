const TOKEN = /[A-Za-z_$][\w$]*/g;
// file citations: src/services/coupon.ts:12, api/openapi.yaml, e2e/specs/coupon.spec.ts#Coupons › a title
const FILE_REF = /[\w./-]+\.(?:ts|tsx|js|jsx|json|ya?ml|md|html)(?::\d+)?(?:#[^\n|\]]*)?/g;

function codeLike(token: string): boolean {
  return /[A-Z]/.test(token.slice(1)) || /[_$]/.test(token) || (/\d/.test(token) && /[a-z]/.test(token));
}

/**
 * Tokens in `text` that read as code: banned identifiers that are camelCase /
 * PascalCase / CONSTANT_CASE, any `name(` call syntax, and `a.b` member paths
 * whose left side is a banned identifier. Plain lowercase words are allowed
 * even if the code uses them as variable names. ALL-CAPS-with-digits values
 * such as SAVE20 are literal data, not code, and pass.
 */
export function codeLikeTokens(rawText: string, banned: Set<string>): string[] {
  const text = rawText.replace(FILE_REF, ' '); // citations are allowed everywhere
  const out: string[] = [];
  for (const m of text.matchAll(/([A-Za-z_$][\w$]{1,})\.([A-Za-z_$][\w$]{1,})/g)) {
    // both sides ≥2 chars so "e.g." and "i.e." pass
    if (banned.has(m[1]) || banned.has(m[2])) out.push(`${m[1]}.${m[2]}`);
  }
  for (const m of text.matchAll(/([A-Za-z_$][\w$]*)\(/g)) {
    if (banned.has(m[1]) || codeLike(m[1])) out.push(`${m[1]}(`);
  }
  for (const m of text.matchAll(TOKEN)) {
    const t = m[0];
    if (banned.has(t) && codeLike(t)) out.push(t);
  }
  return [...new Set(out)];
}
