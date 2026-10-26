# prod 알람 (modules/ops-alarms). 메일 주소는 SSM /pmcs-prod/security/alert-emails 에서 읽는다(보안 경보와 같은 사람).
# 구독 확인 메일의 링크를 눌러야 받기 시작한다. 토픽은 앱 KMS 키로 암호화한다(키 정책이 CloudWatch 를 허용).
#
#   서비스 다운   ALB 대상 그룹의 정상 대상이 3분 연속 0 (API·프론트 각각). 서비스가 0대면 만들지 않는다
#   앱 오류       API 오류 로그 10분 5건 이상 / 서버가 돌려준 5xx 가 5분 10건 이상
#   DB           남은 저장 공간 2GB 미만 / CPU 15분 평균 80% 초과
#   장비 끊김     아직 없음 — API 의 DEVICE_FRESHNESS_CHECK_ENABLED 를 장비별 기준으로 정한 뒤 추가한다

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

  service_alarms = merge(
    var.api_desired_count > 0 ? {
      ApiUnhealthy = {
        namespace           = "AWS/ApplicationELB"
        metric_name         = "HealthyHostCount"
        dimensions          = { LoadBalancer = module.edge.alb_arn_suffix, TargetGroup = module.edge.api_target_group_arn_suffix }
        comparison_operator = "LessThanThreshold"
        threshold           = 1
        period              = 60
        evaluation_periods  = 3
        description         = "prod API 의 정상 태스크가 3분 동안 없습니다. HMI 수신·실시간 화면이 멈춥니다. ECS 콘솔 pmcs-prod-api 서비스의 이벤트와 /ecs/pmcs-prod/api 로그를 보세요."
      }
    } : {},
    var.frontend_desired_count > 0 ? {
      FrontendUnhealthy = {
        namespace           = "AWS/ApplicationELB"
        metric_name         = "HealthyHostCount"
        dimensions          = { LoadBalancer = module.edge.alb_arn_suffix, TargetGroup = module.edge.frontend_target_group_arn_suffix }
        comparison_operator = "LessThanThreshold"
        threshold           = 1
        period              = 60
        evaluation_periods  = 3
        description         = "prod 화면(프론트엔드)의 정상 태스크가 3분 동안 없습니다. ECS 콘솔 pmcs-prod-frontend 서비스의 이벤트와 /ecs/pmcs-prod/frontend 로그를 보세요."
      }
    } : {},
  )
}

module "alarms" {
  source = "../../../modules/ops-alarms"

  name_prefix  = local.name_prefix
  alert_emails = local.alert_emails
  kms_key_arn  = aws_kms_key.app.arn

  log_metric_alarms = {
    ApiErrors = {
      log_group_name = module.api.log_group_name
      pattern        = "{ $.level >= 50 }"
      threshold      = 5
      period         = 600
      description    = "prod API 에 10분 동안 오류 로그가 5건 이상 쌓였습니다. CloudWatch Logs Insights 에서 /ecs/pmcs-prod/api 를 level >= 50 으로 걸러 보세요."
    }
  }

  metric_alarms = merge(local.service_alarms, {
    Target5xx = {
      namespace           = "AWS/ApplicationELB"
      metric_name         = "HTTPCode_Target_5XX_Count"
      dimensions          = { LoadBalancer = module.edge.alb_arn_suffix }
      statistic           = "Sum"
      comparison_operator = "GreaterThanOrEqualToThreshold"
      threshold           = 10
      period              = 300
      evaluation_periods  = 1
      treat_missing_data  = "notBreaching"
      description         = "prod 서버(API·프론트)가 5분 동안 5xx 오류를 10건 이상 돌려줬습니다. /ecs/pmcs-prod/api·frontend 로그를 보세요."
    }
    DbFreeStorageLow = {
      namespace           = "AWS/RDS"
      metric_name         = "FreeStorageSpace"
      dimensions          = { DBInstanceIdentifier = module.database.identifier }
      comparison_operator = "LessThanThreshold"
      threshold           = 2147483648
      period              = 300
      evaluation_periods  = 2
      description         = "prod DB 의 남은 저장 공간이 2GB 미만입니다(최대 100GB 까지 자동으로 늘지만, 상한에 가까운지 확인하세요)."
    }
    DbCpuHigh = {
      namespace           = "AWS/RDS"
      metric_name         = "CPUUtilization"
      dimensions          = { DBInstanceIdentifier = module.database.identifier }
      statistic           = "Average"
      comparison_operator = "GreaterThanThreshold"
      threshold           = 80
      period              = 300
      evaluation_periods  = 3
      treat_missing_data  = "notBreaching"
      description         = "prod DB CPU 가 15분 동안 평균 80% 를 넘었습니다. RDS 콘솔의 성능 지표와 /aws/rds/instance/pmcs-prod-db/postgresql 의 느린 쿼리 로그를 보세요."
    }
  })
}

output "ops_alert_topic_arn" {
  value = module.alarms.topic_arn
}
