# scripts/dev-box 공용 설정·함수. 각 스크립트가 source 하며, 직접 실행하지 않는다.
# dev "서버 1대형"(infra/terraform/envs/dev/box) 전용이다. 계정 확인·pg_docker 등은 aws-migrate/lib.sh 를 쓴다.

PMCS_ENV=dev
# shellcheck source=../aws-migrate/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/../aws-migrate/lib.sh"

BOX_NAME="$NAME_PREFIX-box"
BOX_ENV_PARAM="/$NAME_PREFIX/box/env"
# 서버에서 compose 를 부르는 명령 (pmcs-deploy 와 같은 프로젝트)
BOX_COMPOSE="docker compose --project-name pmcs --project-directory /opt/pmcs/config -f /opt/pmcs/config/compose.yml"

box_instance_id() {
  local id
  id=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=$BOX_NAME" "Name=instance-state-name,Values=running" \
    --query 'Reservations[0].Instances[0].InstanceId' --output text)
  [ -n "$id" ] && [ "$id" != None ] || die "실행 중인 $BOX_NAME 서버를 찾지 못했습니다(box 루트가 적용됐는지 확인)."
  echo "$id"
}

# 서버에서 셸 명령을 root 로 실행하고(SSM Run Command) 출력을 보여 준다. 실패하면 멈춘다.
run_on_box() {
  local id command_id status
  id=$(box_instance_id)
  command_id=$(aws ssm send-command --instance-ids "$id" --document-name AWS-RunShellScript \
    --comment "${2:-pmcs}" --timeout-seconds 900 \
    --parameters "$(jq -n --arg c "$1" '{commands: [$c], executionTimeout: ["900"]}')" \
    --query Command.CommandId --output text)
  while :; do
    sleep 5
    status=$(aws ssm get-command-invocation --command-id "$command_id" --instance-id "$id" \
      --query Status --output text 2>/dev/null || echo Pending)
    case "$status" in Pending | InProgress | Delayed) continue ;; esac
    break
  done
  aws ssm get-command-invocation --command-id "$command_id" --instance-id "$id" \
    --query '[StandardOutputContent, StandardErrorContent]' --output text
  [ "$status" = Success ] || die "서버 명령 실패: $status (출력이 잘렸으면 CloudWatch 로그 /$NAME_PREFIX/box/* 확인)"
}
