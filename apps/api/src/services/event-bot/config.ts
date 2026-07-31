import { prisma } from '../../db';

/** Read the single event-bot config row, creating defaults on first use. */
export async function getEventBotConfig() {
  const existing = await prisma.eventBotConfig.findUnique({ where: { id: 'default' } });
  if (existing) return existing;
  return prisma.eventBotConfig.create({ data: { id: 'default' } });
}
