# pmcs-prod 계정의 보안 기반. dns·app 루트보다 먼저 적용한다.
# "필수 보안형"(2026-10-22 결정): 작업 기록(CloudTrail)과 침해 탐지(GuardDuty)는 켜고,
# 설정 점검(Security Hub)과 그 근거인 Config 기록은 고객사가 요구할 때 켠다(월 약 $10~20).

module "security" {
  source = "../../../modules/security-baseline"

  name_prefix = "pmcs-prod"

  # 고객사 요구(로그 보존 기간)가 정해지면 늘린다.
  audit_log_lock_days      = 90
  audit_log_retention_days = 365

  alert_emails = local.alert_emails

  # Config 를 켜지 않으므로 서비스 연결 역할도 만들지 않는다. 켤 때 함께 true 로 바꾼다.
  create_config_service_linked_role = false

  # prod DB 에는 고객 데이터가 있으므로 RDS 데이터 활동 감시를 켠다.
  enable_rds_data_monitoring = true

  enable_security_hub = false
  enable_config       = false
}

# 보안 경보 수신 이메일은 공개 저장소에 두지 않고 SSM 파라미터(StringList, 쉼표 구분)에서 읽는다.
#   aws ssm put-parameter --name /pmcs-prod/security/alert-emails --type StringList \
#     --value "a@example.com,b@example.com" --overwrite
# 파라미터가 없으면 구독 없이 SNS 토픽만 만든다(경로 조회는 빈 결과를 돌려주므로 plan이 실패하지 않음).
data "aws_ssm_parameters_by_path" "security" {
  path = "/pmcs-prod/security"
}

locals {
  alert_emails_parameter = "/pmcs-prod/security/alert-emails"
  alert_emails_raw = try(
    data.aws_ssm_parameters_by_path.security.values[
      index(data.aws_ssm_parameters_by_path.security.names, local.alert_emails_parameter)
    ],
    "",
  )
  # 이메일은 비밀이 아니다. for_each에 쓰려면 민감 표시를 풀어야 한다.
  alert_emails = compact([for e in split(",", nonsensitive(local.alert_emails_raw)) : trimspace(e)])
}

output "security_kms_key_arn" {
  value = module.security.security_kms_key_arn
}

output "audit_bucket_name" {
  value = module.security.audit_bucket_name
}

output "security_alerts_topic_arn" {
  value = module.security.security_alerts_topic_arn
}
