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
install -m 755 "$cfg/pmcs-deploy.sh" /usr/local/bin/pmcs-deploy
install -m 755 "$cfg/pmcs-backup.sh" /usr/local/bin/pmcs-backup

umask 077
secrets=$(aws ssm get-parameter --name "$ENV_PARAM" --with-decryption --query Parameter.Value --output text)
if ! grep -q '^POSTGRES_PASSWORD=' <<<"$secrets"; then
  log "시크릿 파라미터 $ENV_PARAM 가 아직 비어 있습니다. Mac 에서 scripts/dev-box/init-env.sh 를 먼저 실행하세요."
  exit 3
fi
{ cat "$cfg/settings.env"; echo "$secrets"; } >"$cfg/.env"
unset secrets

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
