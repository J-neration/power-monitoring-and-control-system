import { defineConfig } from "prisma/config";

// 테스트 DB 마이그레이션 전용 설정 — test/run-integration.ts 가 검증한 주소로만 실행된다.
//   npx prisma migrate deploy --config prisma.test.config.ts
//
// prisma.config.ts 를 쓰지 않는 이유: 그 파일은 .env* 를 override 로 읽어서,
// 로컬에 .env.development(Neon dev)가 있으면 넘겨준 테스트 주소가 덮어써진다.
const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error(
    "TEST_DATABASE_URL 이 없습니다. 직접 실행하지 말고 yarn test:integration 을 쓰세요.",
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url },
});
