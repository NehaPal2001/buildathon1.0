import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FIXTURE, FEATURE } from './fixture';
import { makeRepo } from './make-repo';
import { extractSuite } from '../suite-facts';
import { renderConventions, mergeConventions, writeConventions, EXCLUSIONS_HEADING } from '../conventions';

const suite = extractSuite(FIXTURE, FEATURE, 'e2e');

describe('conventions', () => {
  it('describes the obtain pattern, locators, assertions and naming', () => {
    const md = renderConventions(suite);
    expect(md).toContain('test.extend');
    expect(md).toContain('e2e/fixtures.ts');
    expect(md).toMatch(/\| getByTestId \| \d+ \|/);
    expect(md).toMatch(/\| toBeVisible \| \d+ \|/);
    expect(md).toContain('e2e/pages/');
    expect(md).toContain('`<name>.spec.ts`');
    expect(md).toContain('Coupons › a percent coupon reduces the total');
    expect(md).toMatch(/locator call\(s\) are made directly on `page`/);
  });

  it('adds an empty Exclusions section when none exists', () => {
    const merged = mergeConventions(null, renderConventions(suite));
    expect(merged).toContain(EXCLUSIONS_HEADING);
    expect(merged).toContain('<!-- ignore states from <glob> -->');
  });

  it('preserves a hand-written Exclusions section byte-for-byte', () => {
    const hand = `${EXCLUSIONS_HEADING}\n- ignore states from src/legacy/**\n- treat src/shared/money.ts as always in regression scope\n\n  trailing   spaces and odd    spacing\n`;
    const existing = `# stale\n\nold content\n\n${hand}`;
    const merged = mergeConventions(existing, renderConventions(suite));
    expect(merged.endsWith(hand)).toBe(true);
    expect(merged).not.toContain('old content');
  });

  it('writes the file and is idempotent on the Exclusions section', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recon-conv-'));
    const file = path.join(dir, 'conventions.md');
    writeConventions(suite, file);
    const first = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, first.replace('<!-- ignore states from <glob> -->', '- ignore states from src/legacy/**'));
    writeConventions(suite, file);
    expect(fs.readFileSync(file, 'utf8')).toContain('- ignore states from src/legacy/**');
  });
});

describe('conventions: Exclusions round-trip edge cases', () => {
  it('has no Exclusions heading at all -> gets the empty scaffold appended', () => {
    const existing = '# old\n\nsome regenerated-looking content, no heading here\n';
    const merged = mergeConventions(existing, renderConventions(suite));
    expect(merged).not.toContain('some regenerated-looking content');
    expect(merged).toContain(EXCLUSIONS_HEADING);
    expect(merged).toContain('<!-- ignore states from <glob> -->');
  });

  it('an empty Exclusions section (heading with nothing below) is preserved as-is', () => {
    const hand = `${EXCLUSIONS_HEADING}\n`;
    const existing = `# old\n\nstuff\n\n${hand}`;
    const merged = mergeConventions(existing, renderConventions(suite));
    expect(merged.endsWith(hand)).toBe(true);
  });

  it('preserves real hand-written content below the heading, unusual whitespace and all', () => {
    const hand = `${EXCLUSIONS_HEADING}\r\n- ignore states from src/legacy/**   \n\n\n-   treat src/shared/money.ts as always in regression scope\n   \n`;
    const existing = `# old\n\nstuff\n\n${hand}`;
    const merged = mergeConventions(existing, renderConventions(suite));
    expect(merged.endsWith(hand)).toBe(true);
  });

  it('trailing newlines on the whole file are preserved exactly', () => {
    const hand = `${EXCLUSIONS_HEADING}\n- keep this\n\n\n\n`;
    const existing = `# old\n\nstuff\n\n${hand}`;
    const merged = mergeConventions(existing, renderConventions(suite));
    expect(merged.endsWith(hand)).toBe(true);
  });

  it('the heading appearing twice (both real, outside any fence): everything from the first is preserved, nothing lost', () => {
    const existing = `# old\n\nstuff\n\n${EXCLUSIONS_HEADING}\n- first block\n\n${EXCLUSIONS_HEADING}\n- second block\n`;
    const merged = mergeConventions(existing, renderConventions(suite));
    const tail = `${EXCLUSIONS_HEADING}\n- first block\n\n${EXCLUSIONS_HEADING}\n- second block\n`;
    expect(merged.endsWith(tail)).toBe(true);
    expect(merged).toContain('- first block');
    expect(merged).toContain('- second block');
  });

  it('text that merely mentions "## Exclusions" inside a fenced code block earlier in the file is not mistaken for the real heading', () => {
    const existing =
      '# old\n\n' +
      'Example:\n\n' +
      '```\n' +
      '## Exclusions\n' +
      '- example only, not real\n' +
      '```\n\n' +
      'some more stale prose\n\n' +
      `${EXCLUSIONS_HEADING}\n- real content only\n`;
    const merged = mergeConventions(existing, renderConventions(suite));
    const tail = `${EXCLUSIONS_HEADING}\n- real content only\n`;
    expect(merged.endsWith(tail)).toBe(true);
    expect(merged).not.toContain('example only, not real');
    expect(merged).not.toContain('stale prose');
    // no stray/unbalanced code fence leaked into the merged output
    expect((merged.match(/```/g) ?? []).length % 2).toBe(0);
  });

  it('an unterminated fence before the real heading does not destroy the hand-written section (fail-safe fallback)', () => {
    // The fenced ```ts block below is never closed. A strict fence-aware scan would (correctly,
    // per CommonMark) consider everything after it — including the real "## Exclusions" line —
    // to be "inside" that fence, and thus invisible. Losing the tester's content here would be
    // exactly the data-loss bug this file exists to prevent, so the fallback pass (which ignores
    // fence state entirely once the strict pass finds nothing) must still find and preserve it.
    const existing =
      '# old\n\nHere is an example:\n\n```ts\n' +
      "test('example', () => {});\n\n" +
      `${EXCLUSIONS_HEADING}\n- ignore states from src/legacy/**\n`;
    const merged = mergeConventions(existing, renderConventions(suite));
    expect(merged).toContain('- ignore states from src/legacy/**');
    expect(merged).not.toContain('<!-- ignore states from <glob> -->');
  });

  it('a fenced block containing a mismatched delimiter (``` containing a ~~~ line) does not desync fence state and swallow the real heading', () => {
    // A naive same-character-agnostic toggle would flip "in fence" off on the ~~~ line (still
    // inside the ``` block), then flip it back ON on the real closing ```, leaving the parser
    // wrongly believing everything after that — including the real heading — is fenced.
    const existing =
      '# old\n\n```\nsome code\n~~~\nmore code\n```\n\nprose\n\n' +
      `${EXCLUSIONS_HEADING}\n- keep this real content\n`;
    const merged = mergeConventions(existing, renderConventions(suite));
    const tail = `${EXCLUSIONS_HEADING}\n- keep this real content\n`;
    expect(merged.endsWith(tail)).toBe(true);
    expect(merged).not.toContain('<!-- ignore states from <glob> -->');
  });

  it('a tilde-fenced block containing a mismatched backtick line does not desync fence state either', () => {
    const existing =
      '# old\n\n~~~\nsome code\n```\nmore code\n~~~\n\nprose\n\n' +
      `${EXCLUSIONS_HEADING}\n- keep this content too\n`;
    const merged = mergeConventions(existing, renderConventions(suite));
    const tail = `${EXCLUSIONS_HEADING}\n- keep this content too\n`;
    expect(merged.endsWith(tail)).toBe(true);
  });

  it('a fence closed by a longer run of the same character (valid CommonMark) closes correctly', () => {
    // Opened with 3 backticks, closed with 4 — CommonMark allows a closing fence to be longer
    // than (but not shorter than, nor a different character from) its opener.
    const existing =
      '# old\n\n```\nsome code\n````\n\nprose\n\n' +
      `${EXCLUSIONS_HEADING}\n- keep this fenced-close content\n`;
    const merged = mergeConventions(existing, renderConventions(suite));
    const tail = `${EXCLUSIONS_HEADING}\n- keep this fenced-close content\n`;
    expect(merged.endsWith(tail)).toBe(true);
  });

  it('running the generator twice in a row is idempotent', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recon-conv-idem-'));
    const file = path.join(dir, 'conventions.md');
    writeConventions(suite, file);
    const first = fs.readFileSync(file, 'utf8');
    writeConventions(suite, file);
    const second = fs.readFileSync(file, 'utf8');
    expect(second).toBe(first);
  });

  it('does not crash and reports "(none)" for a suite with no page objects at all', () => {
    const dir = makeRepo({
      'e2e/specs/plain.spec.ts': `
        import { test } from '@playwright/test';
        test('does something with no page objects', async ({ page }) => {
          await page.goto('/plain');
        });
      `,
    });
    const bare = extractSuite(dir, 'main', 'e2e');
    expect(bare.pageObjects).toHaveLength(0);
    let md = '';
    expect(() => {
      md = renderConventions(bare);
    }).not.toThrow();
    expect(md).toContain('(none)');
  });
});
