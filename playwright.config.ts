import { defineConfig, devices } from "@playwright/test";

/**
 * 브라우저 E2E — `yarn test:e2e`
 *
 * 테스트 DB(localhost:5433) 위에 백엔드(4100)와 프로덕션 빌드 프론트(3100)를 띄워
 * 실제 사용자처럼 로그인 → 대시보드 → 현장 → 장치 화면을 확인한다.
 * 개발 서버(3000/4000)와 포트가 달라 동시에 켜 둬도 된다.
 *
 *   yarn test:db:start                      # 최초 1회 (Docker)
 *   yarn test:e2e                           # 프론트를 빌드한 뒤 실행
 *   E2E_SKIP_BUILD=1 yarn test:e2e          # 직전 빌드 재사용 (화면 코드를 안 고쳤을 때)
 *   yarn test:e2e --ui                      # 단계별로 보면서 디버깅
 */
const API_PORT = Number(process.env.E2E_API_PORT ?? 4100);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3100);
const JWT_SECRET = "e2e-test-jwt-secret-0123456789abcdef";
const isCI = !!process.env.CI;

const frontendEnv = {
  NEXT_PUBLIC_API_BASE: `http://127.0.0.1:${API_PORT}`,
  NEXT_PUBLIC_WS_URL: `ws://127.0.0.1:${API_PORT}/ws`,
  API_BASE_INTERNAL: `http://127.0.0.1:${API_PORT}`,
  AUTH_JWT_SECRET: JWT_SECRET,
  NEXT_TELEMETRY_DISABLED: "1",
};

const buildFrontend = process.env.E2E_SKIP_BUILD ? "" : "yarn --cwd apps/frontend next build && ";

export default defineConfig({
  testDir: "./e2e",
  // 시드 데이터를 공유하므로 순서대로 돈다.
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: isCI
    ? [["github"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node --import tsx apps/backend/test/e2e/server.ts",
      url: `http://127.0.0.1:${API_PORT}/health`,
      env: {
        E2E_API_PORT: String(API_PORT),
        E2E_JWT_SECRET: JWT_SECRET,
        E2E_WEB_ORIGIN: `http://localhost:${WEB_PORT}`,
      },
      // 매번 DB 를 새로 시드해야 하므로 로컬에서도 재사용하지 않는다.
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "pipe",
    },
    {
      command: `${buildFrontend}yarn --cwd apps/frontend next start -p ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}/login`,
      env: frontendEnv,
      reuseExistingServer: !isCI,
      timeout: 300_000,
    },
  ],
});
