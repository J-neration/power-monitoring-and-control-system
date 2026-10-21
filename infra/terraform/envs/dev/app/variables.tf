variable "app_hostname" {
  description = "브라우저용 주소 (예: app-dev.<회사도메인>). 회사 도메인이 정해지면 terraform.tfvars에 넣는다."
  type        = string
  default     = null
}

variable "api_hostname" {
  description = "HMI 수신용 주소 (예: api-dev.<회사도메인>)"
  type        = string
  default     = null
}

variable "api_image_tag" {
  description = "ECR pmcs-dev/api 이미지 태그 (3단계에서 첫 이미지를 올린 뒤 지정)"
  type        = string
  default     = "initial"
}

variable "frontend_image_tag" {
  type    = string
  default = "initial"
}

variable "api_desired_count" {
  description = "이미지와 시크릿 값이 준비되기 전에는 0 (태스크 비용 없음)"
  type        = number
  default     = 0
}

variable "frontend_desired_count" {
  type    = number
  default = 0
}
