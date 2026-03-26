-- CreateTable
CREATE TABLE "pool_categories" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "coming_soon" BOOLEAN NOT NULL DEFAULT false,
    "label" TEXT NOT NULL,
    "short_label" TEXT,
    "color" TEXT,
    "badge_url" TEXT,
    "icon_key" TEXT,
    "api_source" TEXT,
    "adapter_key" TEXT,
    "num_sides" INTEGER NOT NULL DEFAULT 3,
    "side_labels" TEXT[] DEFAULT ARRAY['Home', 'Draw', 'Away']::TEXT[],
    "config" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pool_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pool_categories_code_key" ON "pool_categories"("code");

-- CreateIndex
CREATE INDEX "pool_categories_type_enabled_idx" ON "pool_categories"("type", "enabled");
