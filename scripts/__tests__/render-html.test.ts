import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FIXTURE } from './fixture';
import { computeDiff } from '../diff';
import { extractCandidates } from '../candidates';
import { renderHtml, htmlFileName, esc, prioritise, readEvidence } from '../render-html';
import { sampleAnalysis } from './sample-analysis';
import type { Analysis, State } from '../schema';

let a: Analysis;
beforeAll(async () => {
  a = sampleAnalysis(await extractCandidates(FIXTURE, computeDiff(FIXTURE, 'PROJ-4821')));
});

const stateOf = (over: Partial<State>): State => ({
  id: 'x', description: 'd', origins: [{ candidateId: 'c-1', file: 'f.ts', line: 1, excerpt: 'e', source: 'code' }],
  reachability: { kind: 'ui', steps: ['s'], evidence: 'ev' }, inClaim: false, coveredBy: [], confidence: 'high',
  ...over,
});

describe('renderHtml', () => {
  it('keeps the fixed section order and ends with regression scope', () => {
    const html = renderHtml(a);
    const order = ['What actually changed', 'Spec vs implementation', 'Reachable states', 'Questions for the dev', 'Regression scope'];
    const at = order.map((h) => html.indexOf(h));
    expect(at.every((p) => p >= 0)).toBe(true);
    expect([...at].sort((x, y) => x - y)).toEqual(at);
    expect(html.lastIndexOf('Regression scope')).toBeGreaterThan(html.lastIndexOf('Questions for the dev'));
  });

  it('is self-contained: no external host is referenced', () => {
    const html = renderHtml(a);
    expect(html).not.toMatch(/src\s*=\s*["']https?:/i);
    expect(html).not.toMatch(/href\s*=\s*["']https?:/i);
    expect(html).not.toMatch(/<link[^>]+stylesheet/i);
    expect(html).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket/);
  });

  it('cites file and line for every finding', () => {
    const html = renderHtml(a);
    expect(html).toMatch(/src\/services\/coupon\.ts:\d+/);
    expect(html).toMatch(/api\/openapi\.yaml:\d+/);
  });

  it('escapes markup and comparison operators coming from excerpts and prose', () => {
    const nasty = renderHtml({
      ...a,
      behaviourChanges: [{
        statement: 'A <script>alert(1)</script> & a < b comparison',
        origins: [{ candidateId: 'c-1', file: 'a.ts', line: 2, excerpt: 'x < y', source: 'code' }],
      }],
    });
    expect(nasty).not.toContain('<script>alert(1)</script>');
    expect(nasty).toContain('&lt;script&gt;');
    // The page's own inline script tag must still be the only real one.
    expect(nasty.match(/<script>/g)).toHaveLength(1);
  });

  it('names the file by date and branch slug, with an .html extension', () => {
    expect(htmlFileName(a)).toBe('2026-09-22-feature-proj-4821.html');
  });

  it('declares a light palette on bare :root and overrides for dark both ways', () => {
    const html = renderHtml(a);
    expect(html).toMatch(/:root\{[^}]*--bg:/);
    expect(html).toContain('prefers-color-scheme:dark');
    expect(html).toContain(':root[data-theme="dark"]');
    expect(html).toMatch(/body\{[^}]*background:var\(--bg\)/);
  });

  it('says scope was not computed, without claiming no suite was found', () => {
    const html = renderHtml(a);
    expect(html).toContain('Regression scope — not computed');
    // render.ts asserts "no Playwright suite was found" here, which is false whenever a suite
    // exists — scope is simply not produced by this milestone. Do not repeat that claim.
    expect(html).not.toMatch(/no Playwright suite was found/i);
  });

  it('renders the scope table when scope is present', () => {
    const html = renderHtml({
      ...a,
      scope: {
        totalTests: 42, newTests: 2,
        inScope: [{ spec: 'e2e/specs/coupon.spec.ts', reason: 'visits /checkout', facts: ['/checkout'] }],
        outOfScope: [{ spec: 'e2e/specs/search.spec.ts', reason: 'only visits /search', facts: ['/search'] }],
      },
    });
    expect(html).toContain('42 tests in 2 spec files');
    expect(html).toContain('e2e/specs/coupon.spec.ts');
    expect(html).toContain('2 new to write');
  });

  it('softens the claim wording when the claim came from commit messages', () => {
    expect(renderHtml({ ...a, claim: { source: 'commits', text: 'c' } })).toContain('implied by the commits');
    expect(renderHtml(a)).toContain('in the claim');
  });

  it('warns when files could not be read, naming them', () => {
    const html = renderHtml({ ...a, unparsed: { file: ['src/weird.ts'], ui: [], suite: [] } });
    expect(html).toContain('could not be read');
    expect(html).toContain('src/weird.ts');
  });

  it('carries a filter row whose values match the row data attributes', () => {
    const html = renderHtml(a);
    for (const v of ['high', 'medium', 'low']) expect(html).toContain(`data-group="conf" data-value="${v}"`);
    for (const v of ['ui', 'api', 'data', 'unreachable']) expect(html).toContain(`data-group="kind" data-value="${v}"`);
    expect(html).toMatch(/data-conf="(high|medium|low)"/);
    expect(html).toMatch(/data-kind="(ui|api|data|unreachable)"/);
  });
});

describe('prioritise', () => {
  it('puts UI-reachable high-confidence states first and unreachable ones last', () => {
    const ordered = prioritise([
      stateOf({ id: 'dead', reachability: { kind: 'unreachable', why: 'w', evidence: 'e' }, confidence: 'low' }),
      stateOf({ id: 'ui-low', confidence: 'low' }),
      stateOf({ id: 'ui-high', confidence: 'high' }),
      stateOf({ id: 'api-high', reachability: { kind: 'api', setup: 's', evidence: 'e' }, confidence: 'high' }),
    ]);
    expect(ordered.map((s) => s.id)).toEqual(['ui-high', 'ui-low', 'api-high', 'dead']);
  });

  it('does not mutate its input', () => {
    const input = [stateOf({ id: 'a', confidence: 'low' }), stateOf({ id: 'b', confidence: 'high' })];
    prioritise(input);
    expect(input.map((s) => s.id)).toEqual(['a', 'b']);
  });
});

describe('esc', () => {
  it('escapes the five characters that break markup or attributes', () => {
    expect(esc(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&#39;');
  });

  it('escapes & before the entities it introduces, so output is not double-escaped', () => {
    expect(esc('a & <b>')).toBe('a &amp; &lt;b&gt;');
  });
});

describe('readEvidence', () => {
  it('returns [] for a directory that does not exist', () => {
    expect(readEvidence(path.join(os.tmpdir(), 'recon-no-such-evidence-dir'))).toEqual([]);
  });

  it('reads .md and .txt in name order and ignores anything else', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recon-evidence-'));
    fs.writeFileSync(path.join(dir, 'b-second.txt'), 'two');
    fs.writeFileSync(path.join(dir, 'a-first.md'), 'one');
    fs.writeFileSync(path.join(dir, 'ignored.json'), '{}');
    expect(readEvidence(dir)).toEqual([
      { name: 'a-first.md', body: 'one' },
      { name: 'b-second.txt', body: 'two' },
    ]);
  });

  it('embeds evidence under its own heading, escaped', () => {
    const html = renderHtml(a, [{ name: 'probe.md', body: 'status 500 for a < b' }]);
    expect(html).toContain('Evidence — checked against the running app');
    expect(html).toContain('probe.md');
    expect(html).toContain('a &lt; b');
  });
});
