-- AlterTable: per-order voltage harmonics (HMI docs/LTE_HARMONIC_DATA_PLAN.md 3-1)
ALTER TABLE "HarmonicRecord" ADD COLUMN     "voltA" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "voltB" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "voltC" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "voltRecordedAt" TIMESTAMP(3);
