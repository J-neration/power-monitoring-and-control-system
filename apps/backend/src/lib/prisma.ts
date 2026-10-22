import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../prisma/generated/client/client.js";
import { dbSslOptions } from "./dbSsl.js";

const LOCAL_DATABASE_URL = "postgresql://pmcs:pmcs@localhost:5432/pmcs";

const poolMax = Number(process.env.DATABASE_POOL_MAX);
const ssl = dbSslOptions();

/** 프로세스 전체가 공유하는 단일 클라이언트 (커넥션 풀 1개). */
export const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL ?? LOCAL_DATABASE_URL,
    ...(ssl ? { ssl } : {}),
    ...(Number.isInteger(poolMax) && poolMax > 0 ? { max: poolMax } : {}),
  }),
});
