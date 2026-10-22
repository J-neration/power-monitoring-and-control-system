#!/usr/bin/env bash
# dev 서버에서 pmcs-deploy 를 실행한다(SSM Run Command). 서버가 S3 의 최신 설정과 settings.env 의
# 이미지 태그로 다시 올라온다. 이미지·주소를 바꾸려면 먼저 envs/dev/box/terraform.tfvars 를 고치고 apply.
#
# 사용: scripts/dev-box/deploy.sh            # 평소
#       ALLOW_EMPTY_DB=1 scripts/dev-box/deploy.sh   # 빈 DB 에 마이그레이션부터 새로 시작할 때
source "$(dirname "$0")/lib.sh"
require aws jq
check_account

id=$(box_instance_id)
cmd="/usr/local/bin/pmcs-deploy"
[ "${ALLOW_EMPTY_DB:-0}" = 1 ] && cmd="ALLOW_EMPTY_DB=1 $cmd"

log "$BOX_NAME($id) 에서 pmcs-deploy 실행"
command_id=$(aws ssm send-command --instance-ids "$id" --document-name AWS-RunShellScript \
  --comment "pmcs-deploy" --timeout-seconds 900 \
  --parameters "$(jq -n --arg c "$cmd" '{commands: [$c], executionTimeout: ["900"]}')" \
  --query Command.CommandId --output text)

status=Pending
while :; do
  sleep 5
  status=$(aws ssm get-command-invocation --command-id "$command_id" --instance-id "$id" \
    --query Status --output text 2>/dev/null || echo Pending)
  case "$status" in Pending | InProgress | Delayed) continue ;; esac
  break
done

aws ssm get-command-invocation --command-id "$command_id" --instance-id "$id" \
  --query '[StandardOutputContent, StandardErrorContent]' --output text
[ "$status" = Success ] || die "pmcs-deploy 실패: $status (출력이 잘렸으면 CloudWatch 로그 ${NAME_PREFIX}/box/* 를 확인)"
log "완료"
