/**
 * 통합 테스트 프로세스마다 다른 모든 import 보다 먼저 실행된다 (node --import).
 * src/lib/prisma.ts 등은 모듈 로드 시점에 process.env 를 읽으므로 여기서 환경을 확정해야 한다.
 */
import { resolveTestDatabaseUrl } from "../testDatabase.js";

// 안전장치를 통과한 주소만 DATABASE_URL 로 쓴다 (파일을 직접 node --test 로 돌려도 동일).
process.env.DATABASE_URL = resolveTestDatabaseUrl();

Object.assign(process.env, {
  NODE_ENV: "test",
  LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? "silent",
  JWT_SECRET: "integration-test-jwt-secret-0123456789",
  RECEIVER_API_KEY: "integration-test-receiver-key",
  FRONTEND_ORIGIN: "http://localhost:3000",
});

// 개발자 셸이나 CI 에 남아 있는 값이 테스트 동작을 바꾸거나 외부로 나가지 않게 지운다
// (실제 알림 메일·웹훅 발송, 배포 환경 판별, 수신 정책 변경).
for (const key of [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "ALERT_EMAIL_TO",
  "CRITICAL_FAULT_WEBHOOK_URL",
  "RECEIVER_REQUIRE_ICCID",
  "RECEIVER_FAULTS_AUTO_PROVISION",
  "REMOTE_WINDOW_SECONDS",
  "COMMAND_TTL_SECONDS",
  "COMMAND_MAX_MODULES",
  "DATABASE_SSL_CA_FILE",
  "TRUST_PROXY_HOPS",
  "WS_PING_INTERVAL_MS",
  "WS_REQUIRE_AUTH",
  "RAILWAY_ENVIRONMENT",
  "RAILWAY_ENVIRONMENT_NAME",
  "RAILWAY_PROJECT_ID",
  "RAILWAY_SERVICE_ID",
  "ECS_CONTAINER_METADATA_URI_V4",
]) {
  delete process.env[key];
}
