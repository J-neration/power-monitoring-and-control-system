/**
 * 로컬 개발(yarn dev)을 AWS dev DB 의 실제 데이터로 돌린다. Windows·Mac 공용.
 *   로컬 화면(localhost:3000) → 로컬 백엔드(localhost:4000) → 터널(127.0.0.1:15432) → dev RDS
 *
 * 사용: yarn dev:aws-db   (이 창은 열어 두고, 다른 터미널에서 yarn dev — 이미 켜져 있으면 재시작)
 *       TUNNEL_HOURS 로 최대 유지 시간(1~12, 기본 8)을 바꿀 수 있다.
 *
 * 하는 일
 *   1. AWS 로그인(pmcs-dev)과 계정을 확인하고, 시크릿 pmcs-dev/db-local 에서 로컬 개발 계정(pmcs_local)을 읽는다.
 *   2. 로컬 백엔드·프론트가 이 연결을 쓰도록 env 파일 두 개를 만든다 (둘 다 .gitignore 대상).
 *        apps/backend/.env.development.local   DB 접속 정보, dev 서버가 하는 집계·메일은 로컬에서 끔
 *        apps/frontend/.env.development.local  API 주소를 로컬 백엔드(localhost:4000)로
 *      .env.development.local 은 .env·.env.local·.env.development 보다 우선하므로 기존 파일은 고치지 않는다.
 *   3. 터널 전용 ECS 태스크(pmcs-dev-db-tunnel)를 띄우고 SSM 포트 포워딩을 건다.
 *   4. Ctrl+C·창 닫기·연결 끊김 시 태스크를 종료하고 두 env 파일을 지운다 → yarn dev 는 원래 설정으로 돌아간다.
 *
 * 주의: 로컬에서 바꾼 데이터(설정·명령·Ack 등)는 dev 서버와 같은 DB 에 바로 반영된다.
 * 필요: AWS CLI v2, Session Manager plugin, 관리자가 setup-local-role.sh 를 한 번 실행해 둘 것
 * 계정 생성·RDS 작업용 스크립트는 scripts/aws-migrate/ (bash) 에 있다.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_ACCOUNT = "035680193225";
const NAME_PREFIX = "pmcs-dev";
const SECRET_ID = `${NAME_PREFIX}/db-local`;
const PROFILE = process.env.AWS_PROFILE || NAME_PREFIX;
const REGION = process.env.AWS_REGION || "ap-northeast-2";
const PORT = process.env.TUNNEL_PORT || "15432";
const HOURS = Number(process.env.TUNNEL_HOURS || 8);
const MARKER = "# pmcs-local-dev-db";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// dotenv 값에 Windows 역슬래시가 섞이지 않게 슬래시로 쓴다 (Node 는 Windows 에서도 읽는다).
const toPosix = (p) => p.split(path.sep).join("/");
const backendEnv = path.join(root, "apps/backend/.env.development.local");
const frontendEnv = path.join(root, "apps/frontend/.env.development.local");
const caFile = toPosix(path.join(root, "apps/backend/certs/rds-global-bundle.pem"));

const log = (msg) => console.error(`\x1b[1m[dev:aws-db]\x1b[0m ${msg}`);
const die = (msg) => {
  console.error(`\x1b[31m[dev:aws-db] ${msg}\x1b[0m`);
  process.exit(1);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

if (!Number.isInteger(HOURS) || HOURS < 1 || HOURS > 12) die(`TUNNEL_HOURS 는 1~12 사이 정수여야 합니다: ${HOURS}`);
if (spawnSync("session-manager-plugin", ["--version"], { windowsHide: true }).error) {
  die("Session Manager plugin 이 없습니다. 가이드의 '로컬 개발 환경 연결' 단원대로 설치하세요.");
}
if (!existsSync(caFile)) die(`RDS CA 파일이 없습니다: ${caFile}`);
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

const secret = aws(["secretsmanager", "get-secret-value", "--secret-id", SECRET_ID], { quiet: true });
const login = secret?.SecretString ? JSON.parse(secret.SecretString) : {};
if (!login.username || !login.password) {
  die(`시크릿 ${SECRET_ID} 이 비어 있거나 읽을 수 없습니다. 관리자에게 setup-local-role.sh 실행을 요청하세요.`);
}

const dbHost = aws(["rds", "describe-db-instances", "--db-instance-identifier", `${NAME_PREFIX}-db`])
  .DBInstances[0].Endpoint.Address;

// 터널 태스크 네트워크: NAT 가 있으면 비공개 서브넷, 없으면(dev) 공개 서브넷 + 공인 IP. api 보안 그룹이라 들어오는 연결은 막혀 있다.
const vpcId = aws(["ec2", "describe-vpcs", "--filters", `Name=tag:Name,Values=${NAME_PREFIX}-vpc`]).Vpcs[0]?.VpcId;
if (!vpcId) die(`${NAME_PREFIX}-vpc 를 찾지 못했습니다.`);
const natCount = aws([
  "ec2", "describe-nat-gateways",
  "--filter", `Name=vpc-id,Values=${vpcId}`, "Name=state,Values=pending,available",
]).NatGateways.length;
const tier = natCount > 0 ? "private" : "public";
const subnets = aws([
  "ec2", "describe-subnets",
  "--filters", `Name=vpc-id,Values=${vpcId}`, `Name=tag:Name,Values=${NAME_PREFIX}-${tier}-*`,
]).Subnets.map((s) => s.SubnetId);
const securityGroup = aws([
  "ec2", "describe-security-groups",
  "--filters", `Name=vpc-id,Values=${vpcId}`, `Name=group-name,Values=${NAME_PREFIX}-api`,
]).SecurityGroups[0]?.GroupId;
if (subnets.length === 0 || !securityGroup) die(`${tier} 서브넷 또는 ${NAME_PREFIX}-api 보안 그룹을 찾지 못했습니다.`);

const taskDefinition = `${NAME_PREFIX}-db-tunnel`;
// GuardDuty 런타임 감시 에이전트 컨테이너가 함께 붙으므로 containers[0] 이 아니라 이름으로 찾는다.
const containerName = aws(["ecs", "describe-task-definition", "--task-definition", taskDefinition])
  .taskDefinition.containerDefinitions[0].name;

// ── 정리 (어떤 경로로 끝나든 한 번만) ─────────────────────────────

let taskArn = null;
let session = null;
let cleanedUp = false;
const cleanup = () => {
  if (cleanedUp) return;
  cleanedUp = true;
  if (session && session.exitCode === null) session.kill();
  if (taskArn) {
    aws(["ecs", "stop-task", "--cluster", NAME_PREFIX, "--task", taskArn, "--reason", "dev:aws-db closed"], { quiet: true });
    log("터널 태스크를 종료했습니다.");
  }
  for (const file of [backendEnv, frontendEnv]) {
    if (existsSync(file) && madeByUs(file)) rmSync(file);
  }
  log("로컬 env 파일을 지웠습니다. yarn dev 를 재시작하면 원래 설정으로 돌아갑니다.");
};
process.on("exit", cleanup);
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) {
  process.on(signal, () => process.exit(130));
}

// ── env 파일 ──────────────────────────────────────────────────────

const header = `${MARKER} — yarn dev:aws-db (scripts/local-dev-db.mjs) 가 만든 파일. 연결을 닫으면 지워진다. 직접 고치지 말 것.`;
writeFileSync(
  backendEnv,
  [
    header,
    `DATABASE_URL=postgresql://${login.username}:${login.password}@127.0.0.1:${PORT}/${login.dbname || "pmcs"}`,
    `DATABASE_SSL_CA_FILE=${caFile}`,
    `DATABASE_SSL_SERVERNAME=${dbHost}`,
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

log(`터널 태스크 시작 (최대 ${HOURS}시간). 1~2분 걸립니다…`);
const run = aws([
  "ecs", "run-task",
  "--cluster", NAME_PREFIX,
  "--task-definition", taskDefinition,
  "--launch-type", "FARGATE",
  "--enable-execute-command",
  "--started-by", "dev-aws-db",
  "--network-configuration",
  JSON.stringify({
    awsvpcConfiguration: {
      subnets,
      securityGroups: [securityGroup],
      assignPublicIp: tier === "public" ? "ENABLED" : "DISABLED",
    },
  }),
  "--overrides",
  JSON.stringify({ containerOverrides: [{ name: containerName, command: ["sleep", String(HOURS * 3600)] }] }),
]);
taskArn = run.tasks?.[0]?.taskArn ?? null;
if (!taskArn) die(`태스크를 시작하지 못했습니다: ${JSON.stringify(run.failures ?? [])}`);

const container = async () => {
  for (let i = 0; i < 60; i += 1) {
    const task = aws(["ecs", "describe-tasks", "--cluster", NAME_PREFIX, "--tasks", taskArn]).tasks[0];
    if (task.lastStatus === "STOPPED") die(`태스크가 멈췄습니다: ${task.stoppedReason ?? "이유 없음"}`);
    const c = task.containers.find((x) => x.name === containerName);
    const agent = c?.managedAgents?.find((a) => a.name === "ExecuteCommandAgent");
    if (task.lastStatus === "RUNNING" && agent?.lastStatus === "RUNNING" && c.runtimeId) return c;
    await sleep(5000);
  }
  return die("터널 태스크가 5분 안에 준비되지 않았습니다.");
};
const { runtimeId } = await container();

log(`연결됨: 127.0.0.1:${PORT} → dev DB. 이제 다른 터미널에서 yarn dev (이미 켜져 있으면 재시작). 끝나면 이 창에서 Ctrl+C.`);
session = spawn(
  "aws",
  [
    "ssm", "start-session",
    "--target", `ecs:${NAME_PREFIX}_${taskArn.split("/").pop()}_${runtimeId}`,
    "--document-name", "AWS-StartPortForwardingSessionToRemoteHost",
    "--parameters", JSON.stringify({ host: [dbHost], portNumber: ["5432"], localPortNumber: [PORT] }),
    "--profile", PROFILE,
    "--region", REGION,
  ],
  { stdio: "inherit", windowsHide: true },
);
session.on("exit", (code) => {
  log(code === 0 ? "터널 세션이 끝났습니다." : `터널 세션이 끊겼습니다 (코드 ${code}). 다시 열려면 yarn dev:aws-db`);
  process.exit(code ?? 0);
});
