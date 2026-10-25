import { readFileSync } from "node:fs";
import { checkServerIdentity, type ConnectionOptions } from "node:tls";

/**
 * DATABASE_SSL_CA_FILE 이 설정되면 그 CA 번들로 DB 서버 인증서를 검증한다 (AWS RDS).
 * 미설정이면 연결 문자열의 sslmode 를 그대로 따른다 (Neon·로컬 — 기존 동작).
 *
 * pg 는 연결 문자열의 sslmode 를 이 ssl 옵션보다 우선 적용하므로,
 * CA 파일을 쓸 때는 DATABASE_URL 에 sslmode 를 넣지 않는다.
 *
 * DATABASE_SSL_SERVERNAME 은 로컬에서 SSM 터널(127.0.0.1)로 RDS 에 붙을 때 쓴다.
 * 접속 주소가 인증서의 호스트명과 달라도, 인증서를 이 RDS 주소 기준으로 검증한다.
 */
export const dbSslOptions = (
  env: NodeJS.ProcessEnv = process.env,
  readFile: (file: string) => string = (file) => readFileSync(file, "utf8"),
): ConnectionOptions | undefined => {
  const caFile = env.DATABASE_SSL_CA_FILE?.trim();
  if (!caFile) return undefined;
  const servername = env.DATABASE_SSL_SERVERNAME?.trim();
  return {
    ca: readFile(caFile),
    rejectUnauthorized: true,
    ...(servername
      ? { checkServerIdentity: (_host: string, cert) => checkServerIdentity(servername, cert) }
      : {}),
  };
};
