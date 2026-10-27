-- CreateEnum
CREATE TYPE "DrawingAudience" AS ENUM ('ALL', 'DM');

-- CreateEnum
CREATE TYPE "DrawingLayer" AS ENUM ('MARKUP', 'GROUND');

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "playersMayDraw" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "MapDrawing" (
    "id" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "authorId" TEXT,
    "audience" "DrawingAudience" NOT NULL DEFAULT 'ALL',
    "layer" "DrawingLayer" NOT NULL DEFAULT 'MARKUP',
    "kind" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "fillColor" TEXT,
    "pattern" TEXT,
    "stamp" TEXT,
    "width" INTEGER NOT NULL,
    "rotation" INTEGER NOT NULL DEFAULT 0,
    "sortKey" INTEGER NOT NULL DEFAULT 0,
    "points" JSONB NOT NULL,
    "text" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MapDrawing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MapDrawing_mapId_idx" ON "MapDrawing"("mapId");

-- AddForeignKey
ALTER TABLE "MapDrawing" ADD CONSTRAINT "MapDrawing_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "Map"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapDrawing" ADD CONSTRAINT "MapDrawing_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

