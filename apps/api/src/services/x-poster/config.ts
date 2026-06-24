import { prisma } from '../../db';

/** Read the single X-poster config row, creating defaults on first use. */
export async function getXPosterConfig() {
  const existing = await prisma.xPosterConfig.findUnique({ where: { id: 'default' } });
  if (existing) return existing;
  return prisma.xPosterConfig.create({ data: { id: 'default' } });
}
