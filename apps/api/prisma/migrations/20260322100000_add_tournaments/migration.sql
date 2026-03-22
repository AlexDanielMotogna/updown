-- CreateTable
CREATE TABLE "tournaments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "entry_fee" BIGINT NOT NULL,
    "size" INTEGER NOT NULL,
    "match_duration" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REGISTERING',
    "current_round" INTEGER NOT NULL DEFAULT 0,
    "total_rounds" INTEGER NOT NULL,
    "prize_pool" BIGINT NOT NULL DEFAULT 0,
    "winner_wallet" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_participants" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "eliminated_round" INTEGER,
    "deposit_tx" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_matches" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "match_index" INTEGER NOT NULL,
    "player1_wallet" TEXT,
    "player2_wallet" TEXT,
    "player1_side" TEXT,
    "player2_side" TEXT,
    "winner_wallet" TEXT,
    "pool_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "tournament_matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tournaments_status_idx" ON "tournaments"("status");

-- CreateIndex
CREATE INDEX "tournament_participants_tournament_id_idx" ON "tournament_participants"("tournament_id");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_participants_tournament_id_wallet_address_key" ON "tournament_participants"("tournament_id", "wallet_address");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_matches_pool_id_key" ON "tournament_matches"("pool_id");

-- CreateIndex
CREATE INDEX "tournament_matches_tournament_id_round_idx" ON "tournament_matches"("tournament_id", "round");

-- CreateIndex
CREATE INDEX "tournament_matches_pool_id_idx" ON "tournament_matches"("pool_id");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_matches_tournament_id_round_match_index_key" ON "tournament_matches"("tournament_id", "round", "match_index");

-- AddForeignKey
ALTER TABLE "tournament_participants" ADD CONSTRAINT "tournament_participants_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE SET NULL ON UPDATE CASCADE;
