#!/usr/bin/env bash
# dev 서버에서 pmcs-deploy 를 실행한다(SSM Run Command). 서버가 S3 의 최신 설정과 SSM image-tag 의
# 이미지 태그로 다시 올라온다. 평소에는 dev 병합 때 GitHub Actions(deploy-dev-box.yml)가 대신 한다.
#
# 사용: scripts/dev-box/deploy.sh                       # 지금 태그로 다시 배포 (설정·시크릿만 바뀌었을 때)
#       TAG=74a11de-arm64 scripts/dev-box/deploy.sh     # 그 태그로 바꿔 배포 (되돌리기)
#       ALLOW_EMPTY_DB=1 scripts/dev-box/deploy.sh      # 빈 DB 에 마이그레이션부터 새로 시작할 때
source "$(dirname "$0")/lib.sh"
require aws jq
check_account

tag_param="/$NAME_PREFIX/box/image-tag"
if [ -n "${TAG:-}" ]; then
  [[ "$TAG" =~ ^[0-9a-f]{7,40}-arm64$ ]] || die "TAG 는 <커밋>-arm64 형식이어야 합니다: $TAG"
  for repo in api frontend; do
    aws ecr describe-images --repository-name "$NAME_PREFIX/$repo" --image-ids imageTag="$TAG" >/dev/null 2>&1 \
      || die "ECR $NAME_PREFIX/$repo 에 $TAG 이미지가 없습니다."
  done
  aws ssm put-parameter --name "$tag_param" --value "$TAG" --overwrite >/dev/null
  log "이미지 태그를 $TAG 로 바꿨습니다"
fi
log "배포 태그: $(aws ssm get-parameter --name "$tag_param" --query Parameter.Value --output text)"

cmd="/usr/local/bin/pmcs-deploy"
[ "${ALLOW_EMPTY_DB:-0}" = 1 ] && cmd="ALLOW_EMPTY_DB=1 $cmd"

log "$BOX_NAME 에서 pmcs-deploy 실행"
run_on_box "$cmd" pmcs-deploy
log "완료"
