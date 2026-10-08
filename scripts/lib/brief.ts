type Row = string[];
type Block =
  | { kind: 'title'; text: string; sub: string[] }
  | { kind: 'heading'; text: string }
  | { kind: 'line'; text: string; indent: number }
  | { kind: 'table'; headers: string[]; rows: Row[] }
  | { kind: 'blank' };

/**
 * A minimal two-target document builder: one ordered list of blocks, rendered either as plain
 * terminal text (fixed-width columns, no ANSI) or as GitHub-flavoured markdown. Every section
 * of the brief is built by calling these methods in the order they should appear — the order
 * is not re-derived or sorted anywhere, so it is exactly the call order in render.ts.
 */
export class Doc {
  private blocks: Block[] = [];
  title(text: string, ...sub: string[]) { this.blocks.push({ kind: 'title', text, sub }); return this; }
  heading(text: string) { this.blocks.push({ kind: 'blank' }, { kind: 'heading', text }); return this; }
  line(text: string, indent = 1) { this.blocks.push({ kind: 'line', text, indent }); return this; }
  table(headers: string[], rows: Row[]) { this.blocks.push({ kind: 'table', headers, rows }); return this; }
  blank() { this.blocks.push({ kind: 'blank' }); return this; }

  terminal(): string {
    const out: string[] = [];
    for (const b of this.blocks) {
      switch (b.kind) {
        case 'title': out.push(b.text, ...b.sub); break;
        case 'heading': out.push(b.text); break;
        case 'line': out.push('  '.repeat(b.indent) + b.text); break;
        case 'blank': out.push(''); break;
        case 'table': {
          const widths = b.headers.map((h, i) => Math.max(h.length, ...b.rows.map((r) => (r[i] ?? '').length)));
          const fmt = (r: Row) => '  ' + r.map((c, i) => (c ?? '').padEnd(widths[i])).join('  ').trimEnd();
          out.push(fmt(b.headers), ...b.rows.map(fmt));
          break;
        }
      }
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
  }

  markdown(): string {
    const out: string[] = [];
    for (const b of this.blocks) {
      switch (b.kind) {
        case 'title': out.push(`# ${b.text}`, '', ...b.sub.map((s) => `_${s}_  `)); break;
        case 'heading': out.push(`## ${b.text}`, ''); break;
        case 'line': out.push((b.indent > 1 ? '  '.repeat(b.indent - 1) : '') + (b.text.startsWith('·') || /^\d+\./.test(b.text) ? b.text.replace(/^·/, '-') : b.text) + '  '); break;
        case 'blank': out.push(''); break;
        case 'table':
          out.push(`| ${b.headers.join(' | ')} |`, `|${b.headers.map(() => '---').join('|')}|`, ...b.rows.map((r) => `| ${r.map((c) => (c ?? '').replace(/\|/g, '\\|')).join(' | ')} |`), '');
          break;
      }
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
  }
}
