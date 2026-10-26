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

variable "app_alias_hostnames" {
  description = "app 과 똑같이 서비스할 추가 주소 (예: 컷오버 전 리허설용 app.<도메인>). 인증서 SAN 에 함께 들어간다."
  type        = list(string)
  default     = []
}

variable "redirect_hostnames" {
  description = "app_hostname 으로 301 리디렉트할 주소 (예: www.<도메인>). 인증서 SAN 에 함께 들어간다."
  type        = list(string)
  default     = []
}

variable "route53_zone_id" {
  description = "주소들이 이 Route 53 영역에 있으면 ACM 검증 레코드를 자동으로 만든다. null 이면 출력(acm_validation_records)을 보고 DNS 에 수동으로 넣는다."
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

variable "enable_waf" {
  description = "false면 WAF 없이 ALB만 둔다(dev 비용 절감, 월 약 $13). api 도메인은 여전히 ALB 규칙으로 /receiver만 서버에 닿고 나머지는 404. prod는 true."
  type        = bool
  default     = true
}

variable "block_no_user_agent_outside_receiver" {
  description = <<-EOT
    true 면 User-Agent 없는 요청을 /receiver 밖에서만 막는다. HMI 펌웨어는 User-Agent 를 보내지 않으므로
    /receiver 는 계속 통과시킨다(관리형 규칙 NoUserAgent_HEADER 는 카운트로 두고, 그 라벨로 판단).
  EOT
  type        = bool
  default     = true
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
