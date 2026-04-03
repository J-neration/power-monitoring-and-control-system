-- HMI에서 firstSeen/lastSeen 제거 — 서버는 updatedAt·resolvedAt만 사용
ALTER TABLE "ModuleFaultState" DROP COLUMN IF EXISTS "firstSeenAt";
ALTER TABLE "ModuleFaultState" DROP COLUMN IF EXISTS "lastSeenAt";
