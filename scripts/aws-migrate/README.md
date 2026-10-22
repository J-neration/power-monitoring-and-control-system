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
