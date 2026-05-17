-- CreateTable
CREATE TABLE "SystemSettings" (
    "id" TEXT NOT NULL,
    "setupCompleted" BOOLEAN NOT NULL DEFAULT false,
    "instanceName" TEXT NOT NULL DEFAULT 'CozyVTT',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "allowRegistration" BOOLEAN NOT NULL DEFAULT false,
    "requireAdminApproval" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("id")
);
