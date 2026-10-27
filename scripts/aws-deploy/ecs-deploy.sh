#!/usr/bin/env bash
# prod ECS 에 이미지 태그 하나(<커밋>-arm64)를 배포한다. CI(deploy-prod.yml)와 관리자 Mac 이 같이 쓴다.
#
#   1. ECR 에 api·frontend 이미지가 있는지 확인
#   2. 마이그레이션 작업 정의를 새 이미지로 등록하고 한 번 실행 (실패하면 서비스는 그대로)
#   3. api·frontend·db-tunnel 작업 정의를 새 이미지로 등록하고 api·frontend 서비스 교체, 안정될 때까지 대기
#      (새 태스크가 뜨지 못하면 ECS 가 이전 버전으로 되돌린다 — 그 경우 실패로 끝난다)
#   4. SSM image-tag 에 태그 기록 → Terraform 이 같은 태그로 작업 정의를 만들므로 plan 은 No changes
#
# 새 버전은 지금 버전을 그대로 복사하고 이미지만 바꾼다. CPU·메모리·환경 변수는 Terraform 으로만 바꾼다.
# 마이그레이션은 되돌릴 수 없다. 이전 태그로 되돌려도 DB 구조는 그대로다(Railway 때와 같다).
#
# 사용: TAG=<커밋>-arm64 [NAME_PREFIX=pmcs-prod] scripts/aws-deploy/ecs-deploy.sh
#       관리자 Mac: AWS_PROFILE=pmcs-prod AWS_REGION=ap-northeast-2 TAG=... scripts/aws-deploy/ecs-deploy.sh
set -euo pipefail

: "${TAG:?TAG 가 필요합니다 (예: 6344f79-arm64)}"
NAME_PREFIX="${NAME_PREFIX:-pmcs-prod}"
cluster="$NAME_PREFIX"
tag_parameter="/$NAME_PREFIX/app/image-tag"

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }
die() { log "오류: $*"; exit 1; }

[[ "$TAG" =~ ^[0-9a-f]{7,40}-arm64$ ]] || die "태그 형식이 아닙니다: $TAG"

work_dir=$(mktemp -d)
registered=()
services_updated=false
cleanup() {
  local status=$?
  # 서비스를 바꾸기 전에 실패했다면 새로 등록한 버전을 지운다(Terraform 이 최신 버전과 비교하므로).
  if [ "$status" != 0 ] && [ "$services_updated" = false ]; then
    for arn in ${registered[@]+"${registered[@]}"}; do
      aws ecs deregister-task-definition --task-definition "$arn" >/dev/null && log "등록 취소: ${arn##*/}"
    done
  fi
  rm -rf "$work_dir"
}
trap cleanup EXIT

# 작업 정의(family)의 최신 버전을 이미지 태그만 바꿔 새로 등록하고 ARN 을 registered_arn 에 둔다.
# (등록 목록을 남겨야 하므로 $(...) 서브셸로 부르지 않는다.)
register() {
  local family="$NAME_PREFIX-$1" current image new_image
  current=$(aws ecs describe-task-definition --task-definition "$family" --include TAGS --output json)
  image=$(jq -r '.taskDefinition.containerDefinitions[0].image' <<<"$current")
  new_image="${image%:*}:$TAG"
  if [ "$image" = "$new_image" ]; then
    log "$family: 이미 $TAG"
    registered_arn=$(jq -r '.taskDefinition.taskDefinitionArn' <<<"$current")
    return
  fi
  jq --arg image "$new_image" '
    .tags as $tags
    | .taskDefinition
    | .containerDefinitions[0].image = $image
    | del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities,
          .registeredAt, .registeredBy, .deregisteredAt)
    | if ($tags | length) > 0 then .tags = $tags else . end' <<<"$current" >"$work_dir/$1.json"
  registered_arn=$(aws ecs register-task-definition --cli-input-json "file://$work_dir/$1.json" \
    --query taskDefinition.taskDefinitionArn --output text)
  registered+=("$registered_arn")
  log "$family: ${image##*:} → $TAG (${registered_arn##*/})"
}

log "배포 시작: $NAME_PREFIX ← $TAG"
previous=$(aws ssm get-parameter --name "$tag_parameter" --query Parameter.Value --output text)
log "지금 태그: $previous"

for repo in api frontend; do
  aws ecr describe-images --repository-name "$NAME_PREFIX/$repo" --image-ids imageTag="$TAG" >/dev/null 2>&1 ||
    die "ECR $NAME_PREFIX/$repo 에 $TAG 이미지가 없습니다."
done

# ── 마이그레이션 ──────────────────────────────────────────────────────
register api-migrate
migrate_arn=$registered_arn
# 일회성 태스크는 api 서비스와 같은 서브넷·보안 그룹·공인 IP 설정으로 띄운다.
network=$(aws ecs describe-services --cluster "$cluster" --services "$NAME_PREFIX-api" \
  --query 'services[0].networkConfiguration' --output json)
task_arn=$(aws ecs run-task --cluster "$cluster" --task-definition "$migrate_arn" --launch-type FARGATE \
  --started-by "deploy-$TAG" --network-configuration "$network" --query 'tasks[0].taskArn' --output text)
[ -n "$task_arn" ] && [ "$task_arn" != None ] || die "마이그레이션 태스크를 시작하지 못했습니다."
log "마이그레이션 실행 중 (${task_arn##*/})"
aws ecs wait tasks-stopped --cluster "$cluster" --tasks "$task_arn"

exit_code=$(aws ecs describe-tasks --cluster "$cluster" --tasks "$task_arn" \
  --query 'tasks[0].containers[0].exitCode' --output text)
aws logs get-log-events --log-group-name "/ecs/$NAME_PREFIX/api-migrate" --log-stream-name "api-migrate/api-migrate/${task_arn##*/}" \
  --query 'events[].message' --output text 2>/dev/null | tr '\t' '\n' | grep -v -E 'npm notice|dotenv@' | tail -8 >&2 || true
[ "$exit_code" = 0 ] || die "마이그레이션 실패 (종료 코드: $exit_code). 서비스는 바꾸지 않았습니다."
log "마이그레이션 완료"

# ── 서비스 교체 ───────────────────────────────────────────────────────
register api
api_arn=$registered_arn
register frontend
frontend_arn=$registered_arn
register db-tunnel

services_updated=true
for pair in "api:$api_arn" "frontend:$frontend_arn"; do
  aws ecs update-service --cluster "$cluster" --service "$NAME_PREFIX-${pair%%:*}" \
    --task-definition "${pair#*:}" --query 'service.serviceName' --output text >/dev/null
done
log "서비스 교체 중 (보통 3~6분)"
aws ecs wait services-stable --cluster "$cluster" --services "$NAME_PREFIX-api" "$NAME_PREFIX-frontend"

for pair in "api:$api_arn" "frontend:$frontend_arn"; do
  running=$(aws ecs describe-services --cluster "$cluster" --services "$NAME_PREFIX-${pair%%:*}" \
    --query 'services[0].taskDefinition' --output text)
  [ "$running" = "${pair#*:}" ] ||
    die "$NAME_PREFIX-${pair%%:*} 가 새 버전으로 바뀌지 않았습니다(배포 실패로 ${running##*/} 로 되돌아감). 로그 /ecs/$NAME_PREFIX/${pair%%:*} 확인"
done

aws ssm put-parameter --name "$tag_parameter" --value "$TAG" --overwrite >/dev/null
log "배포 완료: $previous → $TAG"
log "되돌리기: TAG=$previous scripts/aws-deploy/ecs-deploy.sh (또는 Actions → Deploy prod → Run workflow, tag=$previous)"
