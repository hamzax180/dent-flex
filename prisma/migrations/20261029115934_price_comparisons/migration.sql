-- CreateTable
CREATE TABLE "ComparisonPrice" (
    "id" UUID NOT NULL,
    "treatmentId" UUID NOT NULL,
    "market" TEXT NOT NULL,
    "marketLabel" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "minMinor" INTEGER NOT NULL,
    "maxMinor" INTEGER NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComparisonPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComparisonPrice_treatmentId_market_status_idx" ON "ComparisonPrice"("treatmentId", "market", "status");

-- AddForeignKey
ALTER TABLE "ComparisonPrice" ADD CONSTRAINT "ComparisonPrice_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "Treatment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
