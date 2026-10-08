import type { RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';

export const session: RequestHandler = (req, res, next) => {
  const pairs = (req.headers.cookie ?? '').split(';').map((c) => c.trim().split('='));
  const cookies = Object.fromEntries(pairs.filter(([k]) => k));
  let sid = cookies.sid;
  if (!sid) {
    sid = randomUUID();
    res.setHeader('Set-Cookie', `sid=${sid}; Path=/; HttpOnly`);
  }
  req.sid = sid;
  next();
};
