import { Router } from 'express';
import { reset } from '../store';
import { setNow } from '../clock';

export const testRouter = Router();

/** Test-only: reseed the store; optional {now: ISO} moves the fake clock. */
testRouter.post('/api/test/reset', (req, res) => {
  if (req.body?.now) setNow(String(req.body.now));
  reset();
  res.json({ ok: true });
});
