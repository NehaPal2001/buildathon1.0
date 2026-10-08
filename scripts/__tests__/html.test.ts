import { describe, it, expect } from 'vitest';
import { extractElements } from '../lib/html';

const lineAt = () => 1;

/** Locate `needle` in `html` and return its `[start, end)` range — used to build the
 * `placeholderRanges` argument the same way a real caller (which knows the exact
 * boundary from the TypeScript AST) would, without hand-computing indices. */
function rangeOf(html: string, needle: string): [number, number] {
  const start = html.indexOf(needle);
  if (start < 0) throw new Error(`needle not found in html: ${needle}`);
  return [start, start + needle.length];
}

describe('extractElements: caller-supplied placeholder ranges', () => {
  it('keeps a quote inside ${} verbatim in data-testid, without corrupting the attribute', () => {
    const html = '<button data-testid="add-${x.replace(/"/g, \'\')}">Add</button>';
    const ranges = [rangeOf(html, '${x.replace(/"/g, \'\')}')];
    const [btn] = extractElements(html, 'f.ts', lineAt, ranges);
    expect(btn.attrs['data-testid']).toBe('add-${x.replace(/"/g, \'\')}');
  });

  it('keeps a quote inside ${} verbatim in a form action, and propagates to descendants', () => {
    const html =
      '<form method="post" action="/api/cart/${x.replace(/"/g, \'\')}/remove"><button data-testid="go">Go</button></form>';
    const ranges = [rangeOf(html, '${x.replace(/"/g, \'\')}')];
    const els = extractElements(html, 'f.ts', lineAt, ranges);
    const btn = els.find((e) => e.element === 'button')!;
    expect(btn.form?.action).toBe('/api/cart/${x.replace(/"/g, \'\')}/remove');
  });

  it('does not truncate the tag when ${} contains a >', () => {
    const html = '<input data-testid="${a > b ? \'x\' : \'y\'}" name="after">';
    const ranges = [rangeOf(html, '${a > b ? \'x\' : \'y\'}')];
    const [el] = extractElements(html, 'f.ts', lineAt, ranges);
    expect(el.attrs.name).toBe('after');
    expect(Object.keys(el.attrs).sort()).toEqual(['data-testid', 'name']);
  });

  it('yields an empty string for a bare valueless attribute', () => {
    const html = '<input required name="q">';
    const [el] = extractElements(html, 'f.ts', lineAt, []);
    expect(el.attrs.required).toBe('');
    expect(el.attrs.name).toBe('q');
  });

  it('preserves a ${...} span that itself contains a nested template literal, verbatim', () => {
    // As the real AST would report it: the *entire* outer substitution — including
    // the nested backtick and its own ${b} — is one placeholder range from the
    // perspective of the outer template.
    const html = '<button data-testid="v-${a ? `n${b}` : \'z\'}">Go</button>';
    const ranges = [rangeOf(html, '${a ? `n${b}` : \'z\'}')];
    const [el] = extractElements(html, 'f.ts', lineAt, ranges);
    expect(el.attrs['data-testid']).toBe('v-${a ? `n${b}` : \'z\'}');
  });

  it("reviewer's repro: a } inside a string inside ${} does not manufacture attributes", () => {
    // x['}'] contains a literal '}' inside a string literal, and the expression also
    // contains a literal " inside a single-quoted string. A text-based brace/quote
    // scanner gets both wrong; the AST knows the true boundary is the whole span up
    // to the closing } that matches this ${. The caller is expected to supply that
    // exact range (this is what placeholderRanges() in ui-surface.ts now computes
    // from the AST rather than inferring from text).
    const html = '<button data-testid="pre-${x[\'}\'] + \'"Q"\'}-post" name="after">';
    const ranges = [rangeOf(html, '${x[\'}\'] + \'"Q"\'}')];
    const [el] = extractElements(html, 'f.ts', lineAt, ranges);
    expect(el.attrs['data-testid']).toBe('pre-${x[\'}\'] + \'"Q"\'}-post');
    expect(el.attrs.name).toBe('after');
    // The signature of this bug class is a bogus extra key manufactured from the
    // leftover text after a misread quote/brace — assert none exists, by name and
    // by an exact key count.
    expect(el.attrs).not.toHaveProperty('q');
    expect(el.attrs).not.toHaveProperty('-post');
    expect(Object.keys(el.attrs).sort()).toEqual(['data-testid', 'name']);
  });

  it('${x[\'}\']}  alone: a lone } inside a string inside ${} does not manufacture attributes', () => {
    const html = '<input data-testid="${x[\'}\']}" name="q2">';
    const ranges = [rangeOf(html, '${x[\'}\']}')];
    const [el] = extractElements(html, 'f.ts', lineAt, ranges);
    expect(el.attrs['data-testid']).toBe('${x[\'}\']}');
    expect(el.attrs.name).toBe('q2');
    expect(Object.keys(el.attrs).sort()).toEqual(['data-testid', 'name']);
  });

  it('degrades safely on a genuinely unterminated ${ at end of input: no throw, no manufactured elements', () => {
    // Simulates what a truncated/malformed template literal's text looks like: no
    // closing quote, no closing tag. There is nothing here for TAG to legally match
    // (no closing `>`), so the safe outcome is an empty result, not a thrown error.
    const html = '<button data-testid="pre-${';
    const range: [number, number] = [html.indexOf('${'), html.length];
    expect(() => extractElements(html, 'f.ts', lineAt, [range])).not.toThrow();
    expect(extractElements(html, 'f.ts', lineAt, [range])).toEqual([]);
  });

  it('clamps a placeholder range that runs past the end of the string, without growing the output', () => {
    // A defensive guard on maskRanges itself: even a caller-supplied range far past
    // the string's length must not throw, hang, or change the string's length (which
    // would silently break every line offset computed after it).
    const html = '<input name="q">';
    const range: [number, number] = [5, 10_000];
    expect(() => extractElements(html, 'f.ts', lineAt, [range])).not.toThrow();
  });
});
