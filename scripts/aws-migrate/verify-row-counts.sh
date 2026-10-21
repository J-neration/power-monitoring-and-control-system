#!/usr/bin/env bash
# 원본(Neon)과 대상(RDS)의 public 테이블별 행 수를 비교한다. 하나라도 다르면 종료 코드 1.
# copy-data.sh 가 마지막에 자동으로 부르며, 따로 실행해도 된다(같은 환경 변수 필요).
#
# 원본이 계속 쓰이는 중이면(예: 컷오버 중 Railway 가 Neon 에 쓰는 동안) 최근 텔레메트리 테이블은
# 원본이 더 많을 수 있다. 그때는 표를 보고 차이가 그 시간 동안 들어온 행인지 확인한다.

source "$(dirname "$0")/lib.sh"
require docker jq
check_account

: "${SOURCE_DATABASE_URL:?SOURCE_DATABASE_URL 이 필요합니다}"
export SOURCE_DATABASE_URL

if [ -z "${PGPASSWORD:-}" ]; then
  if [ "$LOCAL_REHEARSAL" = 1 ]; then
    PGPASSWORD="${MIGRATOR_DB_PASSWORD:?MIGRATOR_DB_PASSWORD 가 필요합니다}"
  else
    require aws
    PGPASSWORD=$(url_password "$(aws secretsmanager get-secret-value --secret-id "$API_SECRET_ID" \
      --query SecretString --output text | jq -r '.MIGRATE_DATABASE_URL')")
  fi
  export PGPASSWORD
fi
target=$(target_conninfo "$MIGRATOR_ROLE")

net=()
[ -n "${PG_DOCKER_NETWORK:-}" ] && net=(--network "$PG_DOCKER_NETWORK")
source_psql() { docker run --rm -i "${net[@]}" -e SOURCE_DATABASE_URL "$PG_IMAGE" sh -c 'psql "$SOURCE_DATABASE_URL" -v ON_ERROR_STOP=1 -tA'; }

tables=$(echo "select table_name from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE' order by 1;" | source_psql)
[ -n "$tables" ] || die "원본에서 테이블을 찾지 못했습니다."

count_sql=$(while IFS= read -r t; do
  printf "select '%s' as t, count(*) from public.\"%s\" union all\n" "$t" "$t"
done <<<"$tables" | sed '$ s/ union all$/;/')

source_counts=$(echo "$count_sql" | source_psql)
target_counts=$(echo "$count_sql" | pg_docker psql "$target" -v ON_ERROR_STOP=1 -tA)

mismatch=0
printf '%-36s %12s %12s\n' "table" "source" "target"
while IFS='|' read -r t s; do
  d=$(awk -F'|' -v t="$t" '$1 == t { print $2 }' <<<"$target_counts")
  mark=""
  [ "$s" = "${d:-missing}" ] || { mark="  ← 불일치"; mismatch=1; }
  printf '%-36s %12s %12s%s\n' "$t" "$s" "${d:-missing}" "$mark"
done <<<"$source_counts"

if [ "$mismatch" = 0 ]; then
  log "모든 테이블의 행 수가 같습니다."
else
  die "행 수가 다른 테이블이 있습니다."
fi
