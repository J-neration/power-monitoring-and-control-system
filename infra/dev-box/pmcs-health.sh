#!/bin/bash
# 5분마다(pmcs-health.timer, pmcs-deploy 가 설치) 이 서버 안에서 브라우저·HMI 경로를 확인하고
# CloudWatch 지표 Healthy(1 정상 / 0 이상)를 올린다. 알람은 envs/dev/box/alarms.tf.
#   - https://<app 주소>/login → 200 이어야 한다 (Caddy TLS → 프론트)
#   - https://<api 주소>/receiver 를 키 없이 POST → 401 이어야 한다 (Caddy → API 가 직접 거절)
# 서버가 꺼지거나 이 스크립트가 못 돌면 값이 오지 않으므로, 알람은 값이 없는 것도 이상으로 본다.
set -uo pipefail

# shellcheck source=/dev/null
source /etc/pmcs/box.conf # AWS_REGION
export AWS_REGION AWS_DEFAULT_REGION="$AWS_REGION"
settings=/opt/pmcs/config/settings.env

setting() { sed -n "s/^$1=//p" "$settings" | cut -d, -f1 | tr -d ' '; }
app=$(setting APP_HOSTS)
api=$(setting API_HOSTS)
namespace=$(setting HEALTH_METRIC_NAMESPACE)

code() { # $1 = 호스트, 나머지는 curl 인자. 이 서버의 Caddy 로 바로 붙는다.
  local host=$1
  shift
  curl -s -o /dev/null -m 10 -w '%{http_code}' --resolve "$host:443:127.0.0.1" "$@"
}

login=$(code "$app" "https://$app/login")
receiver=$(code "$api" -X POST "https://$api/receiver")
healthy=0
[ "$login" = 200 ] && [ "$receiver" = 401 ] && healthy=1
echo "login=$login receiver=$receiver healthy=$healthy"

aws cloudwatch put-metric-data --namespace "$namespace" --metric-name Healthy --value "$healthy" --unit Count
