#!/bin/bash
# Safe migration script for environments that were created with db push.
# Marks existing migrations as applied if the migration table doesn't exist yet,
# then runs prisma migrate deploy.

set -e

echo "[migrate-safe] Checking migration history..."

# Try migrate deploy first — if it works, we're done
if npx prisma migrate deploy 2>&1; then
  echo "[migrate-safe] All migrations applied successfully."
  exit 0
fi

# If it failed with P3005 (schema not empty), baseline existing migrations
echo "[migrate-safe] Baselining existing migrations..."

npx prisma migrate resolve --applied 20260117013753_init 2>/dev/null || true
npx prisma migrate resolve --applied 20260227011449_add_pool_interval_and_duration 2>/dev/null || true
npx prisma migrate resolve --applied 20260317130652_add_users_rewards 2>/dev/null || true

# Now deploy the new ones
echo "[migrate-safe] Applying new migrations..."
npx prisma migrate deploy

echo "[migrate-safe] Done."
