/**
 * Playwright E2E 용 백엔드. playwright.config.ts 의 webServer 가 띄운다.
 *
 * src/index.ts 를 쓰지 않는 이유: index.ts 는 .env* 를 override 로 읽어 DATABASE_URL 이
 * 로컬 .env.development(Neon dev)로 바뀔 수 있다. 여기서는 안전장치를 통과한 테스트 DB 만 쓴다.
 *
 * 시작할 때 테스트 DB 를 비우고 시나리오 데이터를 넣은 뒤 E2E_API_PORT(기본 4100)에서 듣는다.
 */
import { resolveTestDatabaseUrl } from "../testDatabase.js";
import { prepareTestDatabase } from "../prepareTestDatabase.js";

process.env.DATABASE_URL = resolveTestDatabaseUrl();
Object.assign(process.env, {
  NODE_ENV: "test",
  LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? "warn",
  JWT_SECRET: process.env.E2E_JWT_SECRET ?? "e2e-test-jwt-secret-0123456789abcdef",
  RECEIVER_API_KEY: "e2e-test-receiver-key",
  FRONTEND_ORIGIN: process.env.E2E_WEB_ORIGIN ?? "http://localhost:3100",
});
for (const key of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "ALERT_EMAIL_TO", "CRITICAL_FAULT_WEBHOOK_URL"]) {
  delete process.env[key];
}

await prepareTestDatabase();

// 환경을 확정한 뒤에 불러와야 prisma 가 테스트 DB 로 연결된다.
const { buildServer, parseEnv } = await import("../../src/server.js");
const { resetDatabase } = await import("../integration/helpers/db.js");
const { seedE2eData } = await import("./seed.js");

const server = await buildServer(parseEnv(process.env));
await resetDatabase();
await seedE2eData(server);

const port = Number(process.env.E2E_API_PORT ?? 4100);
await server.listen({ port, host: "127.0.0.1" });
console.log(`[e2e] API ready on http://127.0.0.1:${port}`);

const shutdown = async () => {
  await server.close();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
