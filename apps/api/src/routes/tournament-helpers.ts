// Shared helpers used by both tournament route files

// BigInt can't be JSON.stringify'd — convert to string
export function serializeBigInt(data: unknown) {
  return JSON.parse(JSON.stringify(data, (_key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  ));
}

// Admin auth helper
export function requireAdmin(req: any, res: any): boolean {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    res.status(503).json({ success: false, error: { code: 'NOT_CONFIGURED', message: 'Admin not configured' } });
    return false;
  }
  const provided = req.headers['x-admin-key'];
  if (!provided || provided !== adminKey) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
    return false;
  }
  return true;
}
