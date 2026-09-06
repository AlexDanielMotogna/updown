import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../db', () => ({
  prisma: {
    adminAction: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

import { prisma } from '../db';
import { auditAdminActions } from './admin-audit';

/**
 * Builds an app shaped like the real admin router: audit first, then a fake
 * auth layer that sets req.adminRole or rejects, then handlers. The ordering is
 * the part under test as much as the redaction is.
 */
function buildApp(opts: { authenticates?: boolean } = {}) {
  const { authenticates = true } = opts;
  const app = express();
  app.use(express.json());

  app.use(auditAdminActions);

  app.use((req, res, next) => {
    if (!authenticates) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
      return;
    }
    req.adminRole = 'super';
    next();
  });

  app.post('/actions/resolve-pool', (_req, res) => {
    res.json({ success: true, data: { poolId: 'pool-1', status: 'RESOLVED' }, message: 'Pool resolution triggered' });
  });
  app.get('/pools', (_req, res) => {
    res.json({ success: true, data: [] });
  });
  app.post('/boom', (_req, res) => {
    res.status(500).json({ success: false, error: { code: 'ACTION_ERROR', message: 'it broke' } });
  });

  return app;
}

/** Wait for the fire-and-forget write that happens on res 'finish'. */
const flush = () => new Promise(r => setImmediate(r));

function lastRow() {
  const calls = vi.mocked(prisma.adminAction.create).mock.calls;
  return calls[calls.length - 1][0].data as Record<string, unknown>;
}

describe('auditAdminActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records a write with the actor, the route and the outcome', async () => {
    await request(buildApp())
      .post('/actions/resolve-pool')
      .set('x-admin-key', 'super-secret-admin-key')
      .set('user-agent', 'test-agent/1.0')
      .send({ poolId: 'pool-1' });
    await flush();

    expect(prisma.adminAction.create).toHaveBeenCalledTimes(1);
    const row = lastRow();
    expect(row.role).toBe('super');
    expect(row.method).toBe('POST');
    expect(row.path).toBe('/actions/resolve-pool');
    expect(row.statusCode).toBe(200);
    expect(row.userAgent).toBe('test-agent/1.0');
    expect(row.requestBody).toEqual({ poolId: 'pool-1' });
    expect(row.outcome).toMatchObject({ success: true, statusCode: 200, poolId: 'pool-1', status: 'RESOLVED' });
    expect(typeof row.durationMs).toBe('number');
  });

  it('fingerprints the key without storing it', async () => {
    await request(buildApp())
      .post('/actions/resolve-pool')
      .set('x-admin-key', 'super-secret-admin-key')
      .send({ poolId: 'pool-1' });
    await flush();

    const row = lastRow();
    // sha256('super-secret-admin-key'), first 16 hex chars.
    expect(row.keyFingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(row)).not.toContain('super-secret-admin-key');
  });

  it('gives the same fingerprint for the same key and a different one otherwise', async () => {
    const app = buildApp();
    await request(app).post('/actions/resolve-pool').set('x-admin-key', 'key-a').send({});
    await request(app).post('/actions/resolve-pool').set('x-admin-key', 'key-a').send({});
    await request(app).post('/actions/resolve-pool').set('x-admin-key', 'key-b').send({});
    await flush();

    const [a1, a2, b] = vi.mocked(prisma.adminAction.create).mock.calls.map(
      c => (c[0].data as Record<string, unknown>).keyFingerprint
    );
    expect(a1).toBe(a2);
    expect(b).not.toBe(a1);
  });

  it('records requests that never authenticated — the ones an attack produces', async () => {
    await request(buildApp({ authenticates: false }))
      .post('/actions/resolve-pool')
      .set('x-admin-key', 'wrong-key')
      .send({ poolId: 'pool-1' });
    await flush();

    const row = lastRow();
    expect(row.statusCode).toBe(401);
    expect(row.role).toBeNull();
    // The fingerprint of the WRONG key is the useful part: it tells you whether
    // an attacker is guessing or holding one specific stale credential.
    expect(row.keyFingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(row.outcome).toMatchObject({ success: false, errorCode: 'UNAUTHORIZED' });
  });

  it('redacts credential-shaped fields in the body', async () => {
    await request(buildApp())
      .post('/actions/resolve-pool')
      .send({
        poolId: 'pool-1',
        newAdminKey: 'should-not-appear',
        nested: { privateKey: 'also-not', walletAddress: 'keep-me' },
        apiToken: 'nope',
      });
    await flush();

    const body = lastRow().requestBody as Record<string, unknown>;
    expect(body.newAdminKey).toBe('[REDACTED]');
    expect(body.apiToken).toBe('[REDACTED]');
    expect((body.nested as Record<string, unknown>).privateKey).toBe('[REDACTED]');
    expect((body.nested as Record<string, unknown>).walletAddress).toBe('keep-me');
    expect(JSON.stringify(body)).not.toContain('should-not-appear');
    expect(JSON.stringify(body)).not.toContain('also-not');
  });

  it('does not record reads', async () => {
    await request(buildApp()).get('/pools').set('x-admin-key', 'k');
    await flush();
    expect(prisma.adminAction.create).not.toHaveBeenCalled();
  });

  it('records the error code when the handler fails', async () => {
    await request(buildApp()).post('/boom').set('x-admin-key', 'k').send({});
    await flush();

    const row = lastRow();
    expect(row.statusCode).toBe(500);
    expect(row.outcome).toMatchObject({ success: false, errorCode: 'ACTION_ERROR', errorMessage: 'it broke' });
  });

  it('never fails the request when the audit write throws', async () => {
    vi.mocked(prisma.adminAction.create).mockRejectedValueOnce(new Error('db down'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(buildApp())
      .post('/actions/resolve-pool')
      .set('x-admin-key', 'k')
      .send({ poolId: 'pool-1' });
    await flush();

    // The operator's force-resolve still succeeded...
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // ...and the lost row is recoverable from stderr.
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('[admin-audit] FAILED to persist'));
    errSpy.mockRestore();
  });

  it('caps an oversized body instead of storing it whole', async () => {
    await request(buildApp())
      .post('/actions/resolve-pool')
      .send({ blob: 'x'.repeat(50_000) });
    await flush();

    const body = lastRow().requestBody as Record<string, unknown>;
    // The long string is truncated by the string cap, well under the byte cap.
    expect(JSON.stringify(body).length).toBeLessThan(2_000);
    expect(body.blob).toContain('[+49500 chars]');
  });
});
