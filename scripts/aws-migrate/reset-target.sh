#!/usr/bin/env bash
# 대상 RDS 의 public 스키마를 비운다(테이블·함수·enum 타입). 컷오버 직전, 리허설 데이터를 지우고
# copy-data.sh 로 최종 복사를 하기 위한 단계다. 계정·권한(pmcs_migrator·pmcs_app, 기본 권한)은 그대로 둔다.
#
# - pmcs_migrator 로 실행하므로 그 계정이 소유한 객체만 지울 수 있다(다른 소유자의 객체가 있으면 멈춤).
# - 한 트랜잭션이라 중간에 실패하면 아무것도 지워지지 않는다.
# - 지우기 전 상태는 RDS 자동 백업(시점 복구)으로 되살릴 수 있다.
# - 운영(prod)에서는 API 서비스가 멈춰 있어야(desired 0) 실행된다. 도는 중이면 지운 뒤 빈 DB 에 쓰기 시작한다.
#
# 환경 변수
#   CONFIRM_RESET  지울 DB 인스턴스 이름(pmcs-<env>-db)을 그대로 적어야 실행된다.
#
# 필요: open-db-tunnel.sh 로 터널이 열려 있을 것, docker, jq, aws CLI
# 사용: PMCS_ENV=prod CONFIRM_RESET=pmcs-prod-db scripts/aws-migrate/reset-target.sh

source "$(dirname "$0")/lib.sh"
require docker jq
check_account

[ "${CONFIRM_RESET:-}" = "$DB_IDENTIFIER" ] ||
  die "대상 DB 를 비웁니다. 확인을 위해 CONFIRM_RESET=$DB_IDENTIFIER 를 붙여 실행하세요."

if [ "$LOCAL_REHEARSAL" = 1 ]; then
  : "${MIGRATOR_DB_PASSWORD:?LOCAL_REHEARSAL 에서는 MIGRATOR_DB_PASSWORD 가 필요합니다}"
  PGPASSWORD="$MIGRATOR_DB_PASSWORD"
else
  require aws
  desired=$(aws ecs describe-services --cluster "$NAME_PREFIX" --services "$NAME_PREFIX-api" \
    --query 'services[0].desiredCount' --output text)
  [ "$desired" = 0 ] || die "$NAME_PREFIX-api 서비스가 desired $desired 입니다. 먼저 0 으로 내리세요(README 컷오버 순서)."
  PGPASSWORD=$(url_password "$(aws secretsmanager get-secret-value --secret-id "$API_SECRET_ID" \
    --query SecretString --output text | jq -r '.MIGRATE_DATABASE_URL')")
fi
export PGPASSWORD
target=$(target_conninfo "$MIGRATOR_ROLE")

log "지우기 전 테이블별 행 수 (기록용)"
pg_docker psql "$target" -v ON_ERROR_STOP=1 -tA <<'SQL'
select format('select %L || ''|'' || count(*) from public.%I', table_name, table_name)
from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1
\gexec
SQL

log "public 스키마 비우기"
pg_docker psql "$target" -v ON_ERROR_STOP=1 --single-transaction -q <<'SQL'
SET client_min_messages = warning;
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', r.relname);
  END LOOP;
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm') LOOP
    EXECUTE format('DROP VIEW IF EXISTS public.%I CASCADE', r.relname);
  END LOOP;
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind = 'S' LOOP
    EXECUTE format('DROP SEQUENCE IF EXISTS public.%I CASCADE', r.relname);
  END LOOP;
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.sig);
  END LOOP;
  FOR r IN SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
           WHERE n.nspname = 'public' AND t.typtype IN ('e', 'd', 'c')
             AND NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid = t.typrelid AND c.relkind <> 'c') LOOP
    EXECUTE format('DROP TYPE IF EXISTS public.%I CASCADE', r.typname);
  END LOOP;
END $$;
SQL

left=$(pg_docker psql "$target" -tAc "select
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public')
  + (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public')
  + (select count(*) from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typtype in ('e','d','c'))")
[ "$left" = 0 ] || die "public 스키마에 객체가 ${left}개 남았습니다."
log "public 스키마가 비었습니다. 이제 copy-data.sh 로 복사하세요."
