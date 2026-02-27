FROM node:18-alpine AS base

RUN corepack enable && corepack prepare pnpm@8.10.0 --activate

WORKDIR /app

# Copy workspace and TypeScript config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json ./

# Copy all package.json files
COPY apps/web/package.json apps/web/package.json
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
COPY apps/ apps/

# Accept NEXT_PUBLIC env vars at build time for Next.js static generation
ARG NEXT_PUBLIC_PRIVY_APP_ID
ARG NEXT_PUBLIC_PRIVY_CLIENT_ID
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SOLANA_RPC_URL
ARG NEXT_PUBLIC_SOLANA_NETWORK
ARG NEXT_PUBLIC_USDC_MINT
ARG NEXT_PUBLIC_PROGRAM_ID

# Build everything
RUN pnpm run build

FROM node:18-alpine AS runner

RUN corepack enable && corepack prepare pnpm@8.10.0 --activate

WORKDIR /app

COPY --from=base /app ./

EXPOSE 3000

# SERVICE env var controls which app starts: "web" or "api"
CMD sh -c "pnpm --filter ${SERVICE:-api} start"
