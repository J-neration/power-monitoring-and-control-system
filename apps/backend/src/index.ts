import { buildServer } from "./server.js";
import { loadEnv } from "./lib/env.js";

const env = loadEnv();
const server = await buildServer(env);

try {
  await server.listen({ port: env.PORT, host: env.HOST });
  server.log.info(`API listening on http://${env.HOST}:${env.PORT}`);
} catch (error) {
  server.log.error(error, "Failed to start server");
  process.exit(1);
}
