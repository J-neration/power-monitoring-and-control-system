// ⚠️ loadEnvFiles는 반드시 첫 번째 import여야 합니다.
// auth.service.ts 등이 module-level에서 process.env를 읽기 전에 env가 로드되어야 합니다.
import "./lib/loadEnvFiles.js";
import { buildServer } from "./server.js";
import { loadEnv } from "./lib/env.js";

const nodeEnv = process.env.NODE_ENV ?? "development";
const env = loadEnv();

// 🚨 안전 가드: Neon main(production) 브랜치를 비프로덕션 환경에서 실수로 사용하는 것 방지
// NEON_BRANCH=main  → production 브랜치 (Railway에서만 허용)
// NEON_BRANCH=dev   → dev 브랜치 (development에서 사용 가능)
// NEON_BRANCH 미설정 → neon.tech URL이 있으면 경고
if (env.DATABASE_URL.includes("neon.tech") && nodeEnv !== "production") {
  const neonBranch = process.env.NEON_BRANCH ?? "";
  if (neonBranch === "main" || neonBranch === "production") {
    console.error(
      "\n🚨 SAFETY ERROR: Neon main(Production) 브랜치를 development 환경에서 사용할 수 없습니다!" +
      "\n   .env.development에 NEON_BRANCH=dev 와 dev 브랜치 URL을 설정하거나" +
      "\n   로컬 Docker Postgres를 사용하세요: docker compose up -d postgres\n",
    );
    process.exit(1);
  }
  if (!neonBranch) {
    console.warn(
      "\n⚠️  WARNING: Neon DB가 development 환경에서 감지되었습니다." +
      "\n   env 파일에 NEON_BRANCH=dev 또는 NEON_BRANCH=main 을 명시하세요.\n",
    );
  }
}

const server = await buildServer(env);

try {
  await server.listen({ port: env.PORT, host: env.HOST });
  server.log.info(`API listening on http://${env.HOST}:${env.PORT}`);
} catch (error) {
  server.log.error(error, "Failed to start server");
  process.exit(1);
}
