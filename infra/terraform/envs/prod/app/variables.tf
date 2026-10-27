variable "app_hostname" {
  description = "브라우저용 주소. 컷오버 후 사용자가 들어오는 주소(지금 Netlify 운영 화면과 같은 주소)."
  type        = string
}

variable "app_alias_hostnames" {
  description = "app 과 똑같이 서비스할 추가 주소. 컷오버 전에는 apex 가 Netlify 를 가리키므로 리허설은 여기로 한다."
  type        = list(string)
  default     = []
}

variable "redirect_hostnames" {
  description = "app_hostname 으로 301 리디렉트할 주소 (www)"
  type        = list(string)
  default     = []
}

variable "api_hostname" {
  description = "HMI 수신용 주소. 현장 장비는 Railway 중계를 거쳐 여기로 온다."
  type        = string
}

variable "dns_zone_name" {
  description = "dns 루트가 만든 Route 53 영역"
  type        = string
}

variable "api_image_tag" {
  description = "ECR pmcs-prod/api 이미지 태그 (첫 이미지를 올린 뒤 지정)"
  type        = string
  default     = "initial"
}

variable "frontend_image_tag" {
  type    = string
  default = "initial"
}

variable "api_desired_count" {
  description = "이미지와 시크릿 값이 준비되기 전에는 0 (태스크 비용 없음). 0 이면 서비스 상태 알람도 만들지 않는다."
  type        = number
  default     = 0
}

variable "frontend_desired_count" {
  type    = number
  default = 0
}

variable "receiver_rate_limit" {
  description = "IP당 5분 동안 허용하는 /receiver 요청 수 (WAF). 현장 장비는 Railway 중계 IP 몇 개로 모여 들어온다."
  type        = number
  default     = 600
}

variable "global_rate_limit" {
  description = "IP당 5분 동안 허용하는 전체 요청 수 (WAF)"
  type        = number
  default     = 2000
}

# 태스크 크기 (Fargate 조합: 256 CPU → 512/1024/2048 MB, 512 CPU → 1024~4096 MB).
variable "api_cpu" {
  type    = number
  default = 512
}

variable "api_memory" {
  type    = number
  default = 1024
}

variable "frontend_cpu" {
  type    = number
  default = 512
}

variable "frontend_memory" {
  type    = number
  default = 1024
}
