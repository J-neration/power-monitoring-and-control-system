# Neon → AWS RDS 데이터 이전

3단계(dev 전환)와 운영 컷오버에서 Neon 의 데이터를 RDS 로 옮기는 스크립트입니다.
dev 는 Neon **dev** 브랜치 → RDS dev 만 허용하며, 운영 데이터는 dev 로 복사하지 않습니다.

## 순서

| 순서 | 스크립트 | 하는 일 |
|---|---|---|
| 0 | (준비) | app 루트 적용, API 이미지를 ECR 에 푸시 (터널 태스크가 그 이미지를 씀) |
| 1 | `open-db-tunnel.sh` | 터널 전용 ECS 태스크를 띄우고 `localhost:15432` → RDS 로 SSM 포트 포워딩. 창을 열어 둔 채 다른 터미널에서 2~3 진행 |
| 2 | `setup-db-roles.sh` | DB 계정 `pmcs_migrator`(스키마 소유)·`pmcs_app`(데이터 읽기·쓰기만) 생성, 접속 주소를 시크릿 `pmcs-<env>/api` 에 저장 |
| 3 | `copy-data.sh` | Neon public 스키마를 RDS 로 복사(한 트랜잭션), 앱 계정 권한 부여, 행 수 비교 |
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

```sh
# 터미널 A: 터널
PMCS_ENV=dev scripts/aws-migrate/open-db-tunnel.sh
# 터미널 B: 계정 생성 (최초 1회) → 로그인 정보는 시크릿 pmcs-dev/db-readonly
PMCS_ENV=dev scripts/aws-migrate/setup-readonly-role.sh
```

DB 프로그램(TablePlus 등)에서 Host `127.0.0.1`, Port `15432`, Database `pmcs`, SSL mode `require`, 사용자·비밀번호는 시크릿 값으로 접속한다.
권한은 SELECT 뿐이고 세션도 읽기 전용 트랜잭션이 기본이라, 두 겹으로 쓰기가 막힌다. 마이그레이션이 새로 만드는 테이블도 자동으로 조회할 수 있다.

## 로컬 개발을 dev 데이터로 (yarn dev:aws-db)

로컬 `yarn dev` 를 AWS dev DB 의 실제 데이터로 돌린다. dev 의 `api-dev.pqms.co.kr` 은 HMI 수신(`/receiver`)만 열려 있어서,
로컬 화면이 그 주소를 보면 데이터가 나오지 않는다. 대신 로컬 백엔드를 터널로 dev DB 에 붙인다.
팀원은 대부분 Windows 라서 이 부분만 Node 스크립트(`scripts/local-dev-db.mjs`, Windows·Mac 공용)로 되어 있다.

```
로컬 화면(localhost:3000) → 로컬 백엔드(localhost:4000) → 터널(127.0.0.1:15432) → dev RDS
```

```sh
# 최초 1회 (관리자, Mac): 로컬 개발 계정 pmcs_local 생성 → 로그인 정보는 시크릿 pmcs-dev/db-local
PMCS_ENV=dev scripts/aws-migrate/open-db-tunnel.sh        # 터미널 A
PMCS_ENV=dev scripts/aws-migrate/setup-local-role.sh      # 터미널 B, 끝나면 A 에서 Ctrl+C

# 매번 (누구나, Windows·Mac): 터미널 A 에서 연결을 열어 두고, 터미널 B 에서 평소처럼 yarn dev (이미 켜져 있으면 재시작)
aws login --profile pmcs-dev
yarn dev:aws-db        # 기본 8시간 뒤 자동 종료. 1~12시간은 TUNNEL_HOURS 로 지정
yarn dev
```

- 필요: AWS CLI v2(2.32 이상, `aws login` 지원), Session Manager plugin. Docker·jq·bash 는 필요 없다.
- 연결을 여는 동안만 `apps/backend/.env.development.local`·`apps/frontend/.env.development.local` 이 생긴다(둘 다 git 제외).
  `.env.development.local` 이 다른 env 파일보다 우선하므로 기존 `.env`·`.env.local` 은 고치지 않는다.
  Ctrl+C·창 닫기·연결 끊김 시 지워지고, `yarn dev` 를 재시작하면 원래 설정으로 돌아간다.
- `pmcs_local` 권한은 앱 계정과 같다(데이터 읽기·쓰기만, 테이블 구조 변경 불가). 로컬에서 `prisma migrate` 를 dev DB 에 돌려도 거부된다.
  동시 접속 20개·쿼리 60초 제한이 걸려 있다.
- **로컬에서 바꾼 데이터(설정·명령·Ack 등)는 dev 서버와 같은 DB 에 바로 반영된다.**
- 집계·알림 메일은 dev 서버가 이미 하므로 로컬 백엔드에서는 끈다.
- 로컬 백엔드는 인증서를 RDS 주소 기준으로 검증한다(`DATABASE_SSL_SERVERNAME`). 터널 주소가 127.0.0.1 이어도 검증이 유지된다.
- 비용: 터널 태스크가 떠 있는 동안 시간당 약 $0.02 (닫으면 즉시 종료).

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
