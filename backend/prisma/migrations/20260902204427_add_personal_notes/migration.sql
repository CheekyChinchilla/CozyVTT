-- CreateTable
CREATE TABLE "PersonalNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PersonalNote_userId_campaignId_updatedAt_idx" ON "PersonalNote"("userId", "campaignId", "updatedAt");

-- AddForeignKey
ALTER TABLE "PersonalNote" ADD CONSTRAINT "PersonalNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalNote" ADD CONSTRAINT "PersonalNote_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
