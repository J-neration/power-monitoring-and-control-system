variable "name_prefix" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "public_subnet_ids" {
  type = list(string)
}

variable "alb_security_group_id" {
  type = string
}

variable "app_hostname" {
  description = "브라우저용 주소 (예: app-dev.<회사도메인>). null이면 HTTPS·ACM 없이 만든다."
  type        = string
  default     = null
}

variable "api_hostname" {
  description = "HMI 수신 전용 주소 (예: api-dev.<회사도메인>). /receiver 외 경로는 WAF가 막는다."
  type        = string
  default     = null
}

variable "frontend_port" {
  type    = number
  default = 3000
}

variable "api_port" {
  type    = number
  default = 4000
}

variable "kms_key_arn" {
  description = "WAF 로그 그룹 암호화 키"
  type        = string
}

variable "log_retention_days" {
  type    = number
  default = 90
}

variable "deletion_protection" {
  type    = bool
  default = true
}

variable "login_rate_limit" {
  description = "IP당 5분 동안 허용하는 로그인 요청 수"
  type        = number
  default     = 30
}

variable "receiver_rate_limit" {
  description = "IP당 5분 동안 허용하는 /receiver 요청 수. 여러 HMI가 한 공인 IP를 공유할 수 있어 넉넉히 둔다."
  type        = number
  default     = 600
}

variable "global_rate_limit" {
  description = "IP당 5분 동안 허용하는 전체 요청 수"
  type        = number
  default     = 2000
}
