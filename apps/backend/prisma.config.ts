import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// prisma.config.ts는 apps/backend/ 에 위치 → 이 파일 기준으로 .env 로드
// (yarn workspace나 npx prisma로 어떤 CWD에서 실행되든 동일하게 동작)
const dir = path.dirname(fileURLToPath(import.meta.url));
const nodeEnv = (process.env.NODE_ENV ?? "development").trim().replace(/^["']|["']$/g, "") || "development";

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
