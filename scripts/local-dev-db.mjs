/**
 * 로컬 개발(yarn dev)을 AWS dev DB 의 실제 데이터로 돌린다. Windows·Mac 공용.
 *   로컬 화면(localhost:3000) → 로컬 백엔드(localhost:4000) → 터널(127.0.0.1:15432) → dev 서버(pmcs-dev-box)의 Postgres
 *
 * 사용: yarn dev:aws-db   (이 창은 열어 두고, 다른 터미널에서 yarn dev — 이미 켜져 있으면 재시작)
 *
 * 하는 일
 *   1. AWS 로그인(pmcs-dev)과 계정을 확인하고, dev 서버 시크릿(SSM /pmcs-dev/box/env)에서
 *      로컬 개발 계정(pmcs_local, 데이터만·연결 20개·쿼리 60초 제한)의 비밀번호를 읽는다.
 *   2. 로컬 백엔드·프론트가 이 연결을 쓰도록 env 파일 두 개를 만든다 (둘 다 .gitignore 대상).
 *        apps/backend/.env.development.local   DB 접속 정보, dev 서버가 하는 집계·메일은 로컬에서 끔
 *        apps/frontend/.env.development.local  API 주소를 로컬 백엔드(localhost:4000)로
 *      .env.development.local 은 .env·.env.local·.env.development 보다 우선하므로 기존 파일은 고치지 않는다.
 *   3. dev 서버로 SSM 포트 포워딩을 건다(서버의 127.0.0.1:5432 → 이 PC 의 127.0.0.1:15432). 구간은 SSM 이 암호화한다.
 *   4. Ctrl+C·창 닫기·연결 끊김 시 두 env 파일을 지운다 → yarn dev 는 원래 설정으로 돌아간다.
 *
 * 주의: 로컬에서 바꾼 데이터(설정·명령·Ack 등)는 dev 서버와 같은 DB 에 바로 반영된다.
 * 필요: AWS CLI v2, Session Manager plugin
 * dev 서버 관리 스크립트는 scripts/dev-box/ (bash) 에 있다.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_ACCOUNT = "035680193225";
const NAME_PREFIX = "pmcs-dev";
const BOX_NAME = `${NAME_PREFIX}-box`;
const ENV_PARAM = `/${NAME_PREFIX}/box/env`;
const DB_USER = "pmcs_local";
const PROFILE = process.env.AWS_PROFILE || NAME_PREFIX;
const REGION = process.env.AWS_REGION || "ap-northeast-2";
const PORT = process.env.TUNNEL_PORT || "15432";
const MARKER = "# pmcs-local-dev-db";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backendEnv = path.join(root, "apps/backend/.env.development.local");
const frontendEnv = path.join(root, "apps/frontend/.env.development.local");

const log = (msg) => console.error(`\x1b[1m[dev:aws-db]\x1b[0m ${msg}`);
const die = (msg) => {
  console.error(`\x1b[31m[dev:aws-db] ${msg}\x1b[0m`);
  process.exit(1);
};

/** aws CLI 를 실행하고 JSON 결과를 돌려준다. 실패하면 null(quiet) 또는 종료. */
const aws = (args, { quiet = false } = {}) => {
  const result = spawnSync("aws", [...args, "--profile", PROFILE, "--region", REGION, "--output", "json"], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error?.code === "ENOENT") {
    die("AWS CLI 가 없습니다. 가이드의 '로컬 개발 환경 연결' 단원대로 AWS CLI v2 를 설치하세요.");
  }
  if (result.status !== 0) {
    if (quiet) return null;
    die(`aws ${args.slice(0, 2).join(" ")} 실패: ${(result.stderr || "").trim()}`);
  }
  return result.stdout.trim() ? JSON.parse(result.stdout) : {};
};

const madeByUs = (file) => readFileSync(file, "utf8").startsWith(MARKER);

// ── 확인 ──────────────────────────────────────────────────────────

// Windows: 설치 전에 열어 둔 터미널(Git Bash·VS Code)은 설치 프로그램이 바꾼 PATH 를 모른다.
// 기본 설치 위치를 PATH 에 더해 둔다. aws CLI 도 이 PATH 로 session-manager-plugin 을 찾는다.
if (process.platform === "win32") {
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  const known = [
    path.join(programFiles, "Amazon", "AWSCLIV2"),
    path.join(programFiles, "Amazon", "SessionManagerPlugin", "bin"),
  ];
  const current = (process.env.PATH || "").toLowerCase().split(";");
  const missing = known.filter((dir) => existsSync(dir) && !current.includes(dir.toLowerCase()));
  if (missing.length > 0) process.env.PATH = [process.env.PATH, ...missing].join(";");
}

if (spawnSync("session-manager-plugin", ["--version"], { windowsHide: true }).error) {
  die(
    "Session Manager plugin 이 없습니다. 설치 후 터미널(VS Code 포함)을 모두 닫고 다시 열어 보세요. " +
      "그래도 같으면 설치 파일을 관리자 권한으로 다시 실행하세요.",
  );
}
for (const file of [backendEnv, frontendEnv]) {
  if (existsSync(file) && !madeByUs(file)) {
    die(`${file} 이 이미 있습니다. 직접 만든 파일이면 다른 이름으로 옮긴 뒤 다시 실행하세요.`);
  }
}

const identity = aws(["sts", "get-caller-identity"], { quiet: true });
if (!identity) {
  die(`AWS 로그인이 필요합니다. AAM 포털에서 pmcs-dev → PmcsDevAdmin 을 연 뒤: aws login --profile ${PROFILE}`);
}
if (identity.Account !== EXPECTED_ACCOUNT) {
  die(`계정 불일치: ${identity.Account} (dev 는 ${EXPECTED_ACCOUNT}). 운영·관리 계정에서는 쓰지 않습니다.`);
}

// 서버 시크릿은 dotenv(KEY='value') 한 덩어리다. pmcs_local 비밀번호만 꺼내 쓴다.
const env = aws(["ssm", "get-parameter", "--name", ENV_PARAM, "--with-decryption"], { quiet: true });
const password = /^LOCAL_DB_PASSWORD='([^']*)'$/m.exec(env?.Parameter?.Value ?? "")?.[1];
if (!password) die(`${ENV_PARAM} 에서 LOCAL_DB_PASSWORD 를 읽지 못했습니다. 관리자에게 문의하세요.`);

const instanceId = aws([
  "ec2", "describe-instances",
  "--filters", `Name=tag:Name,Values=${BOX_NAME}`, "Name=instance-state-name,Values=running",
]).Reservations[0]?.Instances[0]?.InstanceId;
if (!instanceId) die(`실행 중인 dev 서버(${BOX_NAME})를 찾지 못했습니다.`);

// ── 정리 (어떤 경로로 끝나든 한 번만) ─────────────────────────────

let session = null;
let cleanedUp = false;
// aws ssm start-session 은 session-manager-plugin 을 자식으로 띄운다. aws 만 끄면 plugin 이 남아 포트를 계속 잡으므로
// 자식까지 함께 끈다 (Windows: taskkill /T, Mac·Linux: pkill -P 로 자식 먼저).
const stopSession = () => {
  if (!session || session.exitCode !== null || session.signalCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(session.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    return;
  }
  spawnSync("pkill", ["-TERM", "-P", String(session.pid)], { stdio: "ignore" });
  session.kill("SIGTERM");
};
const cleanup = () => {
  if (cleanedUp) return;
  cleanedUp = true;
  stopSession();
  for (const file of [backendEnv, frontendEnv]) {
    if (existsSync(file) && madeByUs(file)) rmSync(file);
  }
  log("로컬 env 파일을 지웠습니다. yarn dev 를 재시작하면 원래 설정으로 돌아갑니다.");
};
process.on("exit", cleanup);
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) {
  // 사용자가 닫는 것은 정상 종료다. 0 으로 끝내야 yarn 이 오류 메시지를 띄우지 않는다.
  process.on(signal, () => process.exit(0));
}

// ── env 파일 ──────────────────────────────────────────────────────

const header = `${MARKER} — yarn dev:aws-db (scripts/local-dev-db.mjs) 가 만든 파일. 연결을 닫으면 지워진다. 직접 고치지 말 것.`;
writeFileSync(
  backendEnv,
  [
    header,
    // 서버 Postgres 는 TLS 를 쓰지 않는다. 구간은 SSM 세션이 암호화하고, 서버 밖으로는 포트가 열려 있지 않다.
    `DATABASE_URL=postgresql://${DB_USER}:${password}@127.0.0.1:${PORT}/pmcs`,
    "DATABASE_POOL_MAX=5",
    "# 집계·알림 메일은 AWS dev 서버가 이미 한다. 로컬에서 같이 돌리지 않는다.",
    "AGGREGATION_ENABLED=false",
    "RAW_PURGE_ENABLED=false",
    "SUMMARY_PURGE_ENABLED=false",
    "SMTP_HOST=",
    "",
  ].join("\n"),
  { mode: 0o600 },
);
writeFileSync(
  frontendEnv,
  [header, "NEXT_PUBLIC_API_BASE=http://localhost:4000", "COMMAND_API_BASE=http://localhost:4000", ""].join("\n"),
  { mode: 0o600 },
);
log("로컬 env 파일을 만들었습니다.");

// ── 터널 ──────────────────────────────────────────────────────────

log(`연결됨: 127.0.0.1:${PORT} → dev DB. 이제 다른 터미널에서 yarn dev (이미 켜져 있으면 재시작). 끝나면 이 창에서 Ctrl+C.`);
session = spawn(
  "aws",
  [
    "ssm", "start-session",
    "--target", instanceId,
    "--document-name", "AWS-StartPortForwardingSession",
    "--parameters", JSON.stringify({ portNumber: ["5432"], localPortNumber: [PORT] }),
    "--profile", PROFILE,
    "--region", REGION,
  ],
  { stdio: "inherit", windowsHide: true },
);
session.on("exit", (code) => {
  if (cleanedUp) return;
  log(code === 0 ? "터널 세션이 끝났습니다." : `터널 세션이 끊겼습니다 (코드 ${code}). 다시 열려면 yarn dev:aws-db`);
  process.exit(code ?? 0);
});
