import { describe, it, expect } from 'vitest';
import { diffContract, constraintsOf, loadOpenApi, operationConstraints, parseRaw, locateConstraint, type OpenApiDoc } from '../lib/openapi';

describe('regression: review findings on lib/openapi.ts', () => {
  it('does not report a modification when only an array of primitives is reordered (finding 5)', () => {
    const base: OpenApiDoc = {
      paths: {
        '/x': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: { type: 'object', required: ['a', 'b'] as unknown as string[] },
                },
              },
            },
          } as never,
        },
      },
    };
    const branch: OpenApiDoc = {
      paths: {
        '/x': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: { type: 'object', required: ['b', 'a'] as unknown as string[] },
                },
              },
            },
          } as never,
        },
      },
    };
    const changes = diffContract(base, branch);
    expect(changes.find((c) => c.path === '/x' && c.method === 'POST')?.change).toBeUndefined();
  });

  it('still reports a modification when an array of objects (allOf) is reordered (finding 5)', () => {
    const base: OpenApiDoc = {
      paths: {
        '/y': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: { allOf: [{ type: 'string' }, { type: 'integer' }] } as never,
                },
              },
            },
          } as never,
        },
      },
    };
    const branch: OpenApiDoc = {
      paths: {
        '/y': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: { allOf: [{ type: 'integer' }, { type: 'string' }] } as never,
                },
              },
            },
          } as never,
        },
      },
    };
    const changes = diffContract(base, branch);
    expect(changes.find((c) => c.path === '/y' && c.method === 'POST')?.change).toBe('modified');
  });

  it('does not hang on a self-referential schema (finding 6)', () => {
    const category: Record<string, unknown> = { type: 'object', properties: {} };
    (category.properties as Record<string, unknown>).subcategories = { type: 'array', items: category };
    const result = constraintsOf(category as never, 'Category');
    expect(Array.isArray(result)).toBe(true);
  }, 2000);
});

describe('regression: C1+C2 — locate constraints structurally in the raw CST, never by text search', () => {
  // Two operations whose requestBody schemas each $ref a DIFFERENT component, each with its
  // own `minimum: 1` — the old anchor-then-forward-scan `lineOfConstraint` found the first
  // line anywhere past a barely-relevant anchor, so both operations cited Alpha's line (25)
  // even for Beta's own constraint (whose real line is 29). Path keys are quoted, which used
  // to defeat the anchor's `startsWith` check too (also part of C2).
  const text = [
    'openapi: 3.0.3',
    'info: { title: t, version: "1" }',
    'paths:',
    "  '/api/alpha':",
    '    post:',
    '      requestBody:',
    '        content:',
    '          application/json:',
    "            schema: { $ref: '#/components/schemas/AlphaBody' }",
    '      responses:',
    "        '200': { description: ok }",
    "  '/api/beta':",
    '    post:',
    '      requestBody:',
    '        content:',
    '          application/json:',
    "            schema: { $ref: '#/components/schemas/BetaBody' }",
    '      responses:',
    "        '200': { description: ok }",
    'components:',
    '  schemas:',
    '    AlphaBody:',
    '      type: object',
    '      properties:',
    '        qty: { type: integer, minimum: 1 }',
    '    BetaBody:',
    '      type: object',
    '      properties:',
    '        qty: { type: integer, minimum: 1 }',
    '',
  ].join('\n');

  it('cites each operation’s own referenced schema, never a sibling operation’s (finding C2)', async () => {
    const doc = await loadOpenApi(text);
    const raw = parseRaw(text);
    const alphaMin = operationConstraints(doc.paths!['/api/alpha'].post!, '/api/alpha', 'post').find((c) => c.keyword === 'minimum')!;
    const betaMin = operationConstraints(doc.paths!['/api/beta'].post!, '/api/beta', 'post').find((c) => c.keyword === 'minimum')!;
    expect(alphaMin).toBeDefined();
    expect(betaMin).toBeDefined();

    const alphaLoc = locateConstraint(raw, alphaMin);
    const betaLoc = locateConstraint(raw, betaMin);
    expect(alphaLoc).not.toBeNull();
    expect(betaLoc).not.toBeNull();
    expect(alphaLoc!.line).toBe(25);
    expect(betaLoc!.line).toBe(29);
    expect(alphaLoc!.line).not.toBe(betaLoc!.line);
    expect(alphaLoc!.excerpt).toBe('minimum: 1');
    expect(betaLoc!.excerpt).toBe('minimum: 1');
  });

  it('drops a constraint rather than fabricating a citation when the raw location cannot be resolved', () => {
    const raw = parseRaw(text);
    const bogus = {
      field: 'nope',
      keyword: 'pattern',
      value: '',
      rule: 'pattern: x',
      root: { kind: 'schema' as const, name: 'DoesNotExist' },
      steps: [],
    };
    expect(locateConstraint(raw, bogus)).toBeNull();
  });
});
