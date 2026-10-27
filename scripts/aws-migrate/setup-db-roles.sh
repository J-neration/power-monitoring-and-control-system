#!/usr/bin/env bash
# RDS 에 앱 전용 DB 계정 두 개를 만들고, 접속 주소를 Secrets Manager(pmcs-<env>/api)에 넣는다.
#   pmcs_migrator  스키마 소유자. 마이그레이션(prisma migrate deploy)과 데이터 이전에만 쓴다.
#   pmcs_app       앱이 평소에 쓰는 계정. 데이터 조회·입력·수정·삭제만 가능하고 테이블 구조는 못 바꾼다.
# RDS 마스터 계정은 이 스크립트에서 계정을 만들 때만 쓰고, 앱에는 주지 않는다.
#
# 비밀번호는 여기서 무작위로 만들어 시크릿에 바로 넣으며, 화면이나 파일에 남기지 않는다.
# 다시 실행하면 두 계정의 비밀번호가 바뀐다(교체). 그 뒤에는 API 서비스를 재배포해야 한다.
#
# 시크릿에 쓰는 값
#   DATABASE_URL          pmcs_app, sslmode 없음 — 앱은 DATABASE_SSL_CA_FILE 로 인증서·호스트명을 검증한다.
#   MIGRATE_DATABASE_URL  pmcs_migrator, sslmode=require&sslcert=<CA>&sslaccept=strict
#                         (Prisma 마이그레이션 엔진의 검증 옵션. verify-full/sslrootcert 는 무시된다)
# 다른 키(RECEIVER_API_KEY 등)는 그대로 둔다.
#
# 필요: open-db-tunnel.sh 로 터널이 열려 있을 것, aws CLI, jq, docker, openssl
# 사용: PMCS_ENV=dev scripts/aws-migrate/setup-db-roles.sh

source "$(dirname "$0")/lib.sh"
require jq docker openssl
check_account

if [ "$LOCAL_REHEARSAL" = 1 ]; then
  # 로컬 리허설: 마스터 계정과 DB 주소를 환경 변수로 받고, 시크릿은 쓰지 않는다.
  : "${MASTER_USER:?LOCAL_REHEARSAL 에서는 MASTER_USER 가 필요합니다}"
  : "${MASTER_PASSWORD:?LOCAL_REHEARSAL 에서는 MASTER_PASSWORD 가 필요합니다}"
  db_host="${REHEARSAL_DB_HOST:-$TARGET_HOST}"
  export PGPASSWORD="$MASTER_PASSWORD"
else
  require aws
  db_host=$(db_address)
  master_json=$(aws secretsmanager get-secret-value --secret-id "$(master_secret_arn)" \
    --query SecretString --output text)
  MASTER_USER=$(jq -r .username <<<"$master_json")
  PGPASSWORD=$(jq -r .password <<<"$master_json")
  export PGPASSWORD
  unset master_json
fi

# 리허설에서 앱 동작까지 확인할 수 있도록 비밀번호를 지정할 수 있다. 실제 환경에서는 비워 둔다.
app_password="${APP_DB_PASSWORD:-$(openssl rand -hex 24)}"
migrator_password="${MIGRATOR_DB_PASSWORD:-$(openssl rand -hex 24)}"

log "DB 계정 생성·갱신: $MIGRATOR_ROLE, $APP_ROLE"
# SQL 을 표준 입력으로 넘겨 비밀번호가 명령줄에 나타나지 않게 한다.
pg_docker psql "$(target_conninfo "$MASTER_USER")" -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$MIGRATOR_ROLE') THEN
    CREATE ROLE $MIGRATOR_ROLE LOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$APP_ROLE') THEN
    CREATE ROLE $APP_ROLE LOGIN;
  END IF;
END
\$\$;
ALTER ROLE $MIGRATOR_ROLE WITH LOGIN PASSWORD '$migrator_password';
ALTER ROLE $APP_ROLE WITH LOGIN PASSWORD '$app_password';
-- 앱 계정이 세션 설정으로 권한을 넓히지 못하게 한다.
ALTER ROLE $APP_ROLE SET search_path = public;

-- 마스터가 기본 권한(ALTER DEFAULT PRIVILEGES FOR ROLE)을 설정하려면 그 역할의 구성원이어야 한다.
GRANT $MIGRATOR_ROLE TO CURRENT_USER;

REVOKE ALL ON DATABASE $DB_NAME FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE $DB_NAME TO $MIGRATOR_ROLE;
GRANT CONNECT ON DATABASE $DB_NAME TO $APP_ROLE;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO $MIGRATOR_ROLE;
GRANT USAGE ON SCHEMA public TO $APP_ROLE;

-- 마이그레이션이 앞으로 만드는 테이블에도 앱 권한이 자동으로 붙게 한다.
ALTER DEFAULT PRIVILEGES FOR ROLE $MIGRATOR_ROLE IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO $APP_ROLE;
ALTER DEFAULT PRIVILEGES FOR ROLE $MIGRATOR_ROLE IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO $APP_ROLE;

-- 이미 있는 테이블(재실행·데이터 이전 후)에도 같은 권한을 준다.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO $APP_ROLE;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO $APP_ROLE;
SQL

app_url="postgresql://$APP_ROLE:$app_password@$db_host:5432/$DB_NAME"
migrate_url="postgresql://$MIGRATOR_ROLE:$migrator_password@$db_host:5432/$DB_NAME?sslmode=require&sslcert=$IMAGE_RDS_MIGRATE_CA&sslaccept=strict"

if [ "$LOCAL_REHEARSAL" = 1 ]; then
  log "로컬 리허설: 시크릿은 쓰지 않았습니다."
  exit 0
fi

work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT
umask 077

current=$(aws secretsmanager get-secret-value --secret-id "$API_SECRET_ID" \
  --query SecretString --output text 2>/dev/null || echo '{}')
# 콘솔 일반 텍스트 칸의 기본값 {} 를 지우지 않고 붙여 넣으면 JSON 문서가 둘 이상 이어 붙는다. 하나로 합친다.
current=$(jq -sc 'add // {}' <<<"$current")
jq --arg db "$app_url" --arg migrate "$migrate_url" \
  '. + {DATABASE_URL: $db, MIGRATE_DATABASE_URL: $migrate}' <<<"$current" >"$work_dir/secret.json"
aws secretsmanager put-secret-value --secret-id "$API_SECRET_ID" \
  --secret-string "file://$work_dir/secret.json" >/dev/null

missing=$(jq -r '["RECEIVER_API_KEY", "CRITICAL_FAULT_WEBHOOK_URL"] - keys | join(", ")' "$work_dir/secret.json")
log "$API_SECRET_ID 에 DATABASE_URL, MIGRATE_DATABASE_URL 을 넣었습니다."
[ -z "$missing" ] || log "아직 비어 있는 키: $missing (콘솔에서 입력. 웹훅을 안 쓰면 빈 문자열)"
