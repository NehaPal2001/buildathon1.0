import { z } from 'zod';

// ---- diff.json ----
export const HunkSchema = z.object({
  newStart: z.number().int().nonnegative(),
  newLines: z.number().int().nonnegative(),
  lines: z.array(z.string()), // added lines only
});
export const ChangedFileSchema = z.object({
  file: z.string(),
  status: z.enum(['A', 'M', 'D']),
  hunks: z.array(HunkSchema),
});
export const DiffSchema = z.object({
  branch: z.string(),
  base: z.string(),
  mergeBase: z.string(),
  suiteDir: z.string().nullable(),
  files: z.array(ChangedFileSchema),
  commits: z.array(z.object({ sha: z.string(), subject: z.string(), body: z.string() })),
  contractFiles: z.array(z.string()),
});
export type Hunk = z.infer<typeof HunkSchema>;
export type ChangedFile = z.infer<typeof ChangedFileSchema>;
export type Diff = z.infer<typeof DiffSchema>;

// ---- candidates.json ----
export const RouteRefSchema = z.object({ method: z.string(), path: z.string() });
export const CandidateSchema = z.object({
  id: z.string(),
  kind: z.enum(['condition', 'throw', 'enum', 'default', 'constraint']),
  file: z.string(),
  line: z.number().int().positive(),
  excerpt: z.string(),
  context: z.string(),
  enclosingFunction: z.string().optional(),
  identifiers: z.array(z.string()),
  source: z.enum(['code', 'contract']),
  route: RouteRefSchema.optional(),
  status: z.number().int().optional(), // throw kind: HTTP status if literal
  field: z.string().optional(),        // constraint kind
  rule: z.string().optional(),         // constraint kind
});
export const ContractChangeSchema = z.object({
  path: z.string(),
  method: z.string(),
  change: z.enum(['added', 'removed', 'modified']),
  constraint: z.object({ field: z.string(), rule: z.string() }).optional(),
});
export const CandidatesSchema = z.object({
  branch: z.string(),
  candidates: z.array(CandidateSchema),
  contractChanges: z.array(ContractChangeSchema),
  unparsed: z.array(z.string()).default([]), // files that could not be parsed/walked (I4) — no candidates were silently dropped from these, they were never read
});
export type Candidate = z.infer<typeof CandidateSchema>;
export type ContractChange = z.infer<typeof ContractChangeSchema>;
export type CandidatesFile = z.infer<typeof CandidatesSchema>;

// ---- ui.json ----
export const RouteSchema = z.object({
  method: z.string(), // upper-case
  path: z.string(),   // full path including mount prefix
  file: z.string(),
  line: z.number().int().positive(),
  reach: z.array(z.string()), // files reachable through imports, including file itself
});
export const SurfaceElementSchema = z.object({
  file: z.string(),
  line: z.number().int().positive(),
  element: z.string().min(1), // any tag; I2 widened the whitelist to any element carrying data-testid/id/name
  attrs: z.record(z.string()),
  form: z.object({ method: z.string(), action: z.string() }).optional(),
});
export const UiSchema = z.object({
  branch: z.string(),
  routes: z.array(RouteSchema),
  surface: z.array(SurfaceElementSchema),
  unparsed: z.array(z.string()).default([]), // files that could not be parsed/walked (I4)
});
export type Route = z.infer<typeof RouteSchema>;
export type SurfaceElement = z.infer<typeof SurfaceElementSchema>;
export type Ui = z.infer<typeof UiSchema>;

// ---- suite.json ----
export const PageObjectFactsSchema = z.object({
  file: z.string(),
  className: z.string(),
  methods: z.array(z.string()),
  urls: z.array(z.string()),
  testIds: z.array(z.string()),
  locatorCounts: z.record(z.number()),
  unresolved: z.boolean(), // true if any of this class's own navigation is non-literal
});
export const SpecFactsSchema = z.object({
  path: z.string(),
  tests: z.array(z.string()),
  imports: z.array(z.string()),
  pageObjects: z.array(z.string()),
  urls: z.array(z.string()),
  fixtures: z.array(z.string()),
  methodCalls: z.array(z.string()),
  literals: z.array(z.string()),
  testIds: z.array(z.string()),
  unresolved: z.boolean(),
});
export const SuiteSchema = z.object({
  branch: z.string(),
  suiteDir: z.string(),
  specs: z.array(SpecFactsSchema),
  pageObjects: z.array(PageObjectFactsSchema),
  fixtureFile: z.string().nullable(),
  fixtureKeys: z.record(z.string()), // fixture key → page object class
  obtainPattern: z.enum(['test.extend', 'constructor', 'helper', 'unknown']),
  locatorCounts: z.record(z.number()),
  inlineLocatorCalls: z.number().int(),   // locator calls made on `page` inside spec files, not via a page object
  assertionCounts: z.record(z.number()),
  titleSamples: z.array(z.string()),
  setupPattern: z.enum(['storageState', 'globalSetup', 'beforeEach', 'none']),
  totalTests: z.number().int(),
  unparsed: z.array(z.string()).default([]), // files that could not be parsed/walked (I4)
});
export type PageObjectFacts = z.infer<typeof PageObjectFactsSchema>;
export type SpecFacts = z.infer<typeof SpecFactsSchema>;
export type Suite = z.infer<typeof SuiteSchema>;

// ---- analysis.json (spec §6) ----
export const OriginSchema = z.object({
  candidateId: z.string(),
  file: z.string(),
  line: z.number().int().positive(),
  excerpt: z.string(),
  source: z.enum(['code', 'contract']),
});
export const ReachabilitySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ui'), steps: z.array(z.string()).min(1), evidence: z.string() }),
  z.object({ kind: z.literal('api'), setup: z.string(), evidence: z.string() }),
  z.object({ kind: z.literal('data'), setup: z.string(), evidence: z.string() }),
  z.object({ kind: z.literal('unreachable'), why: z.string(), evidence: z.string() }),
]);
export const StateSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'kebab-case slug'),
  description: z.string().min(1),
  origins: z.array(OriginSchema).min(1),
  reachability: ReachabilitySchema,
  inClaim: z.boolean(),
  claimFragment: z.string().optional(),
  coveredBy: z.array(z.string()),
  confidence: z.enum(['high', 'medium', 'low']),
  exclusionNote: z.string().optional(),
}).refine((s) => !s.inClaim || Boolean(s.claimFragment), { message: 'inClaim requires claimFragment' });
export const MismatchSchema = z.object({
  claimSays: z.string(),
  codeSays: z.string(),
  origins: z.array(OriginSchema).min(1),
  severity: z.enum(['blocker', 'question']),
});
export const BehaviourChangeSchema = z.object({ statement: z.string(), origins: z.array(OriginSchema).min(1) });
export const ScopeEntrySchema = z.object({ spec: z.string(), reason: z.string(), facts: z.array(z.string()).min(1) });
export const AnalysisSchema = z.object({
  version: z.literal(2),
  branch: z.string(),
  base: z.string(),
  generatedAt: z.string(),
  candidatesTotal: z.number().int(),
  suppressed: z.number().int().default(0),
  exclusions: z.object({ recognised: z.array(z.string()), unrecognised: z.array(z.string()) }).default({ recognised: [], unrecognised: [] }),
  // Mirrors the `unparsed` field M1's final review added to candidates.json ("file" — files that
  // could not be parsed for code candidates), ui.json and suite.json: files that could not be
  // parsed/walked, so no findings were silently dropped from them, they were simply never read.
  // validate.ts copies these three lists straight through mechanically (no LLM involvement, no
  // prose check) so this honesty guarantee survives the M2 boundary; render.ts (a later task)
  // is what surfaces it to the tester.
  unparsed: z.object({
    file: z.array(z.string()).default([]),
    ui: z.array(z.string()).default([]),
    suite: z.array(z.string()).default([]),
  }).default({ file: [], ui: [], suite: [] }),
  claim: z.object({ source: z.enum(['ticket', 'commits', 'none']), text: z.string() }),
  behaviourChanges: z.array(BehaviourChangeSchema),
  mismatches: z.array(MismatchSchema),
  states: z.array(StateSchema),
  contractChanges: z.array(ContractChangeSchema).optional(),
  scope: z.object({
    totalTests: z.number().int(),
    inScope: z.array(ScopeEntrySchema),
    outOfScope: z.array(ScopeEntrySchema),
    newTests: z.number().int(),
  }).optional(),
});
export type Origin = z.infer<typeof OriginSchema>;
export type Reachability = z.infer<typeof ReachabilitySchema>;
export type State = z.infer<typeof StateSchema>;
export type Mismatch = z.infer<typeof MismatchSchema>;
export type BehaviourChange = z.infer<typeof BehaviourChangeSchema>;
export type ScopeEntry = z.infer<typeof ScopeEntrySchema>;
export type Analysis = z.infer<typeof AnalysisSchema>;
