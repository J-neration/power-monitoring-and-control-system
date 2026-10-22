#!/usr/bin/env bash
# RDS 로 가는 임시 터널을 연다: 이 Mac localhost:$TUNNEL_PORT → (SSM, 암호화) → ECS 태스크 → RDS:5432
#
# RDS 는 인터넷 경로가 없는 격리 서브넷에 있어 직접 접속할 수 없다. 그래서 api 보안 그룹으로
# 터널 전용 태스크(pmcs-<env>-db-tunnel, 1시간 뒤 스스로 종료)를 띄우고 SSM 포트 포워딩을 건다.
# 이 창을 닫거나 Ctrl+C 를 누르면 태스크도 바로 정리한다. 다른 터미널에서 나머지 스크립트를 실행한다.
#
# 필요: aws CLI, session-manager-plugin (brew install --cask session-manager-plugin), jq
# 사용: PMCS_ENV=dev scripts/aws-migrate/open-db-tunnel.sh

source "$(dirname "$0")/lib.sh"
require aws jq session-manager-plugin
check_account

cluster="$NAME_PREFIX"
task_definition="$NAME_PREFIX-db-tunnel"

subnets=$(aws ec2 describe-subnets --filters "Name=tag:Name,Values=$NAME_PREFIX-private-*" \
  --query 'Subnets[].SubnetId' --output text | tr '\t' ',')
security_group=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=$NAME_PREFIX-api" \
  --query 'SecurityGroups[0].GroupId' --output text)
[ -n "$subnets" ] && [ "$security_group" != None ] || die "private 서브넷 또는 $NAME_PREFIX-api 보안 그룹을 찾지 못했습니다(app 루트가 적용됐는지 확인)."
db_host=$(db_address)

log "터널 태스크 시작 ($task_definition)"
task_arn=$(aws ecs run-task --cluster "$cluster" --task-definition "$task_definition" \
  --launch-type FARGATE --enable-execute-command --started-by aws-migrate-tunnel \
  --network-configuration "awsvpcConfiguration={subnets=[$subnets],securityGroups=[$security_group],assignPublicIp=DISABLED}" \
  --query 'tasks[0].taskArn' --output text)
[ -n "$task_arn" ] && [ "$task_arn" != None ] || die "태스크를 시작하지 못했습니다."

cleanup() {
  aws ecs stop-task --cluster "$cluster" --task "$task_arn" --reason "aws-migrate tunnel closed" >/dev/null 2>&1 || true
  log "터널 태스크를 종료했습니다."
}
trap cleanup EXIT INT TERM

aws ecs wait tasks-running --cluster "$cluster" --tasks "$task_arn"

# GuardDuty 런타임 감시가 켜져 있으면 태스크에 aws-guardduty-agent 컨테이너가 함께 붙고, 순서는 정해져 있지 않다.
# 그래서 containers[0] 이 아니라 작업 정의의 컨테이너 이름으로 찾는다.
container_name=$(aws ecs describe-task-definition --task-definition "$task_definition" \
  --query 'taskDefinition.containerDefinitions[0].name' --output text)

agent=""
for _ in $(seq 1 36); do
  agent=$(aws ecs describe-tasks --cluster "$cluster" --tasks "$task_arn" \
    --query "tasks[0].containers[?name=='$container_name'] | [0].managedAgents[?name=='ExecuteCommandAgent'].lastStatus | [0]" --output text)
  [ "$agent" = RUNNING ] && break
  sleep 5
done
[ "$agent" = RUNNING ] || die "ECS Exec 에이전트가 준비되지 않았습니다 (상태: $agent)."

runtime_id=$(aws ecs describe-tasks --cluster "$cluster" --tasks "$task_arn" \
  --query "tasks[0].containers[?name=='$container_name'] | [0].runtimeId" --output text)
target="ecs:${cluster}_${task_arn##*/}_${runtime_id}"

log "localhost:$TUNNEL_PORT → $db_host:5432 터널을 엽니다. 끝나면 Ctrl+C."
aws ssm start-session --target "$target" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "{\"host\":[\"$db_host\"],\"portNumber\":[\"5432\"],\"localPortNumber\":[\"$TUNNEL_PORT\"]}"
