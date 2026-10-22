variable "name_prefix" {
  type = string
}

variable "name" {
  description = "서비스 이름 (예: api, frontend)"
  type        = string
}

variable "cluster_arn" {
  type = string
}

variable "image" {
  description = "ECR 이미지 주소:태그"
  type        = string
}

variable "cpu" {
  description = "Fargate vCPU 단위 (256 = 0.25 vCPU)"
  type        = number
}

variable "memory" {
  description = "MiB"
  type        = number
}

variable "cpu_architecture" {
  type    = string
  default = "X86_64"
}

variable "container_port" {
  description = "null이면 포트를 열지 않는다(마이그레이션처럼 한 번 돌고 끝나는 태스크)."
  type        = number
  default     = null
}

variable "command" {
  description = "이미지의 CMD를 덮어쓸 명령. null이면 이미지 기본값."
  type        = list(string)
  default     = null
}

variable "user" {
  description = "컨테이너 실행 사용자. root로 돌지 않게 node(uid 1000)를 준다."
  type        = string
  default     = "node"
}

variable "environment" {
  description = "비밀이 아닌 환경 변수"
  type        = map(string)
  default     = {}
}

variable "secrets" {
  description = "환경 변수 이름 → Secrets Manager valueFrom(시크릿 ARN 또는 ARN:JSON키::)"
  type        = map(string)
  default     = {}
}

variable "secret_arns" {
  description = "실행 역할이 읽을 수 있는 시크릿 ARN 목록 (secrets에서 쓰는 것만)"
  type        = list(string)
  default     = []
}

variable "kms_key_arn" {
  description = "시크릿·로그 그룹 암호화 키"
  type        = string
}

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "create_service" {
  description = "false면 작업 정의만 만든다(run-task로 실행하는 마이그레이션용)."
  type        = bool
  default     = true
}

variable "desired_count" {
  description = "이미지를 ECR에 올리기 전에는 0으로 둔다."
  type        = number
  default     = 0
}

variable "assign_public_ip" {
  description = "공개 서브넷에서 NAT 없이 밖에 나갈 때만 true(dev 비용 절감). 들어오는 연결은 보안 그룹이 막는다."
  type        = bool
  default     = false
}

variable "use_fargate_spot" {
  description = "true면 FARGATE_SPOT으로 띄운다(최대 70% 저렴, 가끔 교체됨). dev 전용. 클러스터에 FARGATE_SPOT 용량 공급자가 있어야 한다."
  type        = bool
  default     = false
}

variable "subnet_ids" {
  type    = list(string)
  default = []
}

variable "security_group_ids" {
  type    = list(string)
  default = []
}

variable "target_group_arn" {
  description = "ALB 대상 그룹. null이면 로드 밸런서에 붙이지 않는다."
  type        = string
  default     = null
}

variable "health_check_grace_period_seconds" {
  type    = number
  default = 60
}

variable "service_connect" {
  description = <<-EOT
    ECS Service Connect 설정. null이면 사용하지 않는다.
    discovery_name이 있으면 다른 서비스가 http://<discovery_name>:<container_port> 로 이 서비스를 부를 수 있고,
    없으면 다른 서비스를 부르기만 하는 클라이언트로 참여한다.
  EOT
  type = object({
    namespace_arn  = string
    discovery_name = optional(string)
  })
  default = null
}

variable "enable_execute_command" {
  description = "ECS Exec(SSM 경유 셸) 허용. 세션은 클러스터 설정에 따라 암호화·기록된다."
  type        = bool
  default     = false
}

variable "execute_command_log_group_arn" {
  type    = string
  default = null
}

variable "execute_command_kms_key_arn" {
  type    = string
  default = null
}
