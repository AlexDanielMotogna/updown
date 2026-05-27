import { PrismaClient } from '@prisma/client';
import { seedCategories, CATEGORY_DEFAULTS } from '../src/services/category-defaults';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding pool categories...');
  const count = await seedCategories(prisma);
  const enabled = CATEGORY_DEFAULTS.filter(c => c.enabled).length;
  const comingSoon = CATEGORY_DEFAULTS.filter(c => c.comingSoon).length;
  console.log(`Seeded ${count} categories (${enabled} enabled, ${comingSoon} coming soon)`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
