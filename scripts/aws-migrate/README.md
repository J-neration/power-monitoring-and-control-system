# RDS 도구 (터널·DB 계정·마이그레이션) 와 Neon → RDS 이전 기록

RDS 에 붙는 터널, DB 계정, 마이그레이션 태스크 스크립트입니다. 처음에는 Neon 의 데이터를 RDS 로 옮기려고 만들었습니다.

- 2026-10 dev 전환(Neon dev → RDS dev), 2026-10-28 운영 컷오버(Neon production → RDS prod)에 썼습니다.
- **2026-11-05 Neon 프로젝트를 삭제했습니다.** 삭제 직전 덤프(`pg_dump -Fc`, production·dev, 행 수를 원본과 대조함)는
  `s3://pmcs-prod-archive-887664351558/neon/` 에 있습니다(pmcs-prod 계정, KMS 암호화). 되살릴 때는
  `pg_restore --no-owner --no-acl -d <빈 DB> neon-production-20261105.dump`.
- `copy-data.sh`·`copy-delta.sh`·`verify-row-counts.sh` 는 원본으로 Neon 을 가정합니다. 원본이 사라졌으므로 기록으로만 둡니다
  (다른 PostgreSQL 을 원본으로 쓸 때는 `SOURCE_LABEL` 검사를 맞게 고쳐서).

## 운영 컷오버 (2026-10-28 완료, 기록)

아래는 그날의 절차입니다. Railway·Netlify·Neon 을 모두 해지했으므로 그대로 다시 실행할 수는 없습니다.

현장 HMI 는 펌웨어에 Railway 운영 주소가 박혀 있고, 실패한 전송을 다시 보내지 않는다. 그래서 Railway 를 멈추고
복사하지 않는다. Railway 가 Neon 에 계속 쓰는 동안 통째로 복사하고 → 화면 주소(DNS)를 AWS 로 → Railway 를 중계로
바꾼 뒤 → 그 사이 Neon 에 들어온 행만 `copy-delta.sh` 로 더 옮긴다.

순서가 중요하다. Netlify 화면은 Railway 운영 API 를 직접 부르므로, Railway 를 중계로 먼저 바꾸면 그 순간 화면이 깨진다.
반드시 DNS 를 먼저 바꾸고 5~10분(TTL 300초) 뒤에 중계로 바꾼다.

시간: 집계가 매시 :05 에 돌기 때문에 **:10 이후 시작해 다음 :05 전에 8단계까지** 끝낸다(약 45분). 늦어지면 다음 시간 :10 에.

**준비 (전날까지)**
- `pmcs-prod/alert-mail` 시크릿에 Railway 운영과 같은 SMTP 값. 비어 있으면 관리자 알림 메일이 나가지 않는다.
- Railway 운영 Variables 와 AWS api 작업 정의 비교 — 기본값이 아닌 값을 쓰는 것(`RECEIVER_*`, `REMOTE_WINDOW_SECONDS`,
  `COMMAND_*`, `DEVICE_*`, `AGGREGATION_*`, 보관 기간)이 있으면 `envs/prod/app` 에 반영.
- 당일 화면 사용자에게 공지: 잠깐 접속이 끊기고 다시 로그인해야 한다(JWT 비밀키가 다름).

```sh
export AWS_PROFILE=pmcs-prod AWS_REGION=ap-northeast-2 PMCS_ENV=prod
export SOURCE_LABEL=neon-production CONFIRM_PRODUCTION=yes SOURCE_DATABASE_URL="$(cat ~/.pmcs/neon-prod-url)"

# 0. 터미널 A: 터널 (끝날 때까지 열어 둠)
scripts/aws-migrate/open-db-tunnel.sh

# 1. API 멈춤 → RDS 비우기 (리허설 데이터 삭제. 이전 상태는 시점 복구로 되살릴 수 있음)
aws ecs update-service --cluster pmcs-prod --service pmcs-prod-api --desired-count 0 >/dev/null
aws ecs wait services-stable --cluster pmcs-prod --services pmcs-prod-api
CONFIRM_RESET=pmcs-prod-db scripts/aws-migrate/reset-target.sh

# 2. SINCE 기록(3분 여유) → 통째로 복사. Railway 는 계속 Neon 에 쓰므로 원본이 더 많은 표는 정상
export SINCE="$(date -u -v-3M '+%Y-%m-%d %H:%M:%S')"; echo "SINCE=$SINCE"   # 적어 둔다
ALLOW_SOURCE_AHEAD=1 scripts/aws-migrate/copy-data.sh

# 3. API 다시 켜기 → https://app.pqms.co.kr 에 기존 계정으로 로그인되는지
aws ecs update-service --cluster pmcs-prod --service pmcs-prod-api --desired-count 1 >/dev/null
aws ecs wait services-stable --cluster pmcs-prod --services pmcs-prod-api

# 4. DNS: infra/terraform/envs/prod/dns/terraform.tfvars 의 app_target = "aws" → plan(제자리 수정 2건 확인) → apply → 커밋
#    확인: dig +short pqms.co.kr @1.1.1.1 / @8.8.8.8 이 ALB IP, https://pqms.co.kr/login 200, www → pqms.co.kr 301
#    5~10분 기다린다(TTL 300초).

# 5. Railway 운영 서비스(사람이 대시보드에서): Settings → Root Directory = /infra/railway-relay,
#    Config-as-code = /infra/railway-relay/railway.toml, Variables 에 UPSTREAM_HOST=api.pqms.co.kr → Deploy
#    확인: curl https://pmcsbackend-production.up.railway.app/relay-health → 200, /receiver (키 없이 POST) → 401

# 6. 공백 메우기. 두 번째 실행에서 insert·update 가 0 이면 끝
scripts/aws-migrate/copy-delta.sh
scripts/aws-migrate/copy-delta.sh

# 7. 확인: /ecs/pmcs-prod/api 로그에 Railway IP 에서 온 POST /receiver 200 (장비 주기 10~60분),
#    Neon 에는 5단계 뒤로 새 텔레메트리가 없어야 한다. 앱 화면에서 각 현장 최신 값.
# 8. 터널 창 Ctrl+C
```

**되돌리기**(그때 준비했던 것): 5단계 전에는 DNS 를 Netlify 로, 뒤에는 Railway 를 원래 백엔드로 되돌리는 것이었다.
옛 시스템을 해지해 이제는 쓸 수 없다.

**정리 (2026-11-05 완료)**: 현장 HMI 펌웨어를 모두 `api.pqms.co.kr` 로 바꾼 뒤(옛 펌웨어 2대는 고객 해지로 철거)
수신 키 교체를 마무리했고(`rotate-receiver-key.sh finish`), Railway(중계 포함)·Netlify·Neon 을 해지했다.
`prisma-migrate-production.yml`·`DATABASE_URL_PRODUCTION` 시크릿, dns 루트의 `dev.pqms.co.kr`(Netlify) 레코드와 `app_target` 도 지웠다.

2026-10-28 로컬 리허설(PostgreSQL 16 두 개, 대상 TLS): 리허설 데이터가 있는 대상 비우기 → 원본이 쓰이는 중 통째 복사
(원본이 더 많은 표 표시) → 원본에 공백 구간 쓰기(텔레메트리·새 장비·로그인·고장·명령) + 대상에 더 최신 쓰기 →
`copy-delta.sh`: 원본 행 모두 대상에 있음, 대상이 더 최신인 Device 는 그대로, 같은 고장 고유 키 충돌은 대상 행 유지,
두 번째 실행 insert·update 0.

## 순서

| 순서 | 스크립트 | 하는 일 |
|---|---|---|
| 0 | (준비) | app 루트 적용, API 이미지를 ECR 에 푸시 (터널 태스크가 그 이미지를 씀) |
| 1 | `open-db-tunnel.sh` | 터널 전용 ECS 태스크를 띄우고 `localhost:15432` → RDS 로 SSM 포트 포워딩. 창을 열어 둔 채 다른 터미널에서 2~3 진행 |
| 2 | `setup-db-roles.sh` | DB 계정 `pmcs_migrator`(스키마 소유)·`pmcs_app`(데이터 읽기·쓰기만) 생성, 접속 주소를 시크릿 `pmcs-<env>/api` 에 저장 |
| 3 | `copy-data.sh` | Neon public 스키마를 RDS 로 복사(한 트랜잭션), 앱 계정 권한 부여, 행 수 비교 |
| 3a | `reset-target.sh` | (컷오버) 대상 public 스키마 비우기. 계정·권한은 유지 |
| 3c | `copy-delta.sh` | (컷오버) 통째 복사 뒤 Neon 에 더 들어온 행을 RDS 에 합치기 |
| 3b | `run-migrate-task.sh` | 마이그레이션 태스크를 한 번 실행하고 결과(종료 코드·로그 끝)를 보여 줌. 새 이미지를 배포할 때마다 서비스보다 먼저 |
| 4 | (마무리) | 터널 창에서 Ctrl+C (태스크 자동 종료) → 시크릿의 나머지 키 입력 → API 서비스 태스크 수 1 |

```sh
# 공통
export AWS_PROFILE=pmcs-dev PMCS_ENV=dev

# 터미널 A
scripts/aws-migrate/open-db-tunnel.sh

# 터미널 B
scripts/aws-migrate/setup-db-roles.sh
export SOURCE_LABEL=neon-dev
export SOURCE_DATABASE_URL='postgresql://...neon.tech/neondb?sslmode=require'   # Neon dev 브랜치, 채팅에 붙여 넣지 말 것
scripts/aws-migrate/copy-data.sh
```

## 데이터 둘러보기 (조회 전용 계정)

사람이 RDS 데이터를 볼 때는 조회만 되는 `pmcs_readonly` 계정을 쓴다. 한 번만 만들면 되고, 다시 실행하면 비밀번호가 바뀐다.
prod 는 2026-11-05 에 만들었다(시크릿 `pmcs-prod/db-readonly`).

```sh
# 터미널 A: 터널. TargetNotConnected 로 바로 끝나면(에이전트 등록이 몇 초 늦음) 한 번 더 실행한다.
PMCS_ENV=prod scripts/aws-migrate/open-db-tunnel.sh
# 터미널 B: 계정 생성 (최초 1회, 이미 있으면 건너뜀) → 로그인 정보는 시크릿 pmcs-prod/db-readonly
PMCS_ENV=prod scripts/aws-migrate/setup-readonly-role.sh
```

DB 프로그램(TablePlus 등)에서 Host `127.0.0.1`, Port `15432`, Database `pmcs`, SSL mode `require`, 사용자·비밀번호는 시크릿 값으로 접속한다.
권한은 SELECT 뿐이고 세션도 읽기 전용 트랜잭션이 기본이라, 두 겹으로 쓰기가 막힌다. 마이그레이션이 새로 만드는 테이블도 자동으로 조회할 수 있다.

## 로컬 개발을 dev 데이터로 (yarn dev:aws-db)

dev 는 2026-10-23 부터 서버 1대형이라 RDS 터널을 쓰지 않는다. `scripts/dev-box/README.md` 참고.

## 운영 DB 복구 시험 (시점 복구)

운영 RDS 는 자동 백업 14일이라 그 안의 어느 시점으로든 새 인스턴스를 만들 수 있다. 원본은 건드리지 않는다.

```sh
export AWS_PROFILE=pmcs-prod AWS_REGION=ap-northeast-2
# 서브넷 그룹·보안 그룹·파라미터 그룹은 원본(pmcs-prod-db)과 같은 값을 describe-db-instances 로 확인해 넣는다
aws rds restore-db-instance-to-point-in-time --source-db-instance-identifier pmcs-prod-db \
  --target-db-instance-identifier pmcs-prod-db-restore-test --use-latest-restorable-time \
  --db-instance-class db.t4g.micro --db-subnet-group-name pmcs-prod-db --vpc-security-group-ids <sg> \
  --db-parameter-group-name <pg> --no-publicly-accessible --no-multi-az --no-deletion-protection \
  --tags Key=Purpose,Value=restore-test
aws rds wait db-instance-available --db-instance-identifier pmcs-prod-db-restore-test

# 터미널 A: 운영 DB, 터미널 B: 복구본
PMCS_ENV=prod TUNNEL_PORT=15432 scripts/aws-migrate/open-db-tunnel.sh
PMCS_ENV=prod DB_IDENTIFIER=pmcs-prod-db-restore-test TUNNEL_PORT=15433 scripts/aws-migrate/open-db-tunnel.sh

# 터미널 C: 복구본(원본 자리, 읽기 전용)과 운영 DB 의 행 수 비교. 매시 :05 집계 전후는 피한다
murl=$(aws secretsmanager get-secret-value --secret-id pmcs-prod/api --query SecretString --output text | jq -r .MIGRATE_DATABASE_URL)
SOURCE_DATABASE_URL=$(sed -E 's#@[^/]+/([^?]+).*#@host.docker.internal:15433/\1?sslmode=require#' <<<"$murl") \
  PMCS_ENV=prod TUNNEL_PORT=15432 scripts/aws-migrate/verify-row-counts.sh

# 정리
aws rds delete-db-instance --db-instance-identifier pmcs-prod-db-restore-test --skip-final-snapshot --delete-automated-backups
```

2026-10-27 시험(UTC): 요청 23:51 → 복구 완료 00:00:44 → 접속 가능 00:01 (약 10분). 16개 테이블 행 수 일치,
`pmcs_app` 로그인, 실패한 마이그레이션 없음, 최신 텔레메트리·집계 시각 원본과 같음. 비용 $0.1 미만.
복구 중 RDS 가 메모리 부족으로 `shared_buffers` 를 자동으로 줄였다는 이벤트가 한 번 나왔다(t4g.micro, 복구본에만).

## 필요한 것

- AWS CLI(`aws login --profile pmcs-dev`), `jq`, Docker Desktop
- `session-manager-plugin`: `brew install --cask session-manager-plugin` (설치 시 Mac 관리자 암호 필요)
- `psql`·`pg_dump` 는 Docker 의 `postgres:16` 이미지를 쓰므로 설치하지 않아도 됩니다.

## 안전장치

- 계정 확인: `PMCS_ENV` 에 맞는 AWS 계정이 아니면 멈춥니다 (dev 035680193225, prod 887664351558).
- 운영 데이터 보호: dev 에는 `SOURCE_LABEL=neon-dev` 만 허용합니다. prod 는 `CONFIRM_PRODUCTION=yes` 가 있어야 실행됩니다.
- 빈 DB 에만 복원합니다. 한 트랜잭션이라 실패하면 대상에 아무것도 남지 않습니다.
- 비밀번호·연결 문자열은 화면과 명령줄에 나오지 않습니다(환경 변수·표준 입력으로만 전달). 덤프는 파일로 남기지 않습니다.
- DB 계정 권한: 앱 계정은 테이블을 만들거나 지우거나 바꿀 수 없습니다. 마이그레이션이 나중에 만드는 테이블에도 앱 권한이 자동으로 붙습니다.

## TLS

| 접속 | 방식 |
|---|---|
| 앱 (`DATABASE_URL`) | sslmode 없이, `DATABASE_SSL_CA_FILE` 로 RDS 인증서와 호스트명을 검증 |
| 마이그레이션 (`MIGRATE_DATABASE_URL`) | `sslmode=require&sslcert=<CA>&sslaccept=strict` — Prisma 마이그레이션 엔진은 `verify-full`·`sslrootcert` 를 무시하므로 이 형식이어야 검증됩니다. 또 `sslcert` 파일의 첫 인증서만 읽어서, 전체 묶음 대신 서울 루트 하나만 담은 `certs/rds-ap-northeast-2-rsa2048-g1.pem` 을 씁니다 |
| 로컬 백엔드 (`yarn dev:aws-db`, 터널 경유) | `DATABASE_SSL_CA_FILE` + `DATABASE_SSL_SERVERNAME=<RDS 주소>` — 127.0.0.1 로 붙어도 RDS 인증서와 호스트명을 검증 |
| 이 스크립트들 (터널 경유) | `sslmode=require`. 터널 주소가 인증서 호스트명과 달라 검증 대신 암호화만 강제하며, 구간은 SSM 이 한 번 더 암호화합니다 |

## 로컬 리허설

AWS 없이 Docker 로 전 과정을 시험할 수 있습니다. `LOCAL_REHEARSAL=1` 이면 AWS 호출과 시크릿 쓰기를 건너뛰고,
마스터 계정·비밀번호를 환경 변수로 받습니다.

```sh
export LOCAL_REHEARSAL=1 PG_DOCKER_NETWORK=<네트워크> TARGET_HOST=<대상 컨테이너> TARGET_PORT=5432
export MASTER_USER=... MASTER_PASSWORD=... APP_DB_PASSWORD=$(openssl rand -hex 24) MIGRATOR_DB_PASSWORD=$(openssl rand -hex 24)
scripts/aws-migrate/setup-db-roles.sh
SOURCE_LABEL=neon-dev SOURCE_DATABASE_URL=... scripts/aws-migrate/copy-data.sh
```

2026-10-21 리허설(PostgreSQL 16, 대상은 TLS·비슈퍼유저 마스터로 RDS 와 같게 구성)에서 확인한 것:
계정 생성·재실행, 마이그레이션 25건과 데이터 복사·행 수 일치, 비어 있지 않은 대상·dev 에 운영 라벨 거부,
`pmcs_migrator` 로 `prisma migrate deploy` → 적용할 것 없음, `pmcs_app` 으로 API 기동·로그인(쓰기 포함),
앱 계정의 CREATE·DROP·ALTER·TRUNCATE 거부, 새 테이블에 앱 권한 자동 부여.
