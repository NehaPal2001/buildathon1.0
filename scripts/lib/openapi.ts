import YAML from 'yaml';
import SwaggerParser from '@apidevtools/swagger-parser';
import type { ContractChange } from '../schema';

export type OpenApiDoc = {
  paths?: Record<string, Record<string, Operation>>;
  components?: { schemas?: Record<string, Schema> };
};
type Schema = {
  type?: string;
  properties?: Record<string, Schema>;
  items?: Schema;
  required?: string[];
  enum?: unknown[];
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  format?: string;
};
type Operation = {
  parameters?: Array<{ name: string; in: string; required?: boolean; schema?: Schema }>;
  requestBody?: { content?: Record<string, { schema?: Schema }> };
  responses?: Record<string, { description?: string; content?: Record<string, { schema?: Schema }> }>;
};

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];

export async function loadOpenApi(text: string): Promise<OpenApiDoc> {
  const raw = text.trimStart().startsWith('{') ? JSON.parse(text) : YAML.parse(text);
  // dereference resolves internal $refs so schemas can be walked as plain objects
  return (await SwaggerParser.dereference(raw as never, { dereference: { circular: 'ignore' } })) as unknown as OpenApiDoc;
}

/**
 * Canonical JSON: object keys sorted at every level, and arrays of
 * primitives (e.g. `enum`, `required`) sorted too, so structural equality
 * survives key order and primitive-array reordering. Arrays containing
 * objects (e.g. `allOf`, `parameters`, `oneOf`) are left in their original
 * order, since order can carry meaning there.
 */
function stable(x: unknown): string {
  return JSON.stringify(x, (_key, value) => {
    if (Array.isArray(value)) {
      const allPrimitive = value.every((v) => v === null || typeof v !== 'object');
      return allPrimitive ? [...value].sort() : value;
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
    }
    return value;
  });
}

export function diffContract(base: OpenApiDoc | null, branch: OpenApiDoc): ContractChange[] {
  const out: ContractChange[] = [];
  const paths = new Set([...Object.keys(base?.paths ?? {}), ...Object.keys(branch.paths ?? {})]);
  for (const p of [...paths].sort()) {
    for (const m of METHODS) {
      const before = base?.paths?.[p]?.[m];
      const after = branch.paths?.[p]?.[m];
      if (!before && !after) continue;
      const method = m.toUpperCase();
      if (!before) out.push({ path: p, method, change: 'added' });
      else if (!after) out.push({ path: p, method, change: 'removed' });
      else if (stable(before) !== stable(after)) out.push({ path: p, method, change: 'modified' });
    }
  }
  return out;
}

export function changedSchemas(base: OpenApiDoc | null, branch: OpenApiDoc): string[] {
  const names = Object.keys(branch.components?.schemas ?? {});
  return names.filter((n) => stable(base?.components?.schemas?.[n]) !== stable(branch.components?.schemas?.[n]));
}

/**
 * Where in the *raw* (un-dereferenced) CST a constraint's own schema node lives, so its
 * citation can be resolved without any text search — see `locateConstraint`. Each variant
 * names an operation-relative anchor (or a component schema by name); `responseDescription`
 * is special-cased because its citable text is the `description` scalar, not a keyword pair.
 */
export type ConstraintRoot =
  | { kind: 'param'; path: string; method: string; index: number }
  | { kind: 'requestBody'; path: string; method: string; media: string }
  | { kind: 'response'; path: string; method: string; status: string; media: string }
  | { kind: 'responseDescription'; path: string; method: string; status: string }
  | { kind: 'schema'; name: string };

export interface Constraint {
  field: string;
  rule: string;
  keyword: string;
  value: string;
  root: ConstraintRoot;
  steps: string[]; // property/[] descent from root's schema to this constraint's own schema node
}

/** Walk a schema, emitting one constraint per validation keyword. `seen` guards against self-referential schemas. */
export function constraintsOf(
  schema: Schema | undefined,
  prefix: string,
  root: ConstraintRoot = { kind: 'schema', name: prefix },
  out: Constraint[] = [],
  seen: WeakSet<object> = new WeakSet(),
  steps: string[] = [],
): Constraint[] {
  if (!schema) return out;
  if (seen.has(schema)) return out;
  seen.add(schema);
  const field = prefix || '(body)';
  if (schema.pattern) out.push({ field, keyword: 'pattern', value: schema.pattern, rule: `pattern: ${schema.pattern}`, root, steps });
  if (schema.enum) out.push({ field, keyword: 'enum', value: schema.enum.join(', '), rule: `enum: ${schema.enum.join(', ')}`, root, steps });
  for (const k of ['minimum', 'maximum', 'minLength', 'maxLength'] as const) {
    if (schema[k] !== undefined) out.push({ field, keyword: k, value: String(schema[k]), rule: `${k}: ${schema[k]}`, root, steps });
  }
  if (schema.required?.length) out.push({ field, keyword: 'required', value: schema.required.join(', '), rule: `required: ${schema.required.join(', ')}`, root, steps });
  for (const [name, child] of Object.entries(schema.properties ?? {})) {
    constraintsOf(child, prefix ? `${prefix}.${name}` : name, root, out, seen, [...steps, name]);
  }
  if (schema.items) constraintsOf(schema.items, `${prefix}[]`, root, out, seen, [...steps, '[]']);
  return out;
}

export function operationConstraints(op: Operation, path: string, method: string): Constraint[] {
  const out: Constraint[] = [];
  (op.parameters ?? []).forEach((param, index) => {
    constraintsOf(param.schema, param.name, { kind: 'param', path, method, index }, out);
  });
  for (const [media, entry] of Object.entries(op.requestBody?.content ?? {})) {
    constraintsOf(entry.schema, '', { kind: 'requestBody', path, method, media }, out);
  }
  for (const [status, res] of Object.entries(op.responses ?? {})) {
    if (Number(status) >= 400) {
      // keyword carries the quoted status key only for readability in `rule`; citation for
      // this one anchors on the description scalar (see `locateConstraint`), not this pair.
      out.push({
        field: `response.${status}`,
        keyword: `'${status}'`,
        value: '',
        rule: `response ${status}: ${res.description ?? ''}`.trim(),
        root: { kind: 'responseDescription', path, method, status },
        steps: [],
      });
    }
    for (const [media, entry] of Object.entries(res.content ?? {})) {
      constraintsOf(entry.schema, `response.${status}`, { kind: 'response', path, method, status, media }, out);
    }
  }
  return out;
}

// ---- Raw-CST location (C1+C2 fix: locate constraints structurally, never by text search) ----

export interface RawDoc {
  doc: YAML.Document;
  lineCounter: InstanceType<typeof YAML.LineCounter>;
  text: string;
}

/** Parse the branch text a second time, un-dereferenced, preserving exact source ranges. */
export function parseRaw(text: string): RawDoc {
  const lineCounter = new YAML.LineCounter();
  const doc = YAML.parseDocument(text, { lineCounter });
  return { doc, lineCounter, text };
}

function nodeGet(node: unknown, key: string | number): unknown {
  if (YAML.isMap(node) || YAML.isSeq(node)) return (node as YAML.YAMLMap | YAML.YAMLSeq).get(key, true);
  return undefined;
}

/** Follow an OpenAPI `$ref: '#/...'` map (a plain field, not a real YAML alias) to its target, if present. */
function derefIfNeeded(doc: YAML.Document, node: unknown, seen: Set<string> = new Set()): unknown {
  if (!YAML.isMap(node)) return node;
  const ref = nodeGet(node, '$ref');
  const refValue = YAML.isScalar(ref) ? ref.value : undefined;
  if (typeof refValue !== 'string') return node;
  if (seen.has(refValue)) return undefined; // cyclic $ref
  seen.add(refValue);
  let target: unknown = doc.contents;
  for (const part of refValue.replace(/^#\//, '').split('/')) target = nodeGet(target, part);
  return derefIfNeeded(doc, target, seen);
}

/** One navigation step (map key or seq index), transparently following a `$ref` at either end. */
function at(doc: YAML.Document, start: unknown, ...keys: Array<string | number>): unknown {
  let node = derefIfNeeded(doc, start);
  for (const key of keys) node = derefIfNeeded(doc, nodeGet(node, key));
  return node;
}

/** Descend `steps` (property names, or `'[]'` for `items`) from a schema root, as `constraintsOf` did. */
function rawSchemaAt(doc: YAML.Document, root: unknown, steps: string[]): unknown {
  let node = derefIfNeeded(doc, root);
  for (const step of steps) {
    node = step === '[]' ? at(doc, node, 'items') : at(doc, node, 'properties', step);
  }
  return node;
}

function rangeOfPair(pair: unknown): [number, number] | null {
  if (!pair || typeof pair !== 'object' || !('key' in pair) || !('value' in pair)) return null;
  const key = (pair as { key: unknown }).key;
  const value = (pair as { value: unknown }).value;
  if (!YAML.isNode(key) || !YAML.isNode(value) || !key.range || !value.range) return null;
  return [key.range[0], value.range[1]];
}

/**
 * Resolve a constraint's citation directly from the raw CST: exact `[start, end)` of the
 * `keyword: value` pair (or, for a response, the `description` scalar), sliced verbatim out
 * of the branch text. Returns null when the location can't be resolved — the caller drops
 * the candidate rather than falling back to a text scan that could cite the wrong line.
 */
export function locateConstraint(raw: RawDoc, c: Constraint): { line: number; excerpt: string } | null {
  const { doc, lineCounter, text } = raw;
  const opNode = (path: string, method: string) => at(doc, doc.contents, 'paths', path, method);

  if (c.root.kind === 'responseDescription') {
    const desc = at(doc, opNode(c.root.path, c.root.method), 'responses', c.root.status, 'description');
    if (!YAML.isScalar(desc) || !desc.range) return null;
    const [start, end] = desc.range;
    return { line: lineCounter.linePos(start).line, excerpt: text.slice(start, end) };
  }

  let root: unknown;
  switch (c.root.kind) {
    case 'param':
      root = at(doc, opNode(c.root.path, c.root.method), 'parameters', c.root.index, 'schema');
      break;
    case 'requestBody':
      root = at(doc, opNode(c.root.path, c.root.method), 'requestBody', 'content', c.root.media, 'schema');
      break;
    case 'response':
      root = at(doc, opNode(c.root.path, c.root.method), 'responses', c.root.status, 'content', c.root.media, 'schema');
      break;
    case 'schema':
      root = at(doc, doc.contents, 'components', 'schemas', c.root.name);
      break;
  }

  const node = rawSchemaAt(doc, root, c.steps);
  if (!YAML.isMap(node)) return null;
  const pair = node.items.find((p) => YAML.isScalar(p.key) && String(p.key.value) === c.keyword);
  const range = rangeOfPair(pair);
  if (!range) return null;
  return { line: lineCounter.linePos(range[0]).line, excerpt: text.slice(range[0], range[1]) };
}
