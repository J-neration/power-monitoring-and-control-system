// ⚠️ loadEnvFiles는 반드시 첫 번째 import여야 합니다.
// auth.service.ts 등이 module-level에서 process.env를 읽기 전에 env가 로드되어야 합니다.
import "./lib/loadEnvFiles.js";
import { buildServer } from "./server.js";
import { loadEnv } from "./lib/env.js";

const env = loadEnv();

const server = await buildServer(env);
let stopAggregation = () => {};
let stopFreshnessCheck = () => {};

let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  server.log.info(`Shutting down (${signal})…`);
  try {
    stopAggregation();
    stopFreshnessCheck();
    await server.close();
  } finally {
    process.exit(0);
  }
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await server.listen({ port: env.PORT, host: env.HOST });
  server.log.info(`API listening on http://${env.HOST}:${env.PORT}`);
  const { startAggregationScheduler } = await import("./services/aggregationScheduler.js");
  stopAggregation = startAggregationScheduler(server.log);
  const { startDeviceFreshnessCheck } = await import("./services/deviceFreshnessCheck.js");
  stopFreshnessCheck = startDeviceFreshnessCheck(server.log);
} catch (error) {
  const err = error as NodeJS.ErrnoException;
  if (err?.code === "EADDRINUSE") {
    console.error(
      `\n포트 ${env.PORT}이(가) 이미 사용 중입니다.` +
        `\n이전 백엔드 프로세스를 종료한 뒤 다시 실행하세요.` +
        `\n  Windows: netstat -ano | findstr :${env.PORT}  →  taskkill /PID <PID> /F` +
        `\n  또는 터미널에서 Ctrl+C로 yarn dev를 완전히 종료하세요.\n`,
    );
  }
  server.log.error(error, "Failed to start server");
  process.exit(1);
}
