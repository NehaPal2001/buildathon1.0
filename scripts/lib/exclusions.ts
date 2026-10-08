import type { State } from '../schema';

export const EXCLUSIONS_HEADING = '## Exclusions';

export interface Exclusions {
  ignoreGlobs: string[];
  ignoreOrigins: string[];
  alwaysInScope: string[];
  unrecognised: string[];
}

const FORMS: Array<[RegExp, keyof Omit<Exclusions, 'unrecognised'>]> = [
  [/^ignore states from (\S+)$/i, 'ignoreGlobs'],
  [/^ignore states whose origin is (.+)$/i, 'ignoreOrigins'],
  [/^treat (\S+) as always in regression scope$/i, 'alwaysInScope'],
];

export function parseExclusions(markdown: string | null): Exclusions {
  const out: Exclusions = { ignoreGlobs: [], ignoreOrigins: [], alwaysInScope: [], unrecognised: [] };
  if (!markdown) return out;
  const idx = markdown.indexOf(EXCLUSIONS_HEADING);
  if (idx < 0) return out;
  const section = markdown.slice(idx + EXCLUSIONS_HEADING.length).replace(/<!--[\s\S]*?-->/g, '');
  for (const raw of section.split('\n')) {
    const line = raw.trim().replace(/^[-*]\s+/, '');
    if (!line || line.startsWith('#')) continue;
    const form = FORMS.find(([re]) => re.test(line));
    if (!form) { out.unrecognised.push(line); continue; }
    out[form[1]].push(line.match(form[0])![1].trim());
  }
  return out;
}

export function globToRegex(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  // A single tokenizing pass, not sequential replaces: `**` isn't in the escape class above, so
  // it survives into this scan still literal, and String.replace never rescans text it just
  // substituted — so the `.*` inserted for a bare `**` can't itself be re-matched and mangled by
  // a later `*` rule the way three chained `.replace()` calls would (verified: that ordering
  // turned `src/legacy/**` into `^src/legacy/.[^/]*$`, which fails to match a nested path like
  // `src/legacy/a/b.ts` — exactly the case this function exists to handle).
  const pattern = escaped.replace(/\*\*\/|\*\*|\*/g, (m) => {
    if (m === '**/') return '(?:.*/)?';
    if (m === '**') return '.*';
    return '[^/]*';
  });
  return new RegExp(`^${pattern}$`);
}

export function applyExclusions(states: State[], ex: Exclusions): { kept: State[]; suppressed: number } {
  const globs = ex.ignoreGlobs.map(globToRegex);
  const kept = states.filter((s) => {
    if (s.exclusionNote) return false;
    if (globs.length && s.origins.every((o) => globs.some((g) => g.test(o.file)))) return false;
    return true;
  });
  return { kept, suppressed: states.length - kept.length };
}
