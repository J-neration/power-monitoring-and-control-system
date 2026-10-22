variable "app_hosts" {
  description = "브라우저용 주소 목록. 가비아에서 이 서버의 고정 IP(A 레코드)를 가리켜야 Caddy 가 인증서를 받는다."
  type        = list(string)
}

variable "api_hosts" {
  description = "HMI 수신용 주소 목록 (/receiver 만 연다)"
  type        = list(string)
}

variable "api_image_tag" {
  description = "ECR pmcs-dev/api 이미지 태그 (<커밋>-arm64)"
  type        = string
}

variable "frontend_image_tag" {
  type = string
}

variable "instance_type" {
  description = "Graviton(ARM64) 인스턴스. 이미지가 linux/arm64 라서 t4g 계열만 쓴다."
  type        = string
  default     = "t4g.small"
}

variable "backup_retention_days" {
  description = "S3 의 매일 DB 백업을 며칠 남길지"
  type        = number
  default     = 14
}
