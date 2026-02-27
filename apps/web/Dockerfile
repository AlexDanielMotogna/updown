FROM node:18-alpine AS base

RUN corepack enable && corepack prepare pnpm@8.10.0 --activate

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# Copy all package.json files
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/market-data/package.json packages/market-data/package.json
COPY packages/solana-client/package.json packages/solana-client/package.json

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/ packages/
COPY apps/web/ apps/web/

# Build
RUN pnpm --filter web... build

FROM node:18-alpine AS runner

RUN corepack enable && corepack prepare pnpm@8.10.0 --activate

WORKDIR /app

COPY --from=base /app ./

EXPOSE 3000

CMD ["pnpm", "--filter", "web", "start"]
