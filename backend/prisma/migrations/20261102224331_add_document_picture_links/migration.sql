-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "picturesReadAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DocumentPicture" (
    "documentId" TEXT NOT NULL,
    "pictureId" TEXT NOT NULL,

    CONSTRAINT "DocumentPicture_pkey" PRIMARY KEY ("documentId","pictureId")
);

-- CreateIndex
CREATE INDEX "DocumentPicture_pictureId_idx" ON "DocumentPicture"("pictureId");

-- CreateIndex
CREATE INDEX "Asset_type_picturesReadAt_idx" ON "Asset"("type", "picturesReadAt");

-- AddForeignKey
ALTER TABLE "DocumentPicture" ADD CONSTRAINT "DocumentPicture_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPicture" ADD CONSTRAINT "DocumentPicture_pictureId_fkey" FOREIGN KEY ("pictureId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

