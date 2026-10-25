#!/bin/bash
# dev 서버에서 root 로 실행한다(/usr/local/bin/pmcs-deploy). 관리자는 Mac 에서 scripts/dev-box/deploy.sh 로 부른다.
#   1. S3 의 설정 파일(compose.yml·Caddyfile·settings.env 등)을 /opt/pmcs/config 로 받는다.
#   2. SSM 시크릿 파라미터와 settings.env 를 합쳐 /opt/pmcs/config/.env(600)를 만든다.
#   3. 이미지를 받고, Postgres → 마이그레이션 → API·프론트·Caddy 순으로 올린다.
# DB 가 비어 있으면 마이그레이션·앱을 띄우지 않는다. 서버를 새로 만들었을 때 S3 백업을 복원하기 전에
# 빈 스키마가 생기면 복원이 꼬이기 때문이다. 빈 DB 로 새로 시작하려면 ALLOW_EMPTY_DB=1.
set -euo pipefail

# shellcheck source=/dev/null
source /etc/pmcs/box.conf # BUCKET, ENV_PARAM, AWS_REGION, ECR_REGISTRY
export AWS_REGION AWS_DEFAULT_REGION="$AWS_REGION"

log() { echo "[pmcs-deploy] $*"; }

cfg=/opt/pmcs/config
mkdir -p "$cfg"
aws s3 sync --delete --only-show-errors "s3://$BUCKET/config/" "$cfg/"
chmod 755 "$cfg/initdb" "$cfg"/initdb/*.sh
before=$(sha256sum /usr/local/bin/pmcs-deploy 2>/dev/null | cut -d' ' -f1 || true)
install -m 755 "$cfg/pmcs-deploy.sh" /usr/local/bin/pmcs-deploy
install -m 755 "$cfg/pmcs-backup.sh" /usr/local/bin/pmcs-backup
# S3 에 새 pmcs-deploy 가 있었다면, 지금 도는 것은 이전 버전이므로 새 버전으로 다시 시작한다.
if [ -z "${PMCS_DEPLOY_REEXEC:-}" ] && [ "$before" != "$(sha256sum /usr/local/bin/pmcs-deploy | cut -d' ' -f1)" ]; then
  log "새 pmcs-deploy 로 다시 시작"
  PMCS_DEPLOY_REEXEC=1 exec /usr/local/bin/pmcs-deploy "$@"
fi

# 배포할 이미지 태그는 SSM 파라미터(IMAGE_TAG_PARAM)가 정한다. CI 와 scripts/dev-box/deploy.sh 가 쓴다.
# 값이 이상하면 멈춘다 — settings.env 의 첫 값으로 조용히 되돌아가면 옛 버전이 배포되기 때문이다.
tag_param=$(sed -n 's/^IMAGE_TAG_PARAM=//p' "$cfg/settings.env")
tag=""
if [ -n "$tag_param" ]; then
  tag=$(aws ssm get-parameter --name "$tag_param" --query Parameter.Value --output text)
  if ! [[ "$tag" =~ ^[0-9a-f]{7,40}-arm64$ ]]; then
    log "SSM $tag_param 의 이미지 태그가 형식(<커밋>-arm64)에 맞지 않습니다: $tag"
    exit 4
  fi
fi

umask 077
secrets=$(aws ssm get-parameter --name "$ENV_PARAM" --with-decryption --query Parameter.Value --output text)
if ! grep -q '^POSTGRES_PASSWORD=' <<<"$secrets"; then
  log "시크릿 파라미터 $ENV_PARAM 가 아직 비어 있습니다. Mac 에서 scripts/dev-box/init-env.sh 를 먼저 실행하세요."
  exit 3
fi
{ cat "$cfg/settings.env"; echo "$secrets"; } >"$cfg/.env"
unset secrets
if [ -n "$tag" ]; then
  sed -i -E "s#^((API|FRONTEND)_IMAGE=[^:]+):.*#\1:$tag#" "$cfg/.env"
  log "이미지 태그 $tag"
fi

compose() { docker compose --project-name pmcs --project-directory "$cfg" -f "$cfg/compose.yml" "$@"; }

aws ecr get-login-password | docker login --username AWS --password-stdin "$ECR_REGISTRY" >/dev/null
log "이미지 받기"
compose pull --quiet postgres api frontend caddy

log "Postgres 시작"
compose up -d --wait postgres

tables=$(compose exec -T postgres psql -U postgres -d pmcs -tAc \
  "select count(*) from information_schema.tables where table_schema = 'public'")
if [ "$tables" = 0 ] && [ "${ALLOW_EMPTY_DB:-0}" != 1 ]; then
  log "DB 가 비어 있어 앱을 띄우지 않았습니다. S3 백업을 복원한 뒤 다시 배포하세요(scripts/dev-box/README.md)."
  log "(빈 DB 로 새로 시작하려면 ALLOW_EMPTY_DB=1 pmcs-deploy)"
  exit 0
fi

log "마이그레이션"
compose run --rm migrate

log "API·프론트·Caddy 시작"
compose up -d --wait --remove-orphans api frontend caddy
docker image prune -f >/dev/null
compose ps --format 'table {{.Service}}\t{{.Image}}\t{{.Status}}'
log "완료"
