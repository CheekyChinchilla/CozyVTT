-- AlterEnum
ALTER TYPE "MessageType" ADD VALUE 'WHISPER';

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "recipientId" TEXT;

-- CreateIndex
CREATE INDEX "Message_campaignId_recipientId_createdAt_idx" ON "Message"("campaignId", "recipientId", "createdAt");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

