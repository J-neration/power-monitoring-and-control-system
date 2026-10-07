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
  // 아래 셋은 미설정 시 기존 동작 그대로다. AWS(ALB 뒤)에서만 켠다.
  /** 앞단 프록시 홉 수. 0 이면 X-Forwarded-For 를 믿지 않는다. */
  TRUST_PROXY_HOPS: z.number().int().min(0),
  /** WebSocket ping 주기(ms). 0 이면 보내지 않는다. ALB idle timeout 보다 짧아야 한다. */
  WS_PING_INTERVAL_MS: z.number().int().min(0),
  /** true 면 /ws 연결에 pmcs_token 쿠키(JWT)를 요구한다 — 프론트와 같은 출처일 때만 가능. */
  WS_REQUIRE_AUTH: z.boolean(),
});

export type Env = z.infer<typeof envSchema>;

export class EnvConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvConfigError";
  }
}

/** 로컬 개발 편의용 폴백. 저장소에 공개된 값이므로 배포 환경에서는 사용을 금지한다. */
const devFallbacks = {
  DATABASE_URL: "postgresql://pmcs:pmcs@localhost:5432/pmcs",
  JWT_SECRET: "change-me-in-production-min-32-chars!!",
  RECEIVER_API_KEY: "receiver-dev-key",
  FRONTEND_ORIGIN: "http://localhost:3000",
} as const;

type SecretName = keyof typeof devFallbacks;

/** Railway 는 NODE_ENV 를 자동 주입하지 않는다 — NODE_ENV 만 보면 변수를 빼먹은 배포가
 *  폴백값으로 조용히 떠버려 가드가 무력해지므로, 플랫폼이 주입하는 변수로도 배포를 판별한다
 *  (Railway, AWS ECS). */
const isDeployedEnv = (env: Record<string, string | undefined>) =>
  env.NODE_ENV === "production" ||
  Boolean(
    env.RAILWAY_ENVIRONMENT ??
      env.RAILWAY_ENVIRONMENT_NAME ??
      env.RAILWAY_PROJECT_ID ??
      env.RAILWAY_SERVICE_ID ??
      env.ECS_CONTAINER_METADATA_URI_V4,
  );

/** 대시보드에는 변수가 보이는데 프로세스에는 없는 가장 흔한 원인 — 이름에 공백·탭이 섞여
 *  `RECEIVER_API_KEY\t` 로 저장된 경우. UI 에서는 정상으로 보여 찾는 데 오래 걸린다. */
const findWhitespacePaddedName = (
  env: Record<string, string | undefined>,
  name: string,
) => Object.keys(env).find((key) => key !== name && key.trim() === name);

const MISSING_ENV_HINT =
  "  Railway → 해당 서비스 → Variables 에 설정하세요. (AWS: Secrets Manager → ECS 작업 정의)\n" +
  "  · dev/production 은 서비스가 분리돼 있으니 두 서비스를 모두 확인할 것\n" +
  "  · project Shared Variables 에만 넣었다면 서비스에서 ${{shared.NAME}} 로 참조해야 적용됨\n" +
  "  · 시크릿 생성: openssl rand -hex 24";

export const parseEnv = (env: Record<string, string | undefined>) => {
  const deployed = isDeployedEnv(env);
  const fallbacksUsed: SecretName[] = [];

  const readRequired = (
    name: SecretName,
    rejectFallbackValue: boolean,
  ): string => {
    const value = env[name]?.trim() ?? "";
    if (!deployed) {
      if (value) return value;
      fallbacksUsed.push(name);
      return devFallbacks[name];
    }
    if (!value) {
      const paddedName = findWhitespacePaddedName(env, name);
      throw new EnvConfigError(
        `${name} 가 비어 있습니다 — 배포 환경에서는 필수입니다.\n` +
          (paddedName
            ? `  이름에 공백/탭이 섞인 ${JSON.stringify(paddedName)} 가 대신 설정돼 있습니다.\n` +
              `  대시보드에서는 똑같아 보이니 해당 변수를 지우고 이름을 다시 입력하세요.`
            : MISSING_ENV_HINT),
      );
    }
    if (rejectFallbackValue && value === devFallbacks[name]) {
      throw new EnvConfigError(
        `${name} 가 개발용 기본값 그대로입니다 — 저장소에 공개된 값이라 인증이 없는 것과 같습니다.\n${MISSING_ENV_HINT}`,
      );
    }
    return value;
  };

  const requireSecret = (name: SecretName) => readRequired(name, true);
  /** 시크릿이 아니므로 값 자체는 검사하지 않는다 — dev 백엔드가 localhost 를 허용 origin 으로
   *  두는 것은 정상 설정이다. 누락만 잡는다. */
  const requireConfig = (name: SecretName) => readRequired(name, false);

  const parsed = envSchema.parse({
    PORT: Number(env.PORT ?? "4000"),
    HOST: env.HOST ?? "0.0.0.0",
    DATABASE_URL: requireSecret("DATABASE_URL"),
    JWT_SECRET: requireSecret("JWT_SECRET"),
    RECEIVER_API_KEY: requireSecret("RECEIVER_API_KEY"),
    FRONTEND_ORIGIN: requireConfig("FRONTEND_ORIGIN"),
    TRUST_PROXY_HOPS: Number(env.TRUST_PROXY_HOPS?.trim() || "0"),
    WS_PING_INTERVAL_MS: Number(env.WS_PING_INTERVAL_MS?.trim() || "0"),
    WS_REQUIRE_AUTH: env.WS_REQUIRE_AUTH?.trim() === "true",
  });

  if (fallbacksUsed.length > 0) {
    console.warn(
      `⚠️  개발용 폴백값 사용 중 (로컬 전용): ${fallbacksUsed.join(", ")}`,
    );
  }

  return parsed;
};

export const buildServer = async (env: Env) => {
  const server = Fastify({
    logger: buildLogger(),
    trustProxy: env.TRUST_PROXY_HOPS > 0 ? env.TRUST_PROXY_HOPS : false,
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

  type WsSocket = {
    readyState: number;
    send(d: string): void;
    ping(): void;
    terminate(): void;
    on(e: string, cb: () => void): void;
  };

  server.get(
    "/ws",
    {
      websocket: true,
      preValidation: async (request, reply) => {
        if (!env.WS_REQUIRE_AUTH) return;
        const token = request.cookies.pmcs_token;
        try {
          if (!token) throw new Error("missing token");
          server.jwt.verify(token);
        } catch {
          await reply.code(401).send({ message: "Unauthorized" });
        }
      },
    },
    (connection) => {
      const socket = (connection as unknown as { socket: WsSocket }).socket ?? connection;
      wsHub.add(socket);
      socket.send(JSON.stringify({ type: "welcome", timestamp: Date.now() }));

      // 유휴 연결을 끊는 프록시(ALB 기본 60초)에 대비한 keepalive. pong 이 없으면 죽은 연결로 본다.
      let alive = true;
      socket.on("pong", () => {
        alive = true;
      });
      const pingTimer =
        env.WS_PING_INTERVAL_MS > 0
          ? setInterval(() => {
              if (!alive) {
                socket.terminate();
                return;
              }
              alive = false;
              socket.ping();
            }, env.WS_PING_INTERVAL_MS)
          : null;

      socket.on("close", () => {
        if (pingTimer) clearInterval(pingTimer);
        wsHub.remove(socket);
        server.log.debug({ clients: wsHub.size }, "WS client disconnected");
      });
      server.log.debug({ clients: wsHub.size }, "WS client connected");
    },
  );

  return server;
};
