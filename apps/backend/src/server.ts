import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { z } from "zod";
import { buildLogger } from "./lib/logger.js";
import { healthRoutes } from "./routes/health.js";
import { deviceRoutes } from "./routes/devices.js";

const envSchema = z.object({
  PORT: z.number().int().positive(),
  HOST: z.string().min(1),
  DATABASE_URL: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

export const parseEnv = (env: Record<string, string | undefined>) => {
  return envSchema.parse({
    PORT: Number(env.PORT ?? "4000"),
    HOST: env.HOST ?? "0.0.0.0",
    DATABASE_URL:
      env.DATABASE_URL ?? "postgresql://pmcs:pmcs@localhost:5432/pmcs",
  });
};

export const buildServer = async (env: Env) => {
  const server = Fastify({
    logger: buildLogger(),
  });

  await server.register(websocket);

  await server.register(healthRoutes, { prefix: "/health" });
  await server.register(deviceRoutes, { prefix: "/devices" });

  server.get("/ws", { websocket: true }, (connection) => {
    connection.socket.send(
      JSON.stringify({ type: "welcome", timestamp: Date.now() }),
    );
  });

  return server;
};
