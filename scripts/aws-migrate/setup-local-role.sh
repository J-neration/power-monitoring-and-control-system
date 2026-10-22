#!/usr/bin/env bash
# 로컬 개발(yarn dev)용 DB 계정(pmcs_local)을 만들고, 로그인 정보를 시크릿 pmcs-<env>/db-local 에 넣는다.
# 앱 계정(pmcs_app·pmcs_migrator)과 분리해 두어, 문제가 생기면 이 계정만 끄거나 비밀번호를 바꿀 수 있다.
#
# - 권한은 pmcs_app 과 같다: 데이터 조회·입력·수정·삭제만 가능하고 테이블 구조는 못 바꾼다
#   (로컬에서 prisma migrate 를 dev DB 에 실수로 돌려도 거부된다). 앞으로 생기는 테이블에도 자동으로 붙는다.
# - 동시 접속 20개, 쿼리 60초 제한으로 로컬 실수가 dev 서버를 막지 않게 한다.
# - 비밀번호는 여기서 무작위로 만들어 시크릿에 바로 넣고, 화면·파일에 남기지 않는다.
#   다시 실행하면 비밀번호가 바뀐다(교체). 이미 켜 둔 로컬 연결은 yarn dev:aws-db 를 다시 실행하면 된다.
# - dev 전용이다. 운영(prod) DB 에는 로컬 계정을 만들지 않는다.
#
# 필요: open-db-tunnel.sh 로 터널이 열려 있을 것, setup-db-roles.sh 실행 완료(pmcs_migrator 존재),
#       app 루트 적용(시크릿 pmcs-<env>/db-local 존재), aws CLI, jq, docker, openssl
# 사용: PMCS_ENV=dev scripts/aws-migrate/setup-local-role.sh

source "$(dirname "$0")/lib.sh"
require aws jq docker openssl
check_account
[ "$PMCS_ENV" = dev ] || die "로컬 개발 계정은 dev 에만 만듭니다 (PMCS_ENV=$PMCS_ENV)."

aws secretsmanager describe-secret --secret-id "$LOCAL_SECRET_ID" >/dev/null 2>&1 ||
  die "시크릿 $LOCAL_SECRET_ID 이 없습니다(app 루트를 먼저 적용)."

master_json=$(aws secretsmanager get-secret-value --secret-id "$(master_secret_arn)" \
  --query SecretString --output text)
MASTER_USER=$(jq -r .username <<<"$master_json")
PGPASSWORD=$(jq -r .password <<<"$master_json")
export PGPASSWORD
unset master_json

local_password=$(openssl rand -hex 24)

log "로컬 개발 DB 계정 생성·갱신: $LOCAL_ROLE"
# SQL 을 표준 입력으로 넘겨 비밀번호가 명령줄에 나타나지 않게 한다.
pg_docker psql "$(target_conninfo "$MASTER_USER")" -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$MIGRATOR_ROLE') THEN
    RAISE EXCEPTION '$MIGRATOR_ROLE 이 없습니다. setup-db-roles.sh 를 먼저 실행하세요.';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$LOCAL_ROLE') THEN
    CREATE ROLE $LOCAL_ROLE LOGIN;
  END IF;
END
\$\$;
-- RDS 마스터는 슈퍼유저가 아니라 SUPERUSER 속성을 바꿀 수 없다. CREATE ROLE 기본값이 NOSUPERUSER·NOCREATEDB·NOCREATEROLE 이다.
ALTER ROLE $LOCAL_ROLE WITH LOGIN CONNECTION LIMIT 20 PASSWORD '$local_password';
ALTER ROLE $LOCAL_ROLE SET search_path = public;
ALTER ROLE $LOCAL_ROLE SET statement_timeout = '60s';

GRANT CONNECT ON DATABASE $DB_NAME TO $LOCAL_ROLE;
GRANT USAGE ON SCHEMA public TO $LOCAL_ROLE;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO $LOCAL_ROLE;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO $LOCAL_ROLE;
-- 마이그레이션(pmcs_migrator 소유)이 앞으로 만드는 테이블에도 같은 권한이 붙게 한다.
ALTER DEFAULT PRIVILEGES FOR ROLE $MIGRATOR_ROLE IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO $LOCAL_ROLE;
ALTER DEFAULT PRIVILEGES FOR ROLE $MIGRATOR_ROLE IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO $LOCAL_ROLE;
SQL

work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT
umask 077
jq -n --arg u "$LOCAL_ROLE" --arg p "$local_password" --arg d "$DB_NAME" \
  '{username: $u, password: $p, dbname: $d,
    note: "로컬 백엔드 전용. yarn dev:aws-db (scripts/local-dev-db.mjs) 가 읽어 쓴다."}' >"$work_dir/secret.json"
aws secretsmanager put-secret-value --secret-id "$LOCAL_SECRET_ID" \
  --secret-string "file://$work_dir/secret.json" >/dev/null
unset local_password

log "$LOCAL_SECRET_ID 에 로컬 개발 계정 정보를 넣었습니다."
