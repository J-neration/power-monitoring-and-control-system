#!/usr/bin/env bash
# ECS dev 의 RDS 데이터를 dev 서버 1대형의 Postgres 로 옮기고 테이블별 행 수를 비교한다.
#   원본: RDS (다른 터미널에서 scripts/aws-migrate/open-db-tunnel.sh 로 연 터널, localhost:$TUNNEL_PORT)
#   대상: 서버 Postgres (이 스크립트가 SSM 포트 포워딩으로 localhost:$BOX_DB_PORT 에 연다)
# 둘 다 스키마 소유 계정 pmcs_migrator 로 접속한다. 대상 public 스키마가 비어 있어야 한다
# (서버는 DB 가 비어 있으면 앱을 띄우지 않으므로, 처음 배포 직후 상태가 그렇다).
#
# REPLACE=1: 서버 DB 에 이미 데이터가 있을 때(시험 뒤 전환 직전) 다시 복사한다. 서버의 API·프론트를 멈추고,
# 기존 테이블 삭제와 복원을 한 트랜잭션으로 한다(실패하면 기존 데이터가 그대로 남는다). 끝나면 deploy.sh 로 다시 띄운다.
#
# 필요: open-db-tunnel.sh 실행 중, init-env.sh·첫 배포 완료(Postgres 만 떠 있음), aws CLI, jq, docker, nc,
#       session-manager-plugin
# 사용: scripts/dev-box/copy-from-rds.sh
#       REPLACE=1 scripts/dev-box/copy-from-rds.sh && scripts/dev-box/deploy.sh
source "$(dirname "$0")/lib.sh"
require aws jq docker nc
check_account

nc -z 127.0.0.1 "$TUNNEL_PORT" 2>/dev/null ||
  die "RDS 터널(localhost:$TUNNEL_PORT)이 없습니다. 다른 터미널에서 PMCS_ENV=dev scripts/aws-migrate/open-db-tunnel.sh"

migrate_url=$(aws secretsmanager get-secret-value --secret-id "$API_SECRET_ID" --query SecretString --output text |
  jq -r '.MIGRATE_DATABASE_URL // empty')
[ "$(url_user "$migrate_url")" = "$MIGRATOR_ROLE" ] || die "$API_SECRET_ID 의 MIGRATE_DATABASE_URL 을 읽지 못했습니다."
SOURCE_PASSWORD=$(url_password "$migrate_url")
TARGET_PASSWORD=$(box_secret MIGRATOR_DB_PASSWORD)
unset migrate_url
[ -n "$TARGET_PASSWORD" ] || die "$BOX_ENV_PARAM 에 MIGRATOR_DB_PASSWORD 가 없습니다. init-env.sh 를 먼저 실행하세요."

trap close_box_db_port EXIT
log "서버 Postgres 포트 포워딩 (localhost:$BOX_DB_PORT)"
open_box_db_port

source_db=$(target_conninfo "$MIGRATOR_ROLE")
target_db=$(box_conninfo "$MIGRATOR_ROLE")
src() { PGPASSWORD="$SOURCE_PASSWORD" pg_docker "$@"; }
dst() { PGPASSWORD="$TARGET_PASSWORD" pg_docker "$@"; }
export SOURCE_PASSWORD TARGET_PASSWORD

existing=$(dst psql "$target_db" -tAc "select count(*) from information_schema.tables where table_schema = 'public'")
# 기존 테이블·시퀀스·enum·함수를 지우는 SQL. REPLACE=1 일 때만 복원 앞에 붙인다.
drop_sql=
if [ "$existing" != 0 ]; then
  [ "${REPLACE:-0}" = 1 ] ||
    die "서버 DB public 스키마에 이미 테이블이 ${existing}개 있습니다. 지우고 다시 복사하려면 REPLACE=1."
  log "서버 API·프론트 정지 (복사 중 쓰기 방지)"
  run_on_box "$BOX_COMPOSE stop api frontend" pmcs-stop-app >/dev/null
  drop_sql=$(cat <<'SQL'
SET client_min_messages = warning;
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', r.tablename);
  END LOOP;
  FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP SEQUENCE IF EXISTS public.%I CASCADE', r.sequencename);
  END LOOP;
  FOR r IN SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
           WHERE n.nspname = 'public' AND t.typtype = 'e' LOOP
    EXECUTE format('DROP TYPE IF EXISTS public.%I CASCADE', r.typname);
  END LOOP;
  -- 트리거 함수 (예: telemetry_set_received_at)
  FOR r IN SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS public.%I(%s) CASCADE', r.proname, r.args);
  END LOOP;
END
$$;
SQL
)
fi

log "덤프 → 복원 (RDS → 서버)${drop_sql:+, 기존 데이터 교체}"
# 서버의 public 스키마는 이미 있고 pmcs_migrator 소유다. 덤프의 CREATE SCHEMA 한 줄만 빼고 한 트랜잭션으로 적용한다.
{
  [ -z "$drop_sql" ] || printf '%s\n' "$drop_sql"
  src pg_dump "$source_db" --schema=public --no-owner --no-privileges | sed '/^CREATE SCHEMA public;$/d'
} | dst psql "$target_db" -v ON_ERROR_STOP=1 --single-transaction -q >/dev/null

log "통계 갱신"
dst psql "$target_db" -v ON_ERROR_STOP=1 -q -c "SET client_min_messages = error; ANALYZE;"

log "행 수 비교"
count_sql="select string_agg(format('select %L as t, count(*) as n from public.%I', tablename, tablename), ' union all ' order by tablename) from pg_tables where schemaname = 'public'"
union=$(src psql "$source_db" -tAc "$count_sql")
src psql "$source_db" -tA -F ' ' -c "$union order by 1" >"${TMPDIR:-/tmp}/pmcs-src-counts.$$"
dst psql "$target_db" -tA -F ' ' -c "$union order by 1" >"${TMPDIR:-/tmp}/pmcs-dst-counts.$$"
if diff "${TMPDIR:-/tmp}/pmcs-src-counts.$$" "${TMPDIR:-/tmp}/pmcs-dst-counts.$$" >/dev/null; then
  column -t "${TMPDIR:-/tmp}/pmcs-src-counts.$$" >&2
  rm -f "${TMPDIR:-/tmp}"/pmcs-{src,dst}-counts.$$
  log "모든 테이블 행 수가 같습니다. 다음: scripts/dev-box/deploy.sh (마이그레이션 확인 후 앱 시작)"
else
  diff "${TMPDIR:-/tmp}/pmcs-src-counts.$$" "${TMPDIR:-/tmp}/pmcs-dst-counts.$$" >&2 || true
  rm -f "${TMPDIR:-/tmp}"/pmcs-{src,dst}-counts.$$
  die "행 수가 다릅니다(위 diff: < RDS, > 서버). TelemetryRecord 등이 RDS 쪽만 몇 건 많으면 복사 중 HMI 가 보낸 행이라 정상이다."
fi
