#!/usr/bin/env bash
# dev 서버 1대형의 비밀 값을 SSM 파라미터(/pmcs-dev/box/env, SecureString)에 처음 한 번 채운다.
#   - DB 계정 비밀번호 5개(postgres·pmcs_migrator·pmcs_app·pmcs_readonly·pmcs_local)는 새로 만든다.
#   - RECEIVER_API_KEY·JWT_SECRET·웹훅·SMTP 는 ECS dev 시크릿(pmcs-dev/api·jwt·alert-mail)에서 그대로 복사한다.
#     HMI 가 지금 쓰는 키가 같아야 주소만 바꿔 넘어갈 수 있다.
# 값은 화면·파일에 남기지 않는다(임시 파일은 끝나면 지움). 이미 채워져 있으면 멈춘다
# (DB 비밀번호는 Postgres 를 처음 만들 때만 적용되므로, 나중에 바꾸면 서버와 어긋난다).
#
# 필요: aws CLI, jq, openssl
# 사용: scripts/dev-box/init-env.sh
source "$(dirname "$0")/lib.sh"
require aws jq openssl
check_account

current=$(aws ssm get-parameter --name "$BOX_ENV_PARAM" --with-decryption --query Parameter.Value --output text)
[ "$current" = UNSET ] || die "$BOX_ENV_PARAM 는 이미 채워져 있습니다. 덮어쓰지 않습니다."
unset current

work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT
umask 077

secret_json() { aws secretsmanager get-secret-value --secret-id "$1" --query SecretString --output text; }
secret_json "$API_SECRET_ID" >"$work_dir/api.json"
secret_json "$NAME_PREFIX/jwt" >"$work_dir/jwt.json"
secret_json "$NAME_PREFIX/alert-mail" >"$work_dir/mail.json"

# compose 의 .env 는 작은따옴표 안을 글자 그대로 읽는다($ 치환 없음). 작은따옴표·줄바꿈이 든 값은 받지 않는다.
line() {
  case "$2" in
    *"'"* | *$'\n'*) die "$1 값에 작은따옴표나 줄바꿈이 있어 넣을 수 없습니다." ;;
  esac
  printf "%s='%s'\n" "$1" "$2"
}
copy() { line "$1" "$(jq -r --arg k "$1" '.[$k] // ""' "$2")"; }

{
  for k in POSTGRES_PASSWORD MIGRATOR_DB_PASSWORD APP_DB_PASSWORD READONLY_DB_PASSWORD LOCAL_DB_PASSWORD; do
    line "$k" "$(openssl rand -hex 24)"
  done
  copy RECEIVER_API_KEY "$work_dir/api.json"
  copy CRITICAL_FAULT_WEBHOOK_URL "$work_dir/api.json"
  copy JWT_SECRET "$work_dir/jwt.json"
  for k in SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_FROM ALERT_EMAIL_TO; do
    copy "$k" "$work_dir/mail.json"
  done
} >"$work_dir/env"

grep -qE "^RECEIVER_API_KEY='.{8,}'$" "$work_dir/env" || die "$API_SECRET_ID 에 RECEIVER_API_KEY 가 없습니다."
grep -qE "^JWT_SECRET='.{16,}'$" "$work_dir/env" || die "$NAME_PREFIX/jwt 에 JWT_SECRET 이 없습니다."

aws ssm put-parameter --name "$BOX_ENV_PARAM" --type SecureString --overwrite \
  --value "file://$work_dir/env" >/dev/null
log "$BOX_ENV_PARAM 를 채웠습니다 (키 $(wc -l <"$work_dir/env" | tr -d ' ')개). 다음: scripts/dev-box/deploy.sh"
