variable "name_prefix" {
  description = "리소스 이름 앞부분 (예: pmcs-dev)"
  type        = string
}

variable "audit_log_retention_days" {
  description = "CloudTrail·Config 기록을 S3에 보관하는 기간(일). 지나면 삭제된다."
  type        = number
  default     = 365
}

variable "audit_log_lock_days" {
  description = "감사 로그를 아무도(관리자 포함) 지우거나 덮어쓰지 못하게 잠그는 기간(일). S3 Object Lock 거버넌스 모드."
  type        = number
  default     = 90
}

variable "cloudtrail_log_group_retention_days" {
  description = "CloudTrail을 CloudWatch Logs에서 바로 검색할 수 있게 남겨 두는 기간(일)"
  type        = number
  default     = 90
}

variable "enable_cis_standard" {
  description = "Security Hub에서 AWS 기본 보안 표준(FSBP)에 더해 CIS AWS Foundations Benchmark v3.0도 켤지"
  type        = bool
  default     = false
}

variable "create_config_service_linked_role" {
  description = "AWS Config 서비스 연결 역할이 계정에 아직 없으면 true"
  type        = bool
  default     = true
}

variable "alert_emails" {
  description = "보안 경보를 받을 이메일 목록. 비워 두면 구독 없이 SNS 토픽만 만든다(구독 확인 메일 승인 필요)."
  type        = list(string)
  default     = []
}
