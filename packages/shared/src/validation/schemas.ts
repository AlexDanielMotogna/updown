import { z } from 'zod';
import { INTERVALS, MIN_DEPOSIT_USDC, MAX_DEPOSIT_USDC } from '../constants/enums';

export const sideSchema = z.enum(['UP', 'DOWN']);

export const intervalSchema = z.enum(INTERVALS);

export const depositSchema = z.object({
  poolId: z.string().uuid(),
  side: sideSchema,
  amount: z.number().min(MIN_DEPOSIT_USDC).max(MAX_DEPOSIT_USDC),
});

export const confirmBetSchema = z.object({
  betId: z.string().uuid(),
  txSignature: z.string().min(64).max(128),
});

export const claimSchema = z.object({
  poolId: z.string().uuid(),
  txSignature: z.string().min(64).max(128),
});

export const poolFilterSchema = z.object({
  asset: z.string().optional(),
  interval: intervalSchema.optional(),
  status: z.enum(['UPCOMING', 'JOINING', 'ACTIVE', 'RESOLVED', 'CLAIMABLE']).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export type DepositInput = z.infer<typeof depositSchema>;
export type ConfirmBetInput = z.infer<typeof confirmBetSchema>;
export type ClaimInput = z.infer<typeof claimSchema>;
export type PoolFilterInput = z.infer<typeof poolFilterSchema>;
