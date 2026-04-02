/**
 * pull-prod.mjs
 * Neon production DB → 로컬 Docker Postgres 데이터 동기화
 *
 * 필요한 것:
 *   1. Docker Desktop 실행 중 + pmcs-postgres 컨테이너 실행 중 (yarn db:start)
 *   2. apps/backend/.env.local 에 PROD_DATABASE_URL 설정
 *      예: PROD_DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require
 *
 * 실행:
 *   yarn db:pull-prod
 */

import { execSync } from "node:child_process";
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// apps/backend/.env.local 에서 PROD_DATABASE_URL 로드 (gitignore됨 - 안전)
config({ path: resolve(root, "apps/backend/.env.local") });
// .env.local 없으면 .env 폴백
config({ path: resolve(root, "apps/backend/.env"), override: false });

const prodUrl = process.env.PROD_DATABASE_URL;
if (!prodUrl) {
  console.error("\n❌ PROD_DATABASE_URL이 설정되지 않았습니다.");
  console.error("   apps/backend/.env.local 파일에 다음을 추가하세요:");
  console.error(
    "   PROD_DATABASE_URL=postgresql://<user>:<pass>@<host>/neondb?sslmode=require&channel_binding=require\n",
  );
  process.exit(1);
}

const LOCAL_CONTAINER = "pmcs-postgres";
const LOCAL_USER = "pmcs";
const LOCAL_DB = "pmcs";

console.log("\n🔄 Neon prod → 로컬 Docker 동기화 시작");
console.log("   (기존 로컬 데이터는 덮어써집니다)\n");

// 1. 로컬 컨테이너 실행 중인지 확인
try {
  execSync(`docker inspect --format="{{.State.Running}}" ${LOCAL_CONTAINER}`, {
    stdio: "pipe",
  });
} catch {
  console.error(
    `❌ ${LOCAL_CONTAINER} 컨테이너가 실행 중이지 않습니다. 먼저 yarn db:start 를 실행하세요.\n`,
  );
  process.exit(1);
}

// 2. Neon prod에서 전체 덤프 (Docker postgres 이미지 사용 - 로컬에 psql 불필요)
//    --clean --if-exists: 기존 객체 DROP 후 재생성 → 스키마 + 데이터 완전 동기화
console.log("1/2 Neon prod에서 pg_dump 실행 중...");
let dump;
try {
  dump = execSync(
    `docker run --rm postgres:16 pg_dump "${prodUrl}" --no-owner --no-acl --clean --if-exists`,
    { maxBuffer: 200 * 1024 * 1024 }, // 200MB
  );
} catch (e) {
  console.error("❌ pg_dump 실패:", e.message);
  process.exit(1);
}

// 3. 로컬 Docker 컨테이너에 복원
console.log("2/2 로컬 Docker에 복원 중...");
try {
  execSync(
    `docker exec -i ${LOCAL_CONTAINER} psql -U ${LOCAL_USER} -d ${LOCAL_DB}`,
    {
      input: dump,
      stdio: ["pipe", "inherit", "pipe"],
      maxBuffer: 200 * 1024 * 1024,
    },
  );
} catch (e) {
  console.error("❌ psql 복원 실패:", e.message);
  process.exit(1);
}

console.log("\n✅ 동기화 완료!");
console.log("   yarn db:studio 로 데이터를 확인하세요.\n");
