import { Request, Response, NextFunction } from 'express';

export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    res.status(503).json({ success: false, error: { code: 'NOT_CONFIGURED', message: 'Admin not configured' } });
    return;
  }
  const provided = req.headers['x-admin-key'];
  if (!provided || provided !== adminKey) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
    return;
  }
  next();
}
