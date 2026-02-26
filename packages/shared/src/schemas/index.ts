import { z } from 'zod';

export const sideSchema = z.enum(['UP', 'DOWN']);

export const depositRequestSchema = z.object({
  poolId: z.string().uuid(),
  side: sideSchema,
  amount: z.number().positive(),
});

export const claimRequestSchema = z.object({
  poolId: z.string().uuid(),
});

export const poolFilterSchema = z.object({
  asset: z.string().optional(),
  status: z.enum(['UPCOMING', 'JOINING', 'ACTIVE', 'RESOLVED', 'CLAIMABLE']).optional(),
  interval: z.enum(['15m', '1h', '24h']).optional(),
});

export type DepositRequest = z.infer<typeof depositRequestSchema>;
export type ClaimRequest = z.infer<typeof claimRequestSchema>;
export type PoolFilter = z.infer<typeof poolFilterSchema>;
