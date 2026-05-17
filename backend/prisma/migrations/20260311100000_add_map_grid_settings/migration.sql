-- AlterTable: Add feetPerSquare and diagonalRule to Map
ALTER TABLE "Map" ADD COLUMN "feetPerSquare" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "Map" ADD COLUMN "diagonalRule" TEXT NOT NULL DEFAULT 'flat';
