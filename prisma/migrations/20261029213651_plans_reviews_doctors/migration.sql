-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('REQUESTED', 'DRAFT', 'SENT', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "ReviewSource" AS ENUM ('GOOGLE', 'TRUSTPILOT', 'CLINIC');

-- AlterTable
ALTER TABLE "TeamMember" ADD COLUMN     "credentials" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Upload" ADD COLUMN     "leadId" UUID,
ADD COLUMN     "planId" UUID,
ALTER COLUMN "conversationId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "TreatmentPlan" (
    "id" UUID NOT NULL,
    "publicId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "leadId" UUID NOT NULL,
    "treatmentSlug" TEXT,
    "country" TEXT,
    "status" "PlanStatus" NOT NULL DEFAULT 'REQUESTED',
    "items" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "validUntil" TIMESTAMP(3),
    "preparedById" UUID,
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreatmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Testimonial" (
    "id" UUID NOT NULL,
    "author" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT '',
    "treatment" TEXT NOT NULL DEFAULT '',
    "quote" TEXT NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 5,
    "source" "ReviewSource" NOT NULL DEFAULT 'CLINIC',
    "sourceUrl" TEXT,
    "consentAt" TIMESTAMP(3),
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Testimonial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TreatmentPlan_publicId_key" ON "TreatmentPlan"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "TreatmentPlan_token_key" ON "TreatmentPlan"("token");

-- CreateIndex
CREATE INDEX "TreatmentPlan_status_createdAt_idx" ON "TreatmentPlan"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TreatmentPlan_leadId_idx" ON "TreatmentPlan"("leadId");

-- CreateIndex
CREATE INDEX "Upload_leadId_idx" ON "Upload"("leadId");

-- CreateIndex
CREATE INDEX "Upload_planId_idx" ON "Upload"("planId");

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TreatmentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
