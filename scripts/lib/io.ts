import fs from 'node:fs';
import path from 'node:path';
import { ZodError } from 'zod';

/** `--key value` and bare `--flag` → { key: 'value', flag: 'true' }. */
export function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = 'true';
    }
  }
  return out;
}

export function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

export function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

export function fail(message: string): never {
  process.stderr.write(message + '\n');
  process.exit(1);
}

/**
 * Collapse any thrown value to one line for `fail()` (I6): a `ZodError` can carry hundreds of
 * issues, and printing it (or an uncaught error's stack) violates the "failures exit 1 with
 * one line on stderr" constraint. Reports the first issue plus a count of the rest.
 */
export function formatError(err: unknown): string {
  if (err instanceof ZodError) {
    const [first, ...rest] = err.issues;
    if (!first) return 'invalid input: schema validation failed';
    const where = first.path.length ? `${first.path.join('.')}: ` : '';
    const suffix = rest.length ? ` (+${rest.length} more issue${rest.length === 1 ? '' : 's'})` : '';
    return `invalid input — ${where}${first.message}${suffix}`;
  }
  const message = err instanceof Error ? err.message : String(err);
  return message.split('\n')[0];
}

/** True when `file` is the script node was started with (not when imported by tests). */
export function isMain(file: string): boolean {
  return process.argv[1] !== undefined && path.resolve(process.argv[1]) === file;
}

/** `--help` present among parsed args (I7: usage goes to stdout with exit 0, not stderr+1). */
export function wantsHelp(args: Record<string, string>): boolean {
  return args.help !== undefined;
}

export function printUsage(usage: string): never {
  process.stdout.write(usage + '\n');
  process.exit(0);
}
