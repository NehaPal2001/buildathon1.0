// FAKE_NOW (ISO string) freezes the clock; POST /api/test/reset {now} can override it at runtime.
let fixed: Date | null = process.env.FAKE_NOW ? new Date(process.env.FAKE_NOW) : null;

export function now(): Date {
  return fixed ? new Date(fixed) : new Date();
}

export function setNow(iso: string | null): void {
  fixed = iso ? new Date(iso) : null;
}
