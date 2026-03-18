-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "role" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emailOrPhone" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "themePreference" TEXT NOT NULL DEFAULT 'light',
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Patient" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Case" (
    "id" SERIAL NOT NULL,
    "patientId" INTEGER NOT NULL,
    "doctorId" INTEGER,
    "techId" INTEGER,
    "status" TEXT NOT NULL,
    "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "toothFormula" TEXT NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Transaction" (
    "id" SERIAL NOT NULL,
    "caseId" INTEGER,
    "patientId" INTEGER,
    "type" TEXT NOT NULL,
    "amountUSD" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amountUZS" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Attachment" (
    "id" SERIAL NOT NULL,
    "caseId" INTEGER NOT NULL,
    "filePath" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RestorationType" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "priceUSD" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RestorationType_pkey" PRIMARY KEY ("id")
);

-- Unique indexes
CREATE UNIQUE INDEX "User_emailOrPhone_key" ON "User"("emailOrPhone");
CREATE UNIQUE INDEX "Patient_phone_key" ON "Patient"("phone");
CREATE UNIQUE INDEX "RestorationType_name_key" ON "RestorationType"("name");

-- Foreign keys
ALTER TABLE "Case" ADD CONSTRAINT "Case_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Case" ADD CONSTRAINT "Case_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Case" ADD CONSTRAINT "Case_techId_fkey" FOREIGN KEY ("techId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
