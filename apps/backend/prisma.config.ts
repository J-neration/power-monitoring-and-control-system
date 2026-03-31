import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Load .env relative to this config file, not CWD
// (yarn workspace runs from the monorepo root, not apps/backend/)
config({ path: path.resolve(import.meta.dirname, ".env") });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts"
  },
  datasource: {
    // Use process.env instead of env() so prisma generate works without DATABASE_URL.
    // env() throws PrismaConfigEnvError immediately if the variable is missing;
    // process.env gracefully returns undefined, which Prisma 7.2.0+ tolerates for generate.
    url: process.env.DATABASE_URL!
  }
});
