-- N상 전류 (A). 200A(v3v4) HMI 텔레메트리 "gridCurrentN" / "loadCurrentN"
-- (HMI 저장소 docs/LTE_HARMONIC_DATA_PLAN.md 1단계).
ALTER TABLE "Device" ADD COLUMN "gridCurrentN" DOUBLE PRECISION;
ALTER TABLE "Device" ADD COLUMN "loadCurrentN" DOUBLE PRECISION;
ALTER TABLE "TelemetryRecord" ADD COLUMN "gridCurrentN" DOUBLE PRECISION;
ALTER TABLE "TelemetryRecord" ADD COLUMN "loadCurrentN" DOUBLE PRECISION;
