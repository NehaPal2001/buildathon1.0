declare global {
  namespace Express {
    interface Request { sid: string }
  }
}
export {};
