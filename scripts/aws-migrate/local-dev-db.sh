#!/usr/bin/env bash
# 로컬 개발(yarn dev)을 AWS dev DB 의 실제 데이터로 돌린다.
#   로컬 화면(localhost:3000) → 로컬 백엔드(localhost:4000) → 터널(127.0.0.1:$TUNNEL_PORT) → dev RDS
#
# 하는 일
#   1. 시크릿 pmcs-dev/db-local 에서 로컬 개발 계정(pmcs_local) 로그인 정보를 읽는다.
#   2. 로컬 백엔드·프론트가 이 연결을 쓰도록 env 파일 두 개를 만든다 (둘 다 .gitignore 대상).
#        apps/backend/.env.development.local   DB 접속 정보, dev 서버가 하는 집계·메일은 로컬에서 끔
#        apps/frontend/.env.development.local  API 주소를 로컬 백엔드(localhost:4000)로
#      .env.development.local 은 .env·.env.local·.env.development 보다 우선하므로 기존 파일은 고치지 않는다.
#   3. open-db-tunnel.sh 로 터널을 연다. 이 창은 열어 두고, 다른 터미널에서 yarn dev 를 실행(이미 켜져 있으면 재시작).
#   4. Ctrl+C 로 닫으면 터널 태스크를 종료하고 두 env 파일을 지운다 → yarn dev 는 원래 설정(.env 등)으로 돌아간다.
#
# 주의: 로컬에서 바꾼 데이터(설정·명령·Ack 등)는 dev 서버와 같은 DB 에 바로 반영된다.
#
# 필요: setup-local-role.sh 실행 완료, aws CLI, jq, session-manager-plugin
# 사용: scripts/aws-migrate/local-dev-db.sh          (= yarn dev:aws-db)
#       TUNNEL_HOURS=4 scripts/aws-migrate/local-dev-db.sh   터널 최대 유지 시간 (기본 8, 최대 12)

TUNNEL_HOURS="${TUNNEL_HOURS:-8}"
source "$(dirname "$0")/lib.sh"
require aws jq session-manager-plugin
check_account
[ "$PMCS_ENV" = dev ] || die "로컬 개발 연결은 dev 에서만 씁니다 (PMCS_ENV=$PMCS_ENV)."

repo_root=$(cd "$(dirname "$0")/../.." && pwd)
backend_env="$repo_root/apps/backend/.env.development.local"
frontend_env="$repo_root/apps/frontend/.env.development.local"
ca_file="$repo_root/apps/backend/certs/rds-global-bundle.pem"
marker="# pmcs-local-dev-db"
made_by_us() { case "$(head -n 1 "$1")" in "$marker"*) return 0 ;; *) return 1 ;; esac; }

[ -f "$ca_file" ] || die "RDS CA 파일이 없습니다: $ca_file"
# 이 스크립트가 만든 파일(첫 줄 표시)만 덮어쓰고 지운다. 직접 만든 파일이면 멈춘다.
for f in "$backend_env" "$frontend_env"; do
  if [ -e "$f" ] && ! made_by_us "$f"; then
    die "$f 가 이미 있습니다. 직접 만든 파일이면 다른 이름으로 옮긴 뒤 다시 실행하세요."
  fi
done

local_json=$(aws secretsmanager get-secret-value --secret-id "$LOCAL_SECRET_ID" \
  --query SecretString --output text 2>/dev/null) ||
  die "시크릿 $LOCAL_SECRET_ID 를 읽지 못했습니다(setup-local-role.sh 를 먼저 실행)."
db_user=$(jq -r '.username // empty' <<<"$local_json")
db_password=$(jq -r '.password // empty' <<<"$local_json")
db_name=$(jq -r '.dbname // empty' <<<"$local_json")
unset local_json
[ -n "$db_user" ] && [ -n "$db_password" ] ||
  die "시크릿 $LOCAL_SECRET_ID 가 비어 있습니다(setup-local-role.sh 를 먼저 실행)."
db_host=$(db_address)

remove_env_files() {
  local f
  for f in "$backend_env" "$frontend_env"; do
    if [ -e "$f" ] && made_by_us "$f"; then rm -f "$f"; fi
  done
  log "로컬 env 파일을 지웠습니다. yarn dev 를 재시작하면 원래 설정으로 돌아갑니다."
}
trap remove_env_files EXIT
trap 'exit 130' INT TERM

umask 077
cat >"$backend_env" <<EOF
$marker — scripts/aws-migrate/local-dev-db.sh 가 만든 파일. 터널을 닫으면 지워진다. 직접 고치지 말 것.
DATABASE_URL=postgresql://$db_user:$db_password@127.0.0.1:$TUNNEL_PORT/$db_name
DATABASE_SSL_CA_FILE=$ca_file
DATABASE_SSL_SERVERNAME=$db_host
DATABASE_POOL_MAX=5
# 집계·알림 메일은 AWS dev 서버가 이미 한다. 로컬에서 같이 돌리지 않는다.
AGGREGATION_ENABLED=false
RAW_PURGE_ENABLED=false
SUMMARY_PURGE_ENABLED=false
SMTP_HOST=
EOF
cat >"$frontend_env" <<EOF
$marker — scripts/aws-migrate/local-dev-db.sh 가 만든 파일. 터널을 닫으면 지워진다. 직접 고치지 말 것.
NEXT_PUBLIC_API_BASE=http://localhost:4000
COMMAND_API_BASE=http://localhost:4000
EOF
unset db_password

log "로컬 env 파일을 만들었습니다. 터널이 열리면 다른 터미널에서 yarn dev 를 실행(이미 켜져 있으면 재시작)하세요."
TUNNEL_HOURS="$TUNNEL_HOURS" "$(dirname "$0")/open-db-tunnel.sh"
