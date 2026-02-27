FROM node:18-alpine AS base

RUN corepack enable && corepack prepare pnpm@8.10.0 --activate

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# Copy all package.json files
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/market-data/package.json packages/market-data/package.json
COPY packages/solana-client/package.json packages/solana-client/package.json

# Copy prisma schema for generate
COPY apps/api/prisma apps/api/prisma

# Install dependencies and generate Prisma client
RUN pnpm install --frozen-lockfile
RUN pnpm --filter api db:generate

# Copy source code
COPY packages/ packages/
COPY apps/api/ apps/api/

# Build
RUN pnpm --filter api... build

FROM node:18-alpine AS runner

RUN corepack enable && corepack prepare pnpm@8.10.0 --activate

WORKDIR /app

COPY --from=base /app ./

EXPOSE 3000

CMD ["pnpm", "--filter", "api", "start"]
