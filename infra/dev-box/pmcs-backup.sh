#!/bin/bash
# 매일 systemd 타이머(pmcs-backup.timer)가 실행한다. DB 전체를 pg_dump(custom 형식)로 떠서
# S3 backups/ 에 올린다. 보관 기간은 버킷 수명 주기 규칙이 정한다(Terraform).
# 복원: aws s3 cp s3://<버킷>/backups/<파일> - | docker compose ... exec -T postgres pg_restore -U postgres -d pmcs --clean
set -euo pipefail

# shellcheck source=/dev/null
source /etc/pmcs/box.conf
export AWS_REGION AWS_DEFAULT_REGION="$AWS_REGION"

key="backups/pmcs-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose --project-name pmcs --project-directory /opt/pmcs/config -f /opt/pmcs/config/compose.yml \
  exec -T postgres pg_dump -U postgres -d pmcs -Fc |
  aws s3 cp --only-show-errors - "s3://$BUCKET/$key"
echo "[pmcs-backup] s3://$BUCKET/$key"
