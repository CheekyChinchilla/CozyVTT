-- CreateTable
CREATE TABLE "DiceMacro" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "expression" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiceMacro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiceMacro_userId_campaignId_createdAt_idx" ON "DiceMacro"("userId", "campaignId", "createdAt");

-- AddForeignKey
ALTER TABLE "DiceMacro" ADD CONSTRAINT "DiceMacro_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiceMacro" ADD CONSTRAINT "DiceMacro_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

