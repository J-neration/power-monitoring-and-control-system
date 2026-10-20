variable "name_prefix" {
  type = string
}

variable "subnet_ids" {
  description = "isolated 서브넷 (인터넷 경로 없음)"
  type        = list(string)
}

variable "security_group_ids" {
  type = list(string)
}

variable "kms_key_arn" {
  description = "스토리지·백업·마스터 비밀번호 시크릿·로그 암호화 키"
  type        = string
}

variable "instance_class" {
  type = string
}

variable "multi_az" {
  type = bool
}

variable "engine_version" {
  description = "주 버전만 주면 그 안의 최신 부 버전을 쓰고, 부 버전은 유지보수 시간에 자동 업그레이드된다."
  type        = string
  default     = "16"
}

variable "allocated_storage_gb" {
  type    = number
  default = 20
}

variable "max_allocated_storage_gb" {
  description = "스토리지 자동 확장 상한"
  type        = number
  default     = 100
}

variable "backup_retention_days" {
  type    = number
  default = 14
}

variable "log_retention_days" {
  type    = number
  default = 90
}

variable "apply_immediately" {
  description = "false면 설정 변경을 다음 유지보수 시간에 적용한다(재시작 동반 변경 대비)."
  type        = bool
  default     = false
}
