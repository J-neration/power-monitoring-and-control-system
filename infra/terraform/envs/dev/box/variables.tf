variable "app_hosts" {
  description = "브라우저용 주소 목록. 가비아에서 이 서버의 고정 IP(A 레코드)를 가리켜야 Caddy 가 인증서를 받는다."
  type        = list(string)
}

variable "api_hosts" {
  description = "HMI 수신용 주소 목록 (/receiver 만 연다)"
  type        = list(string)
}

variable "initial_image_tag" {
  description = <<-EOT
    SSM 파라미터 image-tag 의 첫 값이자, 파라미터를 못 읽을 때 쓰는 이미지 태그(<커밋>-arm64).
    평소 배포 태그는 CI 와 scripts/dev-box/deploy.sh 가 파라미터에 쓴다. 이 값을 바꿔도 배포되지 않는다.
  EOT
  type        = string
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
