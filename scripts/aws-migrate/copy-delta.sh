#!/usr/bin/env bash
# 컷오버 공백 메우기: copy-data.sh 로 통째로 복사한 뒤 Railway 중계로 바꾸기 전까지 Neon 에 들어온 행을 RDS 로 옮긴다.
#
# 순서: SINCE 기록 → copy-data.sh(Railway 는 계속 Neon 에 씀) → Railway 를 중계로 전환 → 이 스크립트.
# HMI 는 실패한 전송을 다시 보내지 않으므로, Railway 를 멈추고 복사하는 대신 이렇게 해서 데이터 공백을 없앤다.
#
# 테이블마다 SINCE 이후 바뀐 원본 행을 임시 테이블에 받아 기본 키로 합친다.
#   newer  : 없으면 넣고, 있으면 원본이 더 최신일 때만 덮어쓴다. 중계 전환 뒤 AWS 가 쓴 더 새 값은 지키기 위해서다.
#   insert : 없으면 넣고, 있으면 그대로 둔다(추가만 되는 기록).
# 기본 키는 다른데 다른 고유 키(예: ModuleFaultState 의 장비+고장코드)가 겹치면, 중계 전환 뒤 AWS 가 만든 행이
# 더 새것이므로 원본 행을 넣지 않고 kept 로 센다.
# 집계 테이블(Aggregation*, Telemetry*Summary)은 옮기지 않는다. AWS API 가 다음 정각+5분 집계 때 자기 데이터로
# 다시 계산한다. 그래서 컷오버는 매시 :10~:55 사이에 하고, 이 스크립트를 다음 :05 전에 끝낸다.
# 여러 번 실행해도 결과가 같다. 두 번째 실행에서 넣음·덮어씀이 0 이면 다 옮겨진 것이다.
#
# 환경 변수
#   SOURCE_DATABASE_URL  Neon 연결 문자열 (copy-data.sh 와 같음)
#   SOURCE_LABEL         copy-data.sh 와 같음. CONFIRM_PRODUCTION 도 같다.
#   SINCE                UTC 'YYYY-MM-DD HH:MM:SS'. copy-data.sh 시작 전에 기록한 시각(몇 분 여유를 두고)
#
# 필요: open-db-tunnel.sh 로 터널이 열려 있을 것, docker, jq, aws CLI
# 사용: SINCE='2026-10-28 05:10:00' SOURCE_LABEL=neon-production CONFIRM_PRODUCTION=yes SOURCE_DATABASE_URL=... \
#       PMCS_ENV=prod scripts/aws-migrate/copy-delta.sh

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
[[ "${SINCE:-}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}\ [0-9]{2}:[0-9]{2}:[0-9]{2}$ ]] ||
  die "SINCE 를 UTC 'YYYY-MM-DD HH:MM:SS' 형식으로 주세요."

if [ "$LOCAL_REHEARSAL" = 1 ]; then
  PGPASSWORD="${MIGRATOR_DB_PASSWORD:?MIGRATOR_DB_PASSWORD 가 필요합니다}"
else
  require aws
  PGPASSWORD=$(url_password "$(aws secretsmanager get-secret-value --secret-id "$API_SECRET_ID" \
    --query SecretString --output text | jq -r '.MIGRATE_DATABASE_URL')")
fi
export PGPASSWORD
target=$(target_conninfo "$MIGRATOR_ROLE")

# 테이블|모드|바뀐 시각 식 — 부모 테이블이 먼저 오게(외래 키) 적는다.
TABLES='
Site|newer|"updatedAt"
ClientOption|newer|"updatedAt"
RoleOption|newer|"updatedAt"
User|newer|"updatedAt"
Installation|newer|"updatedAt"
Device|newer|"updatedAt"
InstallationDeviceSettings|newer|"updatedAt"
ModuleFaultState|newer|"updatedAt"
DeviceCommand|newer|greatest("createdAt", "sentAt", "ackedAt")
TelemetryRecord|insert|"receivedAt"
FaultEvent|insert|"occurredAt"
'
SKIPPED='AggregationLog AggregationState TelemetryDailySummary TelemetryHourlySummary _prisma_migrations'

net=()
[ -n "${PG_DOCKER_NETWORK:-}" ] && net=(--network "$PG_DOCKER_NETWORK")
source_psql() {
  docker run --rm -i ${net[@]+"${net[@]}"} -e SOURCE_DATABASE_URL -e PGOPTIONS="$SOURCE_PGOPTIONS" "$PG_IMAGE" \
    sh -c 'psql "$SOURCE_DATABASE_URL" -v ON_ERROR_STOP=1 -tA "$@"' sh "$@"
}
target_psql() { pg_docker psql "$target" -v ON_ERROR_STOP=1 -tAq "$@"; }

columns_sql() {
  printf "select string_agg(quote_ident(column_name), ',' order by ordinal_position)
    from information_schema.columns where table_schema = 'public' and table_name = '%s'" "$1"
}

# 원본에 이 목록에 없는 테이블이 생겼으면(스키마가 바뀜) 멈춘다. 빠뜨린 채 진행하지 않기 위해서다.
known=$(printf '%s\n' "$TABLES" | cut -d'|' -f1 | grep -v '^$'; printf '%s\n' $SKIPPED)
while IFS= read -r t; do
  grep -qxF "$t" <<<"$known" || die "목록에 없는 테이블이 원본에 있습니다: $t (이 스크립트의 TABLES 에 추가 필요)"
done < <(echo "select table_name from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE' order by 1" | source_psql)

[ "$(echo "select count(*) from _prisma_migrations" | source_psql)" = \
  "$(echo "select count(*) from _prisma_migrations" | target_psql)" ] ||
  die "원본과 대상의 마이그레이션 수가 다릅니다. 스키마가 같아야 합니다."

skipped_changes=$(echo "select count(*) from \"AggregationLog\" where \"createdAt\" >= '$SINCE'" | source_psql)
[ "$skipped_changes" = 0 ] ||
  log "주의: SINCE 이후 원본에서 집계가 돌았습니다(AggregationLog $skipped_changes 건). 집계는 옮기지 않으며 AWS 가 다음 집계 때 다시 계산합니다."

log "SINCE=$SINCE (UTC) 이후 Neon 에서 바뀐 행을 RDS 로 합칩니다."
printf '%-28s %8s %8s %8s %8s\n' "table" "source" "insert" "update" "kept" >&2
failed=0
# 목록은 fd 3 으로 읽는다. 루프 안의 docker run -i 가 표준 입력을 가져가지 않게.
while IFS='|' read -r table mode changed <&3; do
  [ -n "$table" ] || continue
  src_cols=$(columns_sql "$table" | source_psql)
  dst_cols=$(columns_sql "$table" | target_psql)
  [ -n "$dst_cols" ] && [ "$src_cols" = "$dst_cols" ] || die "$table 의 열 구성이 원본과 대상에서 다릅니다."
  pk=$(target_psql -c "select string_agg(quote_ident(a.attname), ',' order by k.ord)
    from pg_index i cross join lateral unnest(i.indkey) with ordinality k(attnum, ord)
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
    where i.indrelid = 'public.\"$table\"'::regclass and i.indisprimary")
  [ -n "$pk" ] || die "$table 에 기본 키가 없습니다."
  join_on=$(awk -F, '{ for (i = 1; i <= NF; i++) printf "%st.%s = d.%s", (i > 1 ? " and " : ""), $i, $i }' <<<"$pk")
  if [ "$mode" = newer ]; then
    d_changed=$(sed -E 's/"([A-Za-z]+)"/d."\1"/g' <<<"$changed")
    t_changed=$(sed -E 's/"([A-Za-z]+)"/t."\1"/g' <<<"$changed")
    set_list=$(tr ',' '\n' <<<"$dst_cols" | sed 's/.*/& = d.&/' | paste -sd, -)
    update_count="with u as (update public.\"$table\" t set $set_list from d
      where $join_on and $t_changed < $d_changed returning 1) select count(*) from u"
  else
    update_count="select 0"
  fi

  # 원본에서 바뀐 행을 COPY 로 받아 대상의 임시 테이블에 넣고, 한 트랜잭션에서 넣기·덮어쓰기를 한다.
  if ! result=$(echo "copy (select $src_cols from public.\"$table\" where $changed >= '$SINCE') to stdout" |
    source_psql |
    target_psql --single-transaction \
      -c "create temp table d (like public.\"$table\") on commit drop" \
      -c "\\copy d from pstdin" \
      -c "$update_count" \
      -c "with i as (insert into public.\"$table\" ($dst_cols) select $dst_cols from d
            where not exists (select 1 from public.\"$table\" t where $join_on) on conflict do nothing returning 1)
            select count(*) from i" \
      -c "select count(*) from d" 2>&1); then
    log "$table 실패: $(tail -1 <<<"$result")"
    failed=1
    continue
  fi
  updated=$(sed -n 1p <<<"$result"); inserted=$(sed -n 2p <<<"$result"); staged=$(sed -n 3p <<<"$result")
  printf '%-28s %8s %8s %8s %8s\n' "$table" "$staged" "$inserted" "$updated" "$((staged - inserted - updated))" >&2
done 3<<<"$TABLES"

[ "$failed" = 0 ] || die "실패한 테이블이 있습니다. 위 메시지를 확인하고 다시 실행하세요(다시 실행해도 안전)."
log "끝. kept = 대상이 이미 같거나 더 최신이라 그대로 둔 행. 한 번 더 실행해 insert·update 가 0 인지 확인하세요."
