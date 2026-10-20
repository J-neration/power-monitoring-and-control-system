# 위협 탐지. 기본(CloudTrail·VPC Flow·DNS 분석)에 더해 S3 데이터 이벤트, RDS 로그인·데이터 활동 이상,
# ECS Fargate 런타임 감시(에이전트는 GuardDuty가 사이드카로 자동 관리)를 켠다.

resource "aws_guardduty_detector" "this" {
  enable                       = true
  finding_publishing_frequency = "FIFTEEN_MINUTES"
}

resource "aws_guardduty_detector_feature" "s3" {
  detector_id = aws_guardduty_detector.this.id
  name        = "S3_DATA_EVENTS"
  status      = "ENABLED"
}

resource "aws_guardduty_detector_feature" "rds" {
  detector_id = aws_guardduty_detector.this.id
  name        = "RDS_LOGIN_EVENTS"
  status      = "ENABLED"

  # RDS 데이터 활동 감시: 쿼리 패턴으로 대량 조회·데이터 삭제·악성 IP 접근을 탐지한다.
  # GuardDuty가 RDS 보호와 함께 기본으로 켜는 기능이라 명시해 둔다(없으면 Terraform이 끄려 한다).
  additional_configuration {
    name   = "RDS_DATA_RISK"
    status = "ENABLED"
  }
}

resource "aws_guardduty_detector_feature" "runtime" {
  detector_id = aws_guardduty_detector.this.id
  name        = "RUNTIME_MONITORING"
  status      = "ENABLED"

  additional_configuration {
    name   = "ECS_FARGATE_AGENT_MANAGEMENT"
    status = "ENABLED"
  }
  # EC2·EKS는 쓰지 않으므로 에이전트 자동 관리를 끈다.
  additional_configuration {
    name   = "EC2_AGENT_MANAGEMENT"
    status = "DISABLED"
  }
  additional_configuration {
    name   = "EKS_ADDON_MANAGEMENT"
    status = "DISABLED"
  }
}
