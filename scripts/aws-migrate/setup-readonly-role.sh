#!/usr/bin/env bash
# 사람이 데이터를 둘러볼 때 쓰는 조회 전용 DB 계정(pmcs_readonly)을 만들고, 로그인 정보를 시크릿
# pmcs-<env>/db-readonly 에 넣는다. 앱 계정(pmcs_app·pmcs_migrator)의 비밀번호는 건드리지 않는다.
#
# - 권한은 public 스키마 테이블 SELECT 뿐이다. 마이그레이션이 나중에 만드는 테이블에도 자동으로 붙는다.
# - 세션 기본값을 읽기 전용 트랜잭션(default_transaction_read_only)으로 둬, 권한 실수가 있어도 쓰기가 막힌다.
# - 비밀번호는 여기서 무작위로 만들어 시크릿에 바로 넣고, 화면·파일에 남기지 않는다.
#   다시 실행하면 비밀번호가 바뀐다(교체).
# - 접속은 open-db-tunnel.sh 로 연 터널(localhost:$TUNNEL_PORT)로만 한다.
#
# 필요: open-db-tunnel.sh 로 터널이 열려 있을 것, setup-db-roles.sh 실행 완료(pmcs_migrator 존재),
#       app 루트 적용(시크릿 pmcs-<env>/db-readonly 존재), aws CLI, jq, docker, openssl
# 사용: PMCS_ENV=dev scripts/aws-migrate/setup-readonly-role.sh

source "$(dirname "$0")/lib.sh"
require aws jq docker openssl
check_account

aws secretsmanager describe-secret --secret-id "$READONLY_SECRET_ID" >/dev/null 2>&1 ||
  die "시크릿 $READONLY_SECRET_ID 이 없습니다(app 루트를 먼저 적용)."

master_json=$(aws secretsmanager get-secret-value --secret-id "$(master_secret_arn)" \
  --query SecretString --output text)
MASTER_USER=$(jq -r .username <<<"$master_json")
PGPASSWORD=$(jq -r .password <<<"$master_json")
export PGPASSWORD
unset master_json

readonly_password=$(openssl rand -hex 24)

log "조회 전용 DB 계정 생성·갱신: $READONLY_ROLE"
# SQL 을 표준 입력으로 넘겨 비밀번호가 명령줄에 나타나지 않게 한다.
pg_docker psql "$(target_conninfo "$MASTER_USER")" -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$MIGRATOR_ROLE') THEN
    RAISE EXCEPTION '$MIGRATOR_ROLE 이 없습니다. setup-db-roles.sh 를 먼저 실행하세요.';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$READONLY_ROLE') THEN
    CREATE ROLE $READONLY_ROLE LOGIN;
  END IF;
END
\$\$;
-- RDS 마스터는 슈퍼유저가 아니라 SUPERUSER 속성을 바꿀 수 없다. CREATE ROLE 기본값이 NOSUPERUSER·NOCREATEDB·NOCREATEROLE 이다.
ALTER ROLE $READONLY_ROLE WITH LOGIN PASSWORD '$readonly_password';
ALTER ROLE $READONLY_ROLE SET default_transaction_read_only = on;
ALTER ROLE $READONLY_ROLE SET search_path = public;

GRANT CONNECT ON DATABASE $DB_NAME TO $READONLY_ROLE;
GRANT USAGE ON SCHEMA public TO $READONLY_ROLE;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO $READONLY_ROLE;
-- 마이그레이션(pmcs_migrator 소유)이 앞으로 만드는 테이블에도 조회 권한이 붙게 한다.
ALTER DEFAULT PRIVILEGES FOR ROLE $MIGRATOR_ROLE IN SCHEMA public
  GRANT SELECT ON TABLES TO $READONLY_ROLE;
SQL

work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT
umask 077
jq -n --arg u "$READONLY_ROLE" --arg p "$readonly_password" --arg d "$DB_NAME" --arg port "$TUNNEL_PORT" \
  '{username: $u, password: $p, dbname: $d, host: "127.0.0.1", port: $port,
    note: "open-db-tunnel.sh 로 터널을 연 뒤 접속. SSL mode = require"}' >"$work_dir/secret.json"
aws secretsmanager put-secret-value --secret-id "$READONLY_SECRET_ID" \
  --secret-string "file://$work_dir/secret.json" >/dev/null
unset readonly_password

log "$READONLY_SECRET_ID 에 조회 전용 계정 정보를 넣었습니다."
