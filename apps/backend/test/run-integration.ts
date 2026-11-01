/**
 * 백엔드 API 통합 테스트 실행기 — `yarn test:integration`
 *
 * 실제 Postgres(로컬 Docker 또는 CI 서비스 컨테이너)에 마이그레이션을 적용한 뒤,
 * test/integration/**\/*.test.ts 를 파일 단위로 순차 실행한다.
 * 추가 인자는 node --test 로 그대로 넘어간다 (예: -- --test-name-pattern="login").
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareTestDatabase } from "./prepareTestDatabase.js";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runTests = path.resolve(backendDir, "../../scripts/run-tests.mjs");

let url: string;
try {
  url = await prepareTestDatabase();
} catch (error) {
  console.error(`\n✖ ${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [
    runTests,
    "test/integration",
    "--serial",
    "--import",
    "./test/integration/setup.ts",
    ...process.argv.slice(2),
  ],
  {
    cwd: backendDir,
    stdio: "inherit",
    env: { ...process.env, TEST_DATABASE_URL: url },
  },
);
process.exit(result.status ?? 1);
