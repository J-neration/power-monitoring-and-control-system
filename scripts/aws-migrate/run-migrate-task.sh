#!/usr/bin/env bash
# 마이그레이션 태스크(pmcs-<env>-api-migrate)를 한 번 실행하고, 끝나면 종료 코드와 로그 끝부분을 보여 준다.
# 새 이미지로 작업 정의를 바꾼 뒤, API 서비스를 새 이미지로 돌리기 전에 실행한다.
# 마이그레이션이 없으면 "No pending migrations to apply." 가 정상이다.
#
# 사용: PMCS_ENV=dev scripts/aws-migrate/run-migrate-task.sh

source "$(dirname "$0")/lib.sh"
require aws jq
check_account

cluster="$NAME_PREFIX"
task_definition="$NAME_PREFIX-api-migrate"

log "마이그레이션 태스크 시작 ($task_definition)"
task_arn=$(aws ecs run-task --cluster "$cluster" --task-definition "$task_definition" \
  --launch-type FARGATE --started-by aws-migrate-migrate \
  --network-configuration "$(task_network_configuration)" \
  --query 'tasks[0].taskArn' --output text)
[ -n "$task_arn" ] && [ "$task_arn" != None ] || die "태스크를 시작하지 못했습니다."

aws ecs wait tasks-stopped --cluster "$cluster" --tasks "$task_arn"

container_name=$(aws ecs describe-task-definition --task-definition "$task_definition" \
  --query 'taskDefinition.containerDefinitions[0].name' --output text)
exit_code=$(aws ecs describe-tasks --cluster "$cluster" --tasks "$task_arn" \
  --query "tasks[0].containers[?name=='$container_name'] | [0].exitCode" --output text)

log_options=$(aws ecs describe-task-definition --task-definition "$task_definition" \
  --query 'taskDefinition.containerDefinitions[0].logConfiguration.options' --output json)
log_group=$(jq -r '."awslogs-group"' <<<"$log_options")
stream_prefix=$(jq -r '."awslogs-stream-prefix"' <<<"$log_options")
aws logs get-log-events --log-group-name "$log_group" \
  --log-stream-name "$stream_prefix/$container_name/${task_arn##*/}" \
  --query 'events[].message' --output text | tr '\t' '\n' | grep -v -E 'npm notice|dotenv@' | tail -8 >&2 || true

[ "$exit_code" = 0 ] || die "마이그레이션 실패 (종료 코드: $exit_code)"
log "마이그레이션 완료"
