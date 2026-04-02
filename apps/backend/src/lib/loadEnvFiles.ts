/**
 * 이 모듈은 index.ts에서 반드시 첫 번째 import여야 합니다.
 *
 * ES 모듈은 import를 모두 먼저 실행한 후 코드 바디를 실행하므로,
 * auth.service.ts 등 module-level에서 process.env를 읽는 코드보다
 * 이 모듈이 먼저 실행되어 env 변수가 설정되어야 합니다.
 *
 * 로딩 우선순위 (뒤에 올수록 높음 = Next.js 방식과 동일):
 *   .env → .env.local → .env.{NODE_ENV} → .env.{NODE_ENV}.local
 */
import path from "node:path";
import { config } from "dotenv";

const appDir = path.resolve(import.meta.dirname, "../..");
const nodeEnv = process.env.NODE_ENV ?? "development";

for (const file of [
  ".env",
  ".env.local",
  `.env.${nodeEnv}`,
  `.env.${nodeEnv}.local`,
]) {
  config({ path: path.resolve(appDir, file), override: true });
}
