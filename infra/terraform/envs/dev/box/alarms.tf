# dev 알람 (modules/ops-alarms). 메일 주소는 SSM /pmcs-dev/security/alert-emails 에서 읽는다(보안 경보와 같은 사람).
# 구독 확인 메일의 링크를 눌러야 받기 시작한다.
#
#   서버 다운     EC2 상태 검사. AWS 쪽 문제면 자동 복구(같은 IP·볼륨)
#   앱 이상       서버 안 5분 점검(pmcs-health.sh)이 10분 연속 실패하거나 값이 안 옴 / API 오류 로그 10분 5건 이상
#   장비 끊김     최근 7일 수신하던 장비가 30분 넘게 끊김 (API 의 device freshness 로그, 10분마다)

data "aws_ssm_parameters_by_path" "security" {
  path = "/${local.name_prefix}/security"
}

locals {
  alert_emails_parameter = "/${local.name_prefix}/security/alert-emails"
  alert_emails_raw = try(
    data.aws_ssm_parameters_by_path.security.values[
      index(data.aws_ssm_parameters_by_path.security.names, local.alert_emails_parameter)
    ],
    "",
  )
  # 이메일은 비밀이 아니다. for_each 에 쓰려면 민감 표시를 풀어야 한다.
  alert_emails = compact([for e in split(",", nonsensitive(local.alert_emails_raw)) : trimspace(e)])

  # pmcs-health.sh 가 Healthy 지표를 올리는 곳. 모듈의 로그 지표와 같은 네임스페이스.
  health_namespace = "PMCS/${local.name_prefix}"
}

module "alarms" {
  source = "../../../modules/ops-alarms"

  name_prefix  = local.name_prefix
  alert_emails = local.alert_emails
  # dev 는 암호화하지 않는다(알람 문구만 담김). prod 는 cloudwatch 를 허용한 KMS 키를 넘긴다.
  kms_key_arn = null

  ec2_instances = { box = aws_instance.box.id }

  log_metric_alarms = {
    ApiErrors = {
      log_group_name = aws_cloudwatch_log_group.box["api"].name
      pattern        = "{ $.level >= 50 }"
      threshold      = 5
      period         = 600
      description    = "dev API 에 10분 동안 오류 로그가 5건 이상 쌓였습니다. CloudWatch Logs Insights 에서 /pmcs-dev/box/api 를 level >= 50 으로 걸러 보세요."
    }
    StaleDevices = {
      log_group_name     = aws_cloudwatch_log_group.box["api"].name
      pattern            = "{ $.msg = \"device freshness\" }"
      value              = "$.stale"
      statistic          = "Maximum"
      threshold          = 1
      period             = 600
      evaluation_periods = 2
      description        = "최근 7일 안에 수신하던 장비가 30분 넘게 데이터를 보내지 않습니다. Logs Insights(/pmcs-dev/box/api): filter msg = \"device freshness\" | fields @timestamp, staleIds | sort @timestamp desc"
    }
  }

  metric_alarms = {
    AppUnhealthy = {
      namespace           = local.health_namespace
      metric_name         = "Healthy"
      comparison_operator = "LessThanThreshold"
      threshold           = 1
      description         = "dev 서버 안 점검이 10분 연속 실패했거나 값이 오지 않습니다(app-dev 로그인 200, api-dev 수신 401 확인). 서버가 꺼졌거나 Caddy·프론트·API 중 하나가 멈췄을 수 있습니다."
    }
  }
}

output "ops_alert_topic_arn" {
  value = module.alarms.topic_arn
}
