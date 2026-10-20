import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../prisma/generated/client/client.js";

const LOCAL_DATABASE_URL = "postgresql://pmcs:pmcs@localhost:5432/pmcs";

/**
 * DATABASE_SSL_CA_FILE 이 설정되면 그 CA 번들로 DB 서버 인증서를 검증한다 (AWS RDS).
 * 미설정이면 연결 문자열의 sslmode 를 그대로 따른다 (Neon·로컬 — 기존 동작).
 *
 * pg 는 연결 문자열의 sslmode 를 이 ssl 옵션보다 우선 적용하므로,
 * CA 파일을 쓸 때는 DATABASE_URL 에 sslmode 를 넣지 않는다.
 */
const sslFromCaFile = () => {
  const caFile = process.env.DATABASE_SSL_CA_FILE?.trim();
  if (!caFile) return undefined;
  return { ca: readFileSync(caFile, "utf8"), rejectUnauthorized: true };
};

const poolMax = Number(process.env.DATABASE_POOL_MAX);
const ssl = sslFromCaFile();

/** 프로세스 전체가 공유하는 단일 클라이언트 (커넥션 풀 1개). */
export const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL ?? LOCAL_DATABASE_URL,
    ...(ssl ? { ssl } : {}),
    ...(Number.isInteger(poolMax) && poolMax > 0 ? { max: poolMax } : {}),
  }),
});
