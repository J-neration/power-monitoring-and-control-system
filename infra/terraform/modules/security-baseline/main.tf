# 계정 단위 보안 기반. 고객사 보안 심사의 "감사 로그·침해 탐지·구성 점검" 항목을 맡는다.
#   - CloudTrail: 모든 리전의 관리 이벤트 → 잠긴(Object Lock) S3 + CloudWatch Logs
#   - GuardDuty: 위협 탐지 (S3, RDS 로그인, ECS Fargate 런타임)
#   - Security Hub: AWS 기본 보안 표준(FSBP)으로 구성 점검
#   - AWS Config: Security Hub 점검의 근거가 되는 구성 기록
#   - 경보: GuardDuty·Security Hub의 높은 심각도 결과 → SNS
#   - 무료 계정 설정: EBS 기본 암호화, 계정 단위 S3 퍼블릭 차단, IAM Access Analyzer

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_partition" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.region
  partition  = data.aws_partition.current.partition

  trail_name = "${var.name_prefix}-trail"
  # 트레일 ARN을 미리 계산해 두면 버킷·키 정책과 트레일 사이의 순환 참조가 생기지 않는다.
  trail_arn = "arn:${local.partition}:cloudtrail:${local.region}:${local.account_id}:trail/${local.trail_name}"
}

# ── 계정 기본 보호 (무료) ────────────────────────────────────────────

resource "aws_ebs_encryption_by_default" "this" {
  enabled = true
}

resource "aws_s3_account_public_access_block" "this" {
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_accessanalyzer_analyzer" "account" {
  analyzer_name = "${var.name_prefix}-access-analyzer"
  type          = "ACCOUNT"
}
