variable "name_prefix" {
  type = string
}

variable "vpc_cidr" {
  description = "VPC 주소 범위. dev·prod가 겹치지 않게 한다(나중에 피어링이 필요할 수 있음)."
  type        = string
}

variable "availability_zones" {
  description = "서브넷을 만들 가용 영역 2개"
  type        = list(string)
  validation {
    condition     = length(var.availability_zones) == 2
    error_message = "가용 영역은 정확히 2개를 지정한다."
  }
}

variable "single_nat_gateway" {
  description = "true면 NAT 게이트웨이를 하나만 둔다(dev 비용 절감). prod는 AZ마다 하나씩(false)."
  type        = bool
  default     = false
}

variable "enable_nat_gateway" {
  description = "false면 NAT 게이트웨이를 만들지 않는다(dev 비용 절감). 그때 ECS 태스크는 공개 서브넷에서 공인 IP로 밖에 나간다. prod는 true."
  type        = bool
  default     = true
}

variable "flow_log_retention_days" {
  type    = number
  default = 90
}

variable "kms_key_arn" {
  description = "VPC Flow Logs 로그 그룹 암호화 키"
  type        = string
}
