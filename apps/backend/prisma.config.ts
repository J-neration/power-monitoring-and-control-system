import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// prisma.config.ts는 apps/backend/ 에 위치 → __dirname 기준으로 .env 로드
// (yarn workspace나 npx prisma로 어떤 CWD에서 실행되든 동일하게 동작)
const dir = import.meta.dirname;
const nodeEnv = process.env.NODE_ENV ?? "development";

// Next.js 방식과 동일한 우선순위로 로드 (뒤에 로드될수록 높은 우선순위)
//   .env  →  .env.local  →  .env.{NODE_ENV}  →  .env.{NODE_ENV}.local
for (const file of [
  ".env",
  ".env.local",
  `.env.${nodeEnv}`,
  `.env.${nodeEnv}.local`,
]) {
  config({ path: path.resolve(dir, file), override: true });
}

// 🚨 안전 가드: Neon main(production) 브랜치를 비프로덕션 환경에서 실수로 사용하는 것 방지
// NEON_BRANCH=main  → production 브랜치 (prisma migrate deploy는 CI/Railway에서만)
// NEON_BRANCH=dev   → dev 브랜치 (prisma migrate dev 시 사용 가능)
if (process.env.DATABASE_URL?.includes("neon.tech") && nodeEnv !== "production") {
  const neonBranch = process.env.NEON_BRANCH ?? "";
  if (neonBranch === "main" || neonBranch === "production") {
    throw new Error(
      "\n🚨 SAFETY: Neon main(Production) 브랜치에 대해 prisma migrate dev를 실행할 수 없습니다!" +
      "\n   NEON_BRANCH=dev인 dev 브랜치를 사용하거나 로컬 Docker Postgres를 사용하세요.\n",
    );
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // process.env 사용 이유: env()는 변수 없으면 즉시 throw,
    // process.env는 undefined를 반환해 prisma generate가 DB 없이도 동작함 (Prisma 7.2+)
    url: process.env.DATABASE_URL!,
  },
});
