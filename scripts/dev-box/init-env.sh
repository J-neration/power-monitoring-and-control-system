#!/usr/bin/env bash
# dev 서버 1대형의 비밀 값을 SSM 파라미터(/pmcs-dev/box/env, SecureString)에 처음 한 번 채운다.
# 서버를 처음 만들 때만 쓴다. 지금 서버의 값은 이미 들어 있고, 이 스크립트는 덮어쓰지 않는다.
#   - DB 계정 비밀번호 5개(postgres·pmcs_migrator·pmcs_app·pmcs_readonly·pmcs_local)와 JWT_SECRET 은 새로 만든다.
#   - RECEIVER_API_KEY 는 HMI 에 설정된 값과 같아야 하므로 환경 변수로 받는다(없으면 새로 만들고, HMI 를 바꿔야 한다).
#   - 웹훅·SMTP 는 비워 둔다(관리자 알림 메일을 보내지 않음). 필요하면 콘솔에서 파라미터를 고친 뒤 deploy.sh.
# 값은 화면·파일에 남기지 않는다(임시 파일은 끝나면 지움). 이미 채워져 있으면 멈춘다
# (DB 비밀번호는 Postgres 를 처음 만들 때만 적용되므로, 나중에 바꾸면 서버와 어긋난다).
#
# 필요: aws CLI, openssl
# 사용: RECEIVER_API_KEY=<HMI 키> scripts/dev-box/init-env.sh   (키를 명령줄에 직접 치지 말고 read -s 등으로 넣을 것)
source "$(dirname "$0")/lib.sh"
require aws openssl
check_account

current=$(aws ssm get-parameter --name "$BOX_ENV_PARAM" --with-decryption --query Parameter.Value --output text)
[ "$current" = UNSET ] || die "$BOX_ENV_PARAM 는 이미 채워져 있습니다. 덮어쓰지 않습니다."
unset current

work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT
umask 077

# compose 의 .env 는 작은따옴표 안을 글자 그대로 읽는다($ 치환 없음). 작은따옴표·줄바꿈이 든 값은 받지 않는다.
line() {
  case "$2" in
    *"'"* | *$'\n'*) die "$1 값에 작은따옴표나 줄바꿈이 있어 넣을 수 없습니다." ;;
  esac
  printf "%s='%s'\n" "$1" "$2"
}

receiver_key="${RECEIVER_API_KEY:-}"
if [ -z "$receiver_key" ]; then
  receiver_key=$(openssl rand -hex 24)
  log "RECEIVER_API_KEY 를 새로 만들었습니다. HMI 의 수신 키도 이 값으로 바꿔야 합니다(콘솔에서 파라미터 확인)."
fi
[ "${#receiver_key}" -ge 8 ] || die "RECEIVER_API_KEY 는 8자 이상이어야 합니다."

{
  for k in POSTGRES_PASSWORD MIGRATOR_DB_PASSWORD APP_DB_PASSWORD READONLY_DB_PASSWORD LOCAL_DB_PASSWORD; do
    line "$k" "$(openssl rand -hex 24)"
  done
  line RECEIVER_API_KEY "$receiver_key"
  line JWT_SECRET "$(openssl rand -hex 32)"
  for k in CRITICAL_FAULT_WEBHOOK_URL SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_FROM ALERT_EMAIL_TO; do
    line "$k" ""
  done
} >"$work_dir/env"
unset receiver_key

aws ssm put-parameter --name "$BOX_ENV_PARAM" --type SecureString --overwrite \
  --value "file://$work_dir/env" >/dev/null
log "$BOX_ENV_PARAM 를 채웠습니다 (키 $(wc -l <"$work_dir/env" | tr -d ' ')개). 다음: scripts/dev-box/deploy.sh"
