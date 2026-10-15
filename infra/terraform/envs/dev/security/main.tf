# pmcs-dev 계정의 보안 기반. app 루트보다 먼저 적용한다.

module "security" {
  source = "../../../modules/security-baseline"

  name_prefix = "pmcs-dev"

  # dev는 잠금 90일·보관 1년. prod는 고객사 요구(로그 보존 기간)에 맞춰 늘린다.
  audit_log_lock_days      = 90
  audit_log_retention_days = 365

  enable_cis_standard = var.enable_cis_standard
  alert_emails        = var.alert_emails

  create_config_service_linked_role = var.create_config_service_linked_role
}

variable "enable_cis_standard" {
  type    = bool
  default = false
}

variable "alert_emails" {
  description = "보안 경보 수신 이메일. 정해지면 terraform.tfvars에 넣는다."
  type        = list(string)
  default     = []
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
