import type { Analysis, CandidatesFile, Origin } from '../schema';

function originFor(c: CandidatesFile, needle: string): Origin {
  const cand = c.candidates.find((x) => x.excerpt.includes(needle));
  if (!cand) throw new Error(`no candidate containing ${needle}`);
  return { candidateId: cand.id, file: cand.file, line: cand.line, excerpt: cand.excerpt, source: cand.source };
}

/** A minimal valid analysis using real candidate ids from the fixture. */
export function sampleAnalysis(c: CandidatesFile): Analysis {
  const upper = originFor(c, 'rawCode.toUpperCase()');
  const belowMin = originFor(c, "throw new Error('cart below minimum')");
  const pattern = originFor(c, '^[A-Z0-9]{6,12}$');
  const bogo = originFor(c, "'PERCENT' | 'FLAT' | 'BOGO'");
  return {
    version: 2,
    branch: c.branch,
    base: 'main',
    generatedAt: '2026-09-22T00:00:00.000Z',
    candidatesTotal: c.candidates.length,
    suppressed: 0,
    exclusions: { recognised: [], unrecognised: [] },
    unparsed: { file: [], ui: [], suite: [] },
    claim: { source: 'ticket', text: 'Users can apply one coupon at checkout. Percentage and flat discounts. Invalid codes show an error.' },
    behaviourChanges: [
      { statement: 'Coupon codes are accepted in any letter case; the ticket does not say so.', origins: [{ ...upper }] },
    ],
    mismatches: [
      { claimSays: 'The contract requires codes of 6 to 12 uppercase letters or digits.', codeSays: 'Nothing checks the format before looking the code up.', origins: [pattern], severity: 'blocker' },
      { claimSays: 'The contract documents a 422 response when the cart is under the minimum.', codeSays: 'The server fails with a generic error instead.', origins: [{ ...belowMin }], severity: 'blocker' },
    ],
    states: [
      {
        id: 'lowercase-code',
        description: 'A code typed in lowercase is still accepted.',
        origins: [{ ...upper }],
        reachability: { kind: 'ui', steps: ['Open checkout', 'Enter save20', 'Apply'], evidence: 'input data-testid=coupon-input in form POST /api/cart/coupon' },
        inClaim: false, coveredBy: [], confidence: 'high',
      },
      {
        id: 'below-minimum',
        description: 'Applying a percent coupon to a cart under ₹500 produces a server error instead of a message.',
        origins: [{ ...belowMin }],
        reachability: { kind: 'ui', steps: ['Add a ₹149 item', 'Open checkout', 'Enter SAVE20', 'Apply'], evidence: 'input data-testid=coupon-input in form POST /api/cart/coupon' },
        inClaim: false, coveredBy: [], confidence: 'high',
      },
      {
        id: 'bogo-discount',
        description: 'A buy-one-get-one discount type exists but nothing on the page can produce it.',
        origins: [bogo],
        reachability: { kind: 'unreachable', why: 'No coupon in the seeded list uses it and no input selects a type.', evidence: 'no surface element mentions the type' },
        inClaim: false, coveredBy: [], confidence: 'low',
      },
    ],
  };
}
