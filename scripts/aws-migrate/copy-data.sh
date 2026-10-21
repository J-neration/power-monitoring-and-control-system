#!/usr/bin/env bash
# Neon → RDS 로 public 스키마(테이블·데이터·_prisma_migrations)를 통째로 옮기고 행 수를 비교한다.
#
# - 덤프는 파일로 남기지 않고 pg_dump | psql 로 바로 흘려보낸다 (이 Mac 디스크에 데이터가 남지 않음).
# - 복원은 pmcs_migrator 로 하므로 모든 객체의 소유자가 pmcs_migrator 가 된다. 끝나면 앱 계정 권한을 다시 준다.
# - 대상 DB 에 이미 테이블이 있으면 멈춘다. 한 트랜잭션으로 복원하므로 실패하면 아무것도 남지 않는다.
# - _prisma_migrations 도 함께 옮겨지므로, 이후 prisma migrate deploy 는 "적용할 것 없음"이 정상이다.
#
# 환경 변수
#   SOURCE_DATABASE_URL  Neon 연결 문자열 (읽기 전용 계정 권장). 채팅이나 파일에 붙여 넣지 말고 터미널에서 export.
#   SOURCE_LABEL         neon-dev | neon-production. PMCS_ENV=dev 에는 neon-dev 만 허용한다(운영 데이터를 dev 로 복사 금지).
#   CONFIRM_PRODUCTION   PMCS_ENV=prod 일 때 yes 여야 실행된다(컷오버 당일, 승인 후).
#
# 필요: open-db-tunnel.sh 로 터널이 열려 있을 것, setup-db-roles.sh 실행 완료, docker, jq, aws CLI
# 사용: SOURCE_LABEL=neon-dev SOURCE_DATABASE_URL=... PMCS_ENV=dev scripts/aws-migrate/copy-data.sh

source "$(dirname "$0")/lib.sh"
require docker jq
check_account

: "${SOURCE_DATABASE_URL:?SOURCE_DATABASE_URL 에 Neon 연결 문자열을 넣어 주세요}"
export SOURCE_DATABASE_URL
SOURCE_LABEL="${SOURCE_LABEL:-}"

case "$PMCS_ENV:$SOURCE_LABEL" in
  dev:neon-dev) ;;
  dev:*) die "dev 환경에는 SOURCE_LABEL=neon-dev 만 허용합니다(운영 데이터를 dev 로 복사하지 않음)." ;;
  prod:neon-production)
    [ "${CONFIRM_PRODUCTION:-}" = yes ] || die "운영 복사입니다. 승인 후 CONFIRM_PRODUCTION=yes 를 붙여 실행하세요." ;;
  prod:*) die "prod 환경에는 SOURCE_LABEL=neon-production 이어야 합니다." ;;
esac

# pmcs_migrator 비밀번호를 시크릿의 MIGRATE_DATABASE_URL 에서 꺼낸다.
if [ "$LOCAL_REHEARSAL" = 1 ]; then
  : "${MIGRATOR_DB_PASSWORD:?LOCAL_REHEARSAL 에서는 MIGRATOR_DB_PASSWORD 가 필요합니다}"
  PGPASSWORD="$MIGRATOR_DB_PASSWORD"
else
  require aws
  migrate_url=$(aws secretsmanager get-secret-value --secret-id "$API_SECRET_ID" --query SecretString --output text |
    jq -r '.MIGRATE_DATABASE_URL // empty')
  [ -n "$migrate_url" ] || die "$API_SECRET_ID 에 MIGRATE_DATABASE_URL 이 없습니다. setup-db-roles.sh 를 먼저 실행하세요."
  [ "$(url_user "$migrate_url")" = "$MIGRATOR_ROLE" ] || die "MIGRATE_DATABASE_URL 의 계정이 $MIGRATOR_ROLE 이 아닙니다."
  PGPASSWORD=$(url_password "$migrate_url")
  unset migrate_url
fi
export PGPASSWORD
target=$(target_conninfo "$MIGRATOR_ROLE")

existing=$(pg_docker psql "$target" -tAc \
  "select count(*) from information_schema.tables where table_schema = 'public'")
[ "$existing" = 0 ] || die "대상 DB public 스키마에 이미 테이블이 ${existing}개 있습니다. 빈 DB 에만 복원합니다."

log "덤프 → 복원 시작 ($SOURCE_LABEL → $PMCS_ENV RDS)"
# 원본 주소는 컨테이너 환경 변수로만 넘긴다(명령줄·프로세스 목록에 비밀번호가 보이지 않게).
net=()
[ -n "${PG_DOCKER_NETWORK:-}" ] && net=(--network "$PG_DOCKER_NETWORK")
# public 스키마만 덤프하면 "CREATE SCHEMA public;" 이 들어가는데, RDS 에는 이미 있고 만들 권한도 없다.
# 그래서 SQL 텍스트 형식으로 덤프하고 그 한 줄만 뺀 뒤, 한 트랜잭션으로 적용한다.
docker run --rm "${net[@]}" -e SOURCE_DATABASE_URL "$PG_IMAGE" \
  sh -c 'pg_dump "$SOURCE_DATABASE_URL" --schema=public --no-owner --no-privileges' |
  sed '/^CREATE SCHEMA public;$/d' |
  pg_docker psql "$target" -v ON_ERROR_STOP=1 --single-transaction -q >/dev/null

log "앱 계정 권한 부여, 통계 갱신"
pg_docker psql "$target" -v ON_ERROR_STOP=1 -q <<SQL
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO $APP_ROLE;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO $APP_ROLE;
-- 자기 테이블만 분석한다. 시스템 테이블은 권한이 없어 건너뛰는 경고만 나오므로 숨긴다.
SET client_min_messages = error;
ANALYZE;
SQL

"$(dirname "$0")/verify-row-counts.sh"
