#!/usr/bin/env bash
# HMI 수신 키(RECEIVER_API_KEY) 교체. 키 값은 화면·로그·파일에 남기지 않는다(임시 파일은 끝나면 지움).
#
#   prepare  (prod, 처음 한 번) 시크릿에 RECEIVER_API_KEY_PREVIOUS 자리를 빈 값으로 만든다. 작업 정의가 이 키를
#            읽으므로, 자리가 없으면 태스크가 뜨지 않는다. services.tf 를 apply 하기 전에 실행한다.
#   start    지금 키를 RECEIVER_API_KEY_PREVIOUS 로 옮기고 새 키를 만든 뒤 API 를 다시 띄운다.
#            그때부터 새 키와 예전 키를 모두 받는다 — 아직 다시 굽지 않은 HMI 도 그대로 동작한다.
#   copy     새 키를 클립보드에 복사한다(macOS pbcopy). 펌웨어 REMOTE_HTTPS_API_KEY_<PROD|DEV> 에 붙여 넣는다.
#            펌웨어 소스를 공개 저장소에 올리지 말 것.
#   usage    예전 키로 데이터를 보낸 설비 목록(최근 HOURS 시간, 기본 24). 0 이 되면 finish.
#   finish   RECEIVER_API_KEY_PREVIOUS 를 비우고 API 를 다시 띄운다. 예전 키는 이때부터 거부된다.
#
# 저장 위치: prod = Secrets Manager pmcs-prod/api (JSON), dev = SSM /pmcs-dev/box/env (dotenv)
# API 재시작: prod = ECS 서비스 강제 새 배포, dev = scripts/dev-box/deploy.sh
#
# 필요: aws CLI, jq, openssl (copy 는 pbcopy)
# 사용: PMCS_ENV=prod scripts/aws-deploy/rotate-receiver-key.sh start
#       PMCS_ENV=dev  scripts/aws-deploy/rotate-receiver-key.sh usage
script_dir="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../aws-migrate/lib.sh
source "$script_dir/../aws-migrate/lib.sh"
require aws jq openssl
check_account

action="${1:-}"
work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT
umask 077

BOX_ENV_PARAM="/$NAME_PREFIX/box/env"

# 지금 값을 $work_dir/secret 에 받는다 (prod: JSON, dev: dotenv).
load() {
  if [ "$PMCS_ENV" = prod ]; then
    aws secretsmanager get-secret-value --secret-id "$API_SECRET_ID" \
      --query SecretString --output text >"$work_dir/secret"
  else
    aws ssm get-parameter --name "$BOX_ENV_PARAM" --with-decryption \
      --query Parameter.Value --output text >"$work_dir/secret"
  fi
}

save() {
  if [ "$PMCS_ENV" = prod ]; then
    aws secretsmanager put-secret-value --secret-id "$API_SECRET_ID" \
      --secret-string "file://$work_dir/secret" >/dev/null
  else
    aws ssm put-parameter --name "$BOX_ENV_PARAM" --type SecureString --overwrite \
      --value "file://$work_dir/secret" >/dev/null
  fi
}

# 키 하나의 값을 출력한다(변수에 담을 때만 쓴다). 없으면 빈 문자열.
get() {
  if [ "$PMCS_ENV" = prod ]; then
    jq -r --arg k "$1" '.[$k] // ""' "$work_dir/secret"
  else
    # compose .env 형식: KEY='value' (scripts/dev-box/init-env.sh)
    sed -n "s/^$1='\(.*\)'\$/\1/p" "$work_dir/secret" | head -1
  fi
}

# 키 하나를 바꾸거나 더한다.
put() {
  if [ "$PMCS_ENV" = prod ]; then
    jq -c --arg k "$1" --arg v "$2" '.[$k] = $v' "$work_dir/secret" >"$work_dir/next"
  else
    case "$2" in *"'"* | *$'\n'*) die "$1 값에 작은따옴표나 줄바꿈이 있습니다." ;; esac
    { grep -v "^$1=" "$work_dir/secret" || true; printf "%s='%s'\n" "$1" "$2"; } >"$work_dir/next"
  fi
  mv "$work_dir/next" "$work_dir/secret"
}

restart_api() {
  if [ "$PMCS_ENV" = prod ]; then
    log "$NAME_PREFIX-api 를 다시 띄웁니다(새 태스크가 정상이 된 뒤 이전 태스크를 내림)"
    aws ecs update-service --cluster "$NAME_PREFIX" --service "$NAME_PREFIX-api" \
      --force-new-deployment >/dev/null
    aws ecs wait services-stable --cluster "$NAME_PREFIX" --services "$NAME_PREFIX-api"
    log "안정됨"
  else
    "$script_dir/../dev-box/deploy.sh"
  fi
}

case "$action" in
  prepare)
    [ "$PMCS_ENV" = prod ] || die "prepare 는 prod 에만 필요합니다(dev 는 compose 기본값이 빈 값)."
    load
    if jq -e 'has("RECEIVER_API_KEY_PREVIOUS")' "$work_dir/secret" >/dev/null; then
      log "이미 자리가 있습니다. 할 일 없음."
      exit 0
    fi
    put RECEIVER_API_KEY_PREVIOUS ""
    save
    log "$API_SECRET_ID 에 RECEIVER_API_KEY_PREVIOUS(빈 값)를 더했습니다. 이제 services.tf 를 apply 해도 됩니다."
    ;;
  start)
    load
    current=$(get RECEIVER_API_KEY)
    [ -n "$current" ] || die "RECEIVER_API_KEY 가 비어 있습니다."
    [ -z "$(get RECEIVER_API_KEY_PREVIOUS)" ] ||
      die "RECEIVER_API_KEY_PREVIOUS 가 이미 차 있습니다(교체 진행 중). usage 로 확인하고 finish 한 뒤 다시 시작하세요."
    if [ "$PMCS_ENV" = prod ]; then
      jq -e 'has("RECEIVER_API_KEY_PREVIOUS")' "$work_dir/secret" >/dev/null || die "먼저 prepare 를 실행하세요."
      aws ecs describe-task-definition --task-definition "$NAME_PREFIX-api" \
        --query 'taskDefinition.containerDefinitions[0].secrets[].name' --output text |
        tr '\t' '\n' | grep -qx RECEIVER_API_KEY_PREVIOUS ||
        die "작업 정의가 RECEIVER_API_KEY_PREVIOUS 를 읽지 않습니다. services.tf 를 먼저 apply 하세요."
    fi
    put RECEIVER_API_KEY_PREVIOUS "$current"
    put RECEIVER_API_KEY "$(openssl rand -hex 24)"
    unset current
    save
    log "새 키를 만들고 예전 키를 RECEIVER_API_KEY_PREVIOUS 로 옮겼습니다."
    restart_api
    log "다음: copy 로 새 키를 펌웨어에 넣고, HMI 를 다시 구울 때마다 usage 로 남은 설비를 확인하세요."
    ;;
  copy)
    require pbcopy
    load
    get RECEIVER_API_KEY | tr -d '\n' | pbcopy
    log "새 키($PMCS_ENV)를 클립보드에 복사했습니다. 펌웨어 REMOTE_HTTPS_API_KEY_$(tr '[:lower:]' '[:upper:]' <<<"$PMCS_ENV") 에 붙여 넣으세요."
    ;;
  usage)
    if [ "$PMCS_ENV" = prod ]; then log_group="/ecs/$NAME_PREFIX/api"; else log_group="/$NAME_PREFIX/box/api"; fi
    hours="${HOURS:-24}"
    query_id=$(aws logs start-query --log-group-name "$log_group" \
      --start-time $(($(date +%s) - hours * 3600)) --end-time "$(date +%s)" \
      --query-string 'filter msg = "Receiver identity resolved" and keyVersion = "previous"
        | stats count(*) as posts, max(@timestamp) as last by installationId | sort installationId' \
      --query queryId --output text)
    while :; do
      aws logs get-query-results --query-id "$query_id" >"$work_dir/result"
      case "$(jq -r .status "$work_dir/result")" in Running | Scheduled) sleep 2 ;; *) break ;; esac
    done
    rows=$(jq '.results | length' "$work_dir/result")
    log "최근 ${hours}시간 동안 예전 키로 보낸 설비: ${rows}개"
    jq -r '.results[] | map({(.field): .value}) | add | "  \(.installationId)  \(.posts)건  마지막 \(.last)"' \
      "$work_dir/result"
    ;;
  finish)
    load
    [ -n "$(get RECEIVER_API_KEY_PREVIOUS)" ] || die "RECEIVER_API_KEY_PREVIOUS 가 이미 비어 있습니다."
    put RECEIVER_API_KEY_PREVIOUS ""
    save
    log "RECEIVER_API_KEY_PREVIOUS 를 비웠습니다."
    restart_api
    log "예전 키는 이제 거부됩니다(401)."
    ;;
  *)
    die "사용: PMCS_ENV=<dev|prod> $0 <prepare|start|copy|usage|finish>"
    ;;
esac
