variable "name_prefix" {
  description = "리소스 이름 앞부분 (예: pmcs-dev)"
  type        = string
}

variable "noncurrent_version_retention_days" {
  description = "덮어쓴 이전 상태 버전을 보관하는 기간(일)"
  type        = number
  default     = 90
}
