# pmcs-dev 계정의 보안 기반. app 루트보다 먼저 적용한다.

module "security" {
  source = "../../../modules/security-baseline"

  name_prefix = "pmcs-dev"

  # dev는 잠금 90일·보관 1년. prod는 고객사 요구(로그 보존 기간)에 맞춰 늘린다.
  audit_log_lock_days      = 90
  audit_log_retention_days = 365

  enable_cis_standard = var.enable_cis_standard
  alert_emails        = local.alert_emails

  create_config_service_linked_role = var.create_config_service_linked_role

  # dev DB에는 Neon dev 테스트 데이터만 있다. 로그인 이상 탐지는 유지한다.
  enable_rds_data_monitoring = false

  # dev 비용 절감(2026-10-22 결정): 설정 점검(Security Hub)과 그 근거인 Config 기록은 prod에만 둔다.
  # 작업 기록(CloudTrail)과 침해 탐지(GuardDuty)는 dev에서도 유지한다.
  enable_security_hub = false
  enable_config       = false
}

variable "enable_cis_standard" {
  type    = bool
  default = false
}

# 보안 경보 수신 이메일은 공개 저장소에 두지 않고 SSM 파라미터(StringList, 쉼표 구분)에서 읽는다.
#   aws ssm put-parameter --name /pmcs-dev/security/alert-emails --type StringList \
#     --value "a@example.com,b@example.com" --overwrite
# 파라미터가 없으면 구독 없이 SNS 토픽만 만든다(경로 조회는 빈 결과를 돌려주므로 plan이 실패하지 않음).
data "aws_ssm_parameters_by_path" "security" {
  path = "/pmcs-dev/security"
}

locals {
  alert_emails_parameter = "/pmcs-dev/security/alert-emails"
  alert_emails_raw = try(
    data.aws_ssm_parameters_by_path.security.values[
      index(data.aws_ssm_parameters_by_path.security.names, local.alert_emails_parameter)
    ],
    "",
  )
  # 이메일은 비밀이 아니다. for_each에 쓰려면 민감 표시를 풀어야 한다.
  alert_emails = compact([for e in split(",", nonsensitive(local.alert_emails_raw)) : trimspace(e)])
}

variable "create_config_service_linked_role" {
  type    = bool
  default = true
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
