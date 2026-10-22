# scripts/dev-box 공용 설정·함수. 각 스크립트가 source 하며, 직접 실행하지 않는다.
# dev "서버 1대형"(infra/terraform/envs/dev/box) 전용이다. 계정 확인·pg_docker 등은 aws-migrate/lib.sh 를 쓴다.
#
# 환경 변수
#   BOX_DB_PORT   SSM 포트 포워딩으로 서버 Postgres 를 여는 로컬 포트 (기본 25432)

PMCS_ENV=dev
# shellcheck source=../aws-migrate/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/../aws-migrate/lib.sh"

BOX_NAME="$NAME_PREFIX-box"
BOX_ENV_PARAM="/$NAME_PREFIX/box/env"
BOX_DB_PORT="${BOX_DB_PORT:-25432}"

box_instance_id() {
  local id
  id=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=$BOX_NAME" "Name=instance-state-name,Values=running" \
    --query 'Reservations[0].Instances[0].InstanceId' --output text)
  [ -n "$id" ] && [ "$id" != None ] || die "실행 중인 $BOX_NAME 서버를 찾지 못했습니다(box 루트가 적용됐는지 확인)."
  echo "$id"
}

# 서버 SSM 시크릿(dotenv, KEY='value')에서 값 하나를 꺼낸다.
box_secret() {
  aws ssm get-parameter --name "$BOX_ENV_PARAM" --with-decryption --query Parameter.Value --output text |
    sed -nE "s/^$1='(.*)'\$/\\1/p"
}

# 서버의 Postgres(127.0.0.1:5432)를 이 Mac 의 BOX_DB_PORT 로 연다. 끝낼 때 close_box_db_port.
# aws ssm start-session 은 session-manager-plugin 을 자식으로 띄우므로, 끌 때 자식까지 끈다.
BOX_SESSION_PID=
open_box_db_port() {
  require session-manager-plugin
  local id
  id=$(box_instance_id)
  aws ssm start-session --target "$id" --document-name AWS-StartPortForwardingSession \
    --parameters "{\"portNumber\":[\"5432\"],\"localPortNumber\":[\"$BOX_DB_PORT\"]}" >/dev/null &
  BOX_SESSION_PID=$!
  local _
  for _ in $(seq 1 30); do
    nc -z 127.0.0.1 "$BOX_DB_PORT" 2>/dev/null && return 0
    kill -0 "$BOX_SESSION_PID" 2>/dev/null || die "SSM 포트 포워딩이 끝났습니다."
    sleep 1
  done
  die "SSM 포트 포워딩이 30초 안에 열리지 않았습니다."
}

close_box_db_port() {
  [ -n "$BOX_SESSION_PID" ] || return 0
  pkill -P "$BOX_SESSION_PID" 2>/dev/null || true
  kill "$BOX_SESSION_PID" 2>/dev/null || true
  BOX_SESSION_PID=
}

# 포워딩된 서버 Postgres 에 붙는 libpq 연결 문자열 (비밀번호 제외). 구간은 SSM 세션이 암호화한다.
box_conninfo() {
  printf 'host=host.docker.internal port=%s dbname=%s user=%s sslmode=disable' "$BOX_DB_PORT" "$DB_NAME" "$1"
}
