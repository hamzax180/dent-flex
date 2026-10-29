-- CreateEnum
CREATE TYPE "UploadKind" AS ENUM ('XRAY', 'SMILE_PHOTO', 'OTHER');

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "interestScore" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "interestScore" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Upload" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "kind" "UploadKind" NOT NULL,
    "treatmentSlug" TEXT,
    "fileName" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngagementSignal" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngagementSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Upload_conversationId_idx" ON "Upload"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "EngagementSignal_conversationId_type_key" ON "EngagementSignal"("conversationId", "type");

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementSignal" ADD CONSTRAINT "EngagementSignal_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
