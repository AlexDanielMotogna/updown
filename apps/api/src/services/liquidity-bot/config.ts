import { prisma } from '../../db';

/** Read the single liquidity-bot config row, creating defaults on first use. */
export async function getLiquidityBotConfig() {
  const existing = await prisma.liquidityBotConfig.findUnique({ where: { id: 'default' } });
  if (existing) return existing;
  return prisma.liquidityBotConfig.create({ data: { id: 'default' } });
}
