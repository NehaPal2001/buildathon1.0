import ts from 'typescript';
import path from 'node:path';

export function parse(fileName: string, text: string): ts.SourceFile {
  const kind = /\.(tsx|jsx)$/.test(fileName) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.ES2022, true, kind);
}

export function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

export function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

export function calleeName(call: ts.CallExpression): { object?: string; method: string } | null {
  const e = call.expression;
  if (ts.isIdentifier(e)) return { method: e.text };
  if (ts.isPropertyAccessExpression(e)) return { object: e.expression.getText(), method: e.name.text };
  return null;
}

export function stringArg(expr: ts.Expression | undefined): string | null {
  if (!expr) return null;
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text;
  if (ts.isTemplateExpression(expr)) return expr.getText().slice(1, -1); // keep `${...}` verbatim
  return null;
}

export function identifiersIn(node: ts.Node): string[] {
  const out = new Set<string>();
  walk(node, (n) => {
    if (ts.isIdentifier(n)) out.add(n.text);
  });
  return [...out];
}

export function enclosingFunctionName(node: ts.Node): string | undefined {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (ts.isFunctionDeclaration(n) && n.name) return n.name.text;
    if (ts.isMethodDeclaration(n) && ts.isIdentifier(n.name)) return n.name.text;
    if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && ts.isVariableDeclaration(n.parent) && ts.isIdentifier(n.parent.name)) {
      return n.parent.name.text;
    }
  }
  return undefined;
}

const HTTP_VERBS = new Set(['get', 'post', 'put', 'patch', 'delete', 'all']);

/** `router.post('/x', handler)` ancestor → { method: 'POST', path: '/x' }. */
export function enclosingRoute(node: ts.Node): { method: string; path: string } | undefined {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (ts.isCallExpression(n)) {
      const callee = calleeName(n);
      const p = stringArg(n.arguments[0]);
      if (callee?.object && HTTP_VERBS.has(callee.method) && p && p.startsWith('/')) {
        return { method: callee.method.toUpperCase(), path: p };
      }
    }
  }
  return undefined;
}

export function relativeImports(sf: ts.SourceFile): string[] {
  const out: string[] = [];
  walk(sf, (n) => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier) && n.moduleSpecifier.text.startsWith('.')) {
      out.push(n.moduleSpecifier.text);
    }
    if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier) && n.moduleSpecifier.text.startsWith('.')) {
      out.push(n.moduleSpecifier.text);
    }
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const s = stringArg(n.arguments[0]);
      if (s?.startsWith('.')) out.push(s);
    }
  });
  return out;
}

export function resolveRelative(fromFile: string, spec: string, exists: (p: string) => boolean): string | null {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
  const candidates = [
    base,
    base.replace(/\.js$/, '.ts'),
    base.replace(/\.js$/, '.tsx'),
    base + '.ts',
    base + '.tsx',
    base + '/index.ts',
    base + '/index.tsx',
  ];
  return candidates.find(exists) ?? null;
}

/** Files reachable from `file` through relative imports, including itself. */
export function reachFrom(file: string, texts: Map<string, string>): string[] {
  const seen = new Set<string>([file]);
  const queue = [file];
  while (queue.length) {
    const current = queue.shift()!;
    const text = texts.get(current);
    if (text === undefined) continue;
    for (const spec of relativeImports(parse(current, text))) {
      const resolved = resolveRelative(current, spec, (p) => texts.has(p));
      if (resolved && !seen.has(resolved)) {
        seen.add(resolved);
        queue.push(resolved);
      }
    }
  }
  return [...seen].sort();
}
