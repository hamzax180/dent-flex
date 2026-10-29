-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "agentId" UUID,
ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "messageCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "queuedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AiAgent" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "languages" TEXT[] DEFAULT ARRAY['en', 'tr']::TEXT[],
    "voice" TEXT NOT NULL,
    "voiceGender" TEXT NOT NULL DEFAULT 'female',
    "style" TEXT NOT NULL,
    "tagline" TEXT NOT NULL,
    "hue" INTEGER NOT NULL DEFAULT 140,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "maxConcurrent" INTEGER NOT NULL DEFAULT 3,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAgent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiAgent_slug_key" ON "AiAgent"("slug");

-- CreateIndex
CREATE INDEX "Conversation_agentId_status_lastActivityAt_idx" ON "Conversation"("agentId", "status", "lastActivityAt");

-- CreateIndex
CREATE INDEX "Conversation_status_queuedAt_idx" ON "Conversation"("status", "queuedAt");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AiAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
