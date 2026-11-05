/**
 * 통합·E2E 테스트가 쓰는 DB 주소와 안전장치.
 *
 * 테스트는 매 케이스마다 모든 테이블을 TRUNCATE 한다. 주소가 하나라도 잘못 물리면
 * 개발·운영 RDS 데이터가 통째로 지워지므로, 아래 두 조건을 모두 만족할 때만 진행한다.
 *   1) 호스트가 로컬(localhost/127.0.0.1/::1)
 *   2) DB 이름에 "test" 가 들어감
 */
export const DEFAULT_TEST_DATABASE_URL =
  "postgresql://pmcs:pmcs@localhost:5433/pmcs_test";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export class UnsafeTestDatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeTestDatabaseError";
  }
}

export const assertSafeTestDatabaseUrl = (raw: string): string => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeTestDatabaseError(`TEST_DATABASE_URL 을 해석할 수 없습니다: ${raw}`);
  }
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new UnsafeTestDatabaseError(
      `테스트 DB 호스트가 로컬이 아닙니다 (${url.hostname}).\n` +
        "  테스트는 모든 테이블을 비우므로 로컬 DB 에서만 돌린다.\n" +
        "  yarn test:db:start 로 띄운 localhost:5433 을 쓰세요.",
    );
  }
  if (!/test/i.test(dbName)) {
    throw new UnsafeTestDatabaseError(
      `테스트 DB 이름에 "test" 가 없습니다 (${dbName}).\n` +
        "  개발 DB(pmcs)를 실수로 비우지 않도록 이름에 test 가 들어간 DB 만 허용한다.",
    );
  }
  return raw;
};

/** TEST_DATABASE_URL → 없으면 docker compose 의 postgres-test 기본 주소. */
export const resolveTestDatabaseUrl = (
  env: Record<string, string | undefined> = process.env,
): string =>
  assertSafeTestDatabaseUrl(env.TEST_DATABASE_URL?.trim() || DEFAULT_TEST_DATABASE_URL);
