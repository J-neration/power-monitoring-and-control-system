import { after, before, beforeEach } from "node:test";
import type { InjectOptions } from "fastify";
import { buildServer, parseEnv } from "../../../src/server.js";
import { prisma } from "../../../src/lib/prisma.js";
import { resetDatabase } from "./db.js";

export const RECEIVER_KEY = "integration-test-receiver-key";

export type TestApp = Awaited<ReturnType<typeof buildServer>>;

export { resetDatabase };

/**
 * 테스트 파일 공통 수명주기: 서버 1회 생성 → 매 테스트 전 DB 초기화 → 끝나면 정리.
 * 반환값의 `app` 은 before() 이후에 채워진다.
 */
export const useTestApp = () => {
  const ctx = {} as { app: TestApp };

  before(async () => {
    ctx.app = await buildServer(parseEnv(process.env));
    await ctx.app.ready();
  });

  beforeEach(resetDatabase);

  after(async () => {
    await ctx.app?.close();
    // 커넥션 풀이 열려 있으면 테스트 프로세스가 끝나지 않는다.
    await prisma.$disconnect();
  });

  return ctx;
};

type RequestOptions = Omit<InjectOptions, "method" | "url"> & { token?: string };

const withAuth = ({ token, headers, ...rest }: RequestOptions = {}): Omit<
  InjectOptions,
  "method" | "url"
> => ({
  ...rest,
  headers: { ...(headers ?? {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
});

/** app.inject 를 짧게 쓰기 위한 래퍼. `token` 을 주면 Bearer 헤더를 붙인다. */
export const http = (app: TestApp) => ({
  get: (url: string, opts?: RequestOptions) => app.inject({ method: "GET", url, ...withAuth(opts) }),
  post: (url: string, payload?: unknown, opts?: RequestOptions) =>
    app.inject({ method: "POST", url, payload: payload as InjectOptions["payload"], ...withAuth(opts) }),
  patch: (url: string, payload?: unknown, opts?: RequestOptions) =>
    app.inject({ method: "PATCH", url, payload: payload as InjectOptions["payload"], ...withAuth(opts) }),
  delete: (url: string, opts?: RequestOptions) =>
    app.inject({ method: "DELETE", url, ...withAuth(opts) }),
});

/** HMI 가 보내는 요청 (x-api-key 인증). */
export const hmi = (app: TestApp, apiKey = RECEIVER_KEY) => ({
  post: (url: string, payload: unknown) =>
    app.inject({
      method: "POST",
      url,
      headers: { "x-api-key": apiKey, "content-type": "application/json" },
      payload: JSON.stringify(payload),
    }),
  get: (url: string) => app.inject({ method: "GET", url, headers: { "x-api-key": apiKey } }),
});
