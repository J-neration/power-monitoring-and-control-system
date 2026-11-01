import { prisma } from "../../../src/lib/prisma.js";
import { _resetLoginThrottleForTests } from "../../../src/modules/auth/loginThrottle.js";

/**
 * 테이블을 전부 비운다. 매 테스트 전에 호출해 케이스끼리 데이터가 섞이지 않게 한다.
 * 목록을 하드코딩하지 않으므로 마이그레이션으로 테이블이 늘어도 고칠 필요가 없다.
 */
export const resetDatabase = async () => {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length > 0) {
    const tables = rows.map((r) => `"public"."${r.tablename}"`).join(", ");
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
  }
  // 로그인 실패 횟수는 프로세스 메모리에 있다.
  _resetLoginThrottleForTests();
};
