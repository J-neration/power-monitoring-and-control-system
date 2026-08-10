import Fastify from "fastify";
import websocket from "@fastify/websocket";
import fastifyJwt from "@fastify/jwt";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import { z } from "zod";
import { buildLogger } from "./lib/logger.js";
import { healthRoutes } from "./routes/health.js";
import { deviceRoutes } from "./routes/devices.js";
import { receiverRoutes } from "./routes/receiver.js";
import { siteRoutes } from "./routes/sites.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { adminRoutes } from "./routes/admin.js";
import type { UserContext } from "./modules/auth/auth.types.js";
import { wsHub } from "./lib/wsHub.js";

/* -----------------------------------------------
 * @fastify/jwt type augmentation: request.user
 * ----------------------------------------------- */
declare module "@fastify/jwt" {
  interface FastifyJWT {
    user: UserContext;
  }
}

/** 쉼표로 구분된 origin 목록을 정규화한다.
 * 후행 슬래시가 붙은 값(`https://foo.app/`)은 브라우저가 보내는 Origin 헤더와
 * 절대 일치하지 않아 CORS 가 조용히 깨진다 — 여기서 떼어낸다. */
export const parseAllowedOrigins = (value: string): string[] => [
  ...new Set(
    value
      .split(",")
      .map((origin) => origin.trim().replace(/\/+$/, ""))
      .filter((origin) => origin.length > 0),
  ),
];

const envSchema = z.object({
  PORT: z.number().int().positive(),
  HOST: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  RECEIVER_API_KEY: z.string().min(8),
  // 환경별로 여러 개를 허용한다 (예: dev 백엔드에 dev 사이트 + localhost).
  FRONTEND_ORIGIN: z
    .string()
    .min(1)
    .transform(parseAllowedOrigins)
    .refine((origins) => origins.length > 0, {
      message: "FRONTEND_ORIGIN 에 유효한 origin 이 없습니다",
    }),
});

export type Env = z.infer<typeof envSchema>;

export const parseEnv = (env: Record<string, string | undefined>) => {
  return envSchema.parse({
    PORT: Number(env.PORT ?? "4000"),
    HOST: env.HOST ?? "0.0.0.0",
    DATABASE_URL:
      env.DATABASE_URL ?? "postgresql://pmcs:pmcs@localhost:5432/pmcs",
    JWT_SECRET: env.JWT_SECRET ?? "change-me-in-production-min-32-chars!!",
    RECEIVER_API_KEY: env.RECEIVER_API_KEY ?? "receiver-dev-key",
    FRONTEND_ORIGIN: env.FRONTEND_ORIGIN ?? "http://localhost:3000",
  });
};

export const buildServer = async (env: Env) => {
  const server = Fastify({
    logger: buildLogger(),
  });

  server.addContentTypeParser(
    "*",
    { parseAs: "string" },
    (_request, body, done) => {
      done(null, body);
    },
  );

  /* ── CORS ─────────────────────────────────────── */
  // 허용 origin 을 부팅 로그에 남긴다 — 환경변수 오타는 런타임에 조용히 실패하므로
  // 로그에 찍힌 목록이 dev/prod 를 잘못 물었는지 확인하는 가장 빠른 단서가 된다.
  server.log.info({ allowedOrigins: env.FRONTEND_ORIGIN }, "CORS allowed origins");
  await server.register(fastifyCors, {
    origin: env.FRONTEND_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  });

  /* ── Cookie ───────────────────────────────────── */
  await server.register(fastifyCookie);

  /* ── JWT ──────────────────────────────────────── */
  await server.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    // Bearer token from Authorization header (used by SSR server-side fetch)
    verify: { extractToken: (req) => req.headers.authorization?.split(" ")[1] },
  });

  /* ── WebSocket ────────────────────────────────── */
  await server.register(websocket);

  /* ── 보안 헤더 (모든 응답) ─────────────────────────
   * API 서버이므로 프레임 차단(DENY)·nosniff·HSTS·referrer 최소화.
   * CORS 는 위 fastifyCors 가 처리하므로 CORP 는 설정하지 않는다(교차 출처 FE 차단 방지). */
  server.addHook("onSend", async (_request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    reply.header("X-DNS-Prefetch-Control", "off");
    reply.removeHeader("X-Powered-By");
    return payload;
  });

  /* ── Routes ───────────────────────────────────── */
  await server.register(healthRoutes, { prefix: "/health" });
  await server.register(authRoutes, { prefix: "/auth" });
  await server.register(adminRoutes, { prefix: "/admin" });
  await server.register(deviceRoutes, { prefix: "/devices" });
  await server.register(siteRoutes, { prefix: "/sites" });
  await server.register(receiverRoutes, {
    prefix: "/receiver",
    receiverApiKey: env.RECEIVER_API_KEY,
  });

  const { registryService } = await import("./services/registryService.js");
  const registryReady = await registryService.ensureDefaults();
  if (registryReady) {
    server.log.info("User registry defaults ensured (clients & roles)");
  } else {
    server.log.warn(
      "User registry tables missing — run: npm run db:migrate:deploy (in apps/backend)",
    );
  }

  server.get("/ws", { websocket: true }, (connection) => {
    const socket = (connection as unknown as { socket: { readyState: number; send(d: string): void; on(e: string, cb: () => void): void } }).socket ?? connection;
    wsHub.add(socket);
    socket.send(JSON.stringify({ type: "welcome", timestamp: Date.now() }));
    socket.on("close", () => {
      wsHub.remove(socket);
      server.log.debug({ clients: wsHub.size }, "WS client disconnected");
    });
    server.log.debug({ clients: wsHub.size }, "WS client connected");
  });

  return server;
};
