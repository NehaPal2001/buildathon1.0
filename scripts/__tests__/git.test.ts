import { describe, it, expect } from 'vitest';
import { FIXTURE, FEATURE } from './fixture';
import { resolveBranch, findBase, showFile, listFiles, BranchResolutionError } from '../lib/git';
import { findSuiteDir } from '../lib/suite-dir';

describe('git helpers', () => {
  it('resolves an exact branch name', () => {
    expect(resolveBranch(FIXTURE, FEATURE)).toBe(FEATURE);
  });

  it('resolves a ticket id to the unique matching branch', () => {
    expect(resolveBranch(FIXTURE, 'PROJ-4821')).toBe(FEATURE);
  });

  it('throws with the match list when nothing matches', () => {
    expect(() => resolveBranch(FIXTURE, 'PROJ-9999')).toThrow(BranchResolutionError);
  });

  it('finds main as the base', () => {
    expect(findBase(FIXTURE)).toBe('main');
  });

  it('reads a file at a ref without checking it out', () => {
    expect(showFile(FIXTURE, FEATURE, 'src/services/coupon.ts')).toContain('applyCoupon');
    expect(showFile(FIXTURE, 'main', 'src/services/coupon.ts')).toBeNull();
  });

  it('lists files and finds the suite dir', () => {
    expect(listFiles(FIXTURE, 'main')).toContain('src/app.ts');
    expect(findSuiteDir(FIXTURE, 'main')).toBe('e2e');
    expect(findSuiteDir(FIXTURE, 'main', 'custom/')).toBe('custom');
  });
});
