FROM node:18-alpine AS base

RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@8.10.0 --activate

WORKDIR /app

# Copy workspace and TypeScript config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json ./

# Copy all package.json files (every workspace package must be here so
# `pnpm install` resolves its deps + creates the workspace symlinks; a missing
# one makes turbo build that package with no node_modules).
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/terminal/package.json apps/terminal/package.json
COPY packages/market-data/package.json packages/market-data/package.json
COPY packages/solana-client/package.json packages/solana-client/package.json
COPY packages/exchange-core/package.json packages/exchange-core/package.json
COPY packages/exchange-hyperliquid/package.json packages/exchange-hyperliquid/package.json

# Copy prisma schema for generate
COPY apps/api/prisma apps/api/prisma

# Install dependencies and generate Prisma client
RUN pnpm install --frozen-lockfile
RUN pnpm --filter api db:generate

# Copy source code
COPY packages/ packages/
COPY apps/ apps/

# Next.js inlines NEXT_PUBLIC_* at build time, so they must be ARGs
ARG NEXT_PUBLIC_PRIVY_APP_ID
ARG NEXT_PUBLIC_PRIVY_CLIENT_ID
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SOLANA_RPC_URL
ARG NEXT_PUBLIC_SOLANA_NETWORK
ARG NEXT_PUBLIC_USDC_MINT
ARG NEXT_PUBLIC_PROGRAM_ID
# web → terminal link
ARG NEXT_PUBLIC_TERMINAL_URL
# terminal (apps/terminal) build-time vars
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_HYPERLIQUID_API_URL
ARG NEXT_PUBLIC_HYPERLIQUID_TESTNET
ARG NEXT_PUBLIC_HYPERLIQUID_BUILDER_ADDRESS
ARG NEXT_PUBLIC_HYPERLIQUID_BUILDER_MAX_FEE
ARG HYPERLIQUID_API_URL

ENV NEXT_PUBLIC_PRIVY_APP_ID=$NEXT_PUBLIC_PRIVY_APP_ID
ENV NEXT_PUBLIC_PRIVY_CLIENT_ID=$NEXT_PUBLIC_PRIVY_CLIENT_ID
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SOLANA_RPC_URL=$NEXT_PUBLIC_SOLANA_RPC_URL
ENV NEXT_PUBLIC_SOLANA_NETWORK=$NEXT_PUBLIC_SOLANA_NETWORK
ENV NEXT_PUBLIC_USDC_MINT=$NEXT_PUBLIC_USDC_MINT
ENV NEXT_PUBLIC_PROGRAM_ID=$NEXT_PUBLIC_PROGRAM_ID
ENV NEXT_PUBLIC_TERMINAL_URL=$NEXT_PUBLIC_TERMINAL_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_HYPERLIQUID_API_URL=$NEXT_PUBLIC_HYPERLIQUID_API_URL
ENV NEXT_PUBLIC_HYPERLIQUID_TESTNET=$NEXT_PUBLIC_HYPERLIQUID_TESTNET
ENV NEXT_PUBLIC_HYPERLIQUID_BUILDER_ADDRESS=$NEXT_PUBLIC_HYPERLIQUID_BUILDER_ADDRESS
ENV NEXT_PUBLIC_HYPERLIQUID_BUILDER_MAX_FEE=$NEXT_PUBLIC_HYPERLIQUID_BUILDER_MAX_FEE
ENV HYPERLIQUID_API_URL=$HYPERLIQUID_API_URL

# Build everything
RUN pnpm run build

FROM node:18-alpine AS runner

RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@8.10.0 --activate

WORKDIR /app

COPY --from=base /app ./

EXPOSE 3000

# SERVICE env var controls which app starts: "web" or "api"
CMD sh -c "pnpm --filter ${SERVICE:-api} start"
