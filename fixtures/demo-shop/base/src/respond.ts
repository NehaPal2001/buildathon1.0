import type { Request, Response } from 'express';

export function wantsJson(req: Request): boolean {
  return Boolean(req.is('application/json')) || (req.headers.accept ?? '').includes('application/json');
}

/** JSON for API clients, 303 redirect for HTML form posts. */
export function respond(req: Request, res: Response, redirectTo: string, payload: unknown, status = 200): void {
  if (wantsJson(req)) {
    res.status(status).json(payload);
    return;
  }
  res.redirect(303, redirectTo);
}
