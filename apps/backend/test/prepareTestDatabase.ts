import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { resolveTestDatabaseUrl } from "./testDatabase.js";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const assertReachable = async (url: string) => {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `테스트 DB 에 연결할 수 없습니다 (${new URL(url).host}): ${reason}\n` +
        "  로컬: Docker Desktop 을 켜고 `yarn test:db:start` 를 실행하세요.\n" +
        "  다른 DB 를 쓰려면 TEST_DATABASE_URL 을 지정하세요 (로컬 + 이름에 test 필수).",
    );
  } finally {
    await client.end().catch(() => {});
  }
};

/** 안전장치 확인 → 연결 확인 → 마이그레이션 적용. 검증된 주소를 돌려준다. */
export const prepareTestDatabase = async (): Promise<string> => {
  const url = resolveTestDatabaseUrl();
  await assertReachable(url);

  // npx 는 Windows 에서 셸이 필요하므로 prisma CLI 를 node 로 직접 실행한다.
  const require = createRequire(import.meta.url);
  const prismaCli = path.join(path.dirname(require.resolve("prisma/package.json")), "build/index.js");
  const migrate = spawnSync(
    process.execPath,
    [prismaCli, "migrate", "deploy", "--config", "prisma.test.config.ts"],
    {
      cwd: backendDir,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      env: { ...process.env, TEST_DATABASE_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: "1" },
    },
  );
  if (migrate.status !== 0) {
    process.stderr.write(migrate.stdout + migrate.stderr);
    throw new Error("테스트 DB 마이그레이션(prisma migrate deploy)에 실패했습니다.");
  }
  return url;
};
