# 운영 알람: 알림 토픽(메일) + EC2 상태 검사 + 로그 지표 알람 + 일반 지표 알람.
# dev(서버 1대)와 prod(ECS·ALB·RDS)가 같은 모듈을 쓰고, 넘기는 감시 대상만 다르다.
# 알람이 울릴 때와 정상으로 돌아올 때 모두 메일을 보낸다.

variable "name_prefix" {
  type = string
}

variable "alert_emails" {
  description = "알림 받을 메일 주소. 구독마다 확인 메일이 가며, 링크를 눌러야 받기 시작한다."
  type        = list(string)
  default     = []
}

variable "kms_key_arn" {
  description = <<-EOT
    토픽 암호화 키. null 이면 암호화하지 않는다(dev). 키를 쓰면 키 정책이 cloudwatch.amazonaws.com 의
    kms:Decrypt·kms:GenerateDataKey* 를 허용해야 알람이 메일을 보낼 수 있다(AWS 관리형 aws/sns 키는 안 됨).
  EOT
  type        = string
  default     = null
}

variable "ec2_instances" {
  description = "상태 검사를 감시할 EC2 (이름 → 인스턴스 ID). 하드웨어 쪽 검사가 실패하면 자동 복구(recover)도 한다."
  type        = map(string)
  default     = {}
}

variable "log_metric_alarms" {
  description = <<-EOT
    로그 지표 필터 + 알람 (이름 → 설정). 지표는 네임스페이스 PMCS/<name_prefix>, 이름 = 키.
    pattern 은 CloudWatch 필터 문법, value 는 "1" 이나 "$.stale" 같은 JSON 필드.
  EOT
  type = map(object({
    log_group_name     = string
    pattern            = string
    value              = optional(string, "1")
    statistic          = optional(string, "Sum")
    threshold          = number
    period             = optional(number, 300)
    evaluation_periods = optional(number, 1)
    treat_missing_data = optional(string, "notBreaching")
    description        = string
  }))
  default = {}
}

variable "metric_alarms" {
  description = "이미 있는 지표에 거는 알람 (이름 → 설정). 값이 들어오지 않는 것도 이상으로 보려면 treat_missing_data = breaching."
  type = map(object({
    namespace           = string
    metric_name         = string
    dimensions          = optional(map(string), {})
    statistic           = optional(string, "Minimum")
    comparison_operator = string
    threshold           = number
    period              = optional(number, 300)
    evaluation_periods  = optional(number, 2)
    treat_missing_data  = optional(string, "breaching")
    description         = string
  }))
  default = {}
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  namespace = "PMCS/${var.name_prefix}"
  actions   = [aws_sns_topic.ops.arn]
}

resource "aws_sns_topic" "ops" {
  name              = "${var.name_prefix}-ops-alerts"
  kms_master_key_id = var.kms_key_arn
}

# 이 계정의 CloudWatch 알람만 보낼 수 있다.
data "aws_iam_policy_document" "ops" {
  statement {
    sid       = "CloudWatchAlarms"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.ops.arn]
    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.ops.arn]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_sns_topic_policy" "ops" {
  arn    = aws_sns_topic.ops.arn
  policy = data.aws_iam_policy_document.ops.json
}

resource "aws_sns_topic_subscription" "email" {
  for_each  = toset(var.alert_emails)
  topic_arn = aws_sns_topic.ops.arn
  protocol  = "email"
  endpoint  = each.value
}

# ── EC2 상태 검사 ─────────────────────────────────────────────────
# 시스템 검사(AWS 하드웨어·네트워크) 실패 → 다른 호스트로 자동 복구. 같은 IP·볼륨으로 다시 켜진다.
resource "aws_cloudwatch_metric_alarm" "ec2_system" {
  for_each            = var.ec2_instances
  alarm_name          = "${var.name_prefix}-${each.key}-system-check"
  alarm_description   = "${each.key}: AWS 쪽 하드웨어·네트워크 문제로 서버가 응답하지 않습니다. 자동 복구를 시작합니다."
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed_System"
  dimensions          = { InstanceId = each.value }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  treat_missing_data  = "missing"
  alarm_actions       = concat(local.actions, ["arn:aws:automate:${data.aws_region.current.region}:ec2:recover"])
  ok_actions          = local.actions
}

# 인스턴스 검사(운영체제 멈춤·메모리 부족 등) 실패 → 알림만. 원인을 보고 사람이 재시작한다.
resource "aws_cloudwatch_metric_alarm" "ec2_instance" {
  for_each            = var.ec2_instances
  alarm_name          = "${var.name_prefix}-${each.key}-instance-check"
  alarm_description   = "${each.key}: 서버 운영체제가 응답하지 않습니다(멈춤·메모리 부족 등)."
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed_Instance"
  dimensions          = { InstanceId = each.value }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 3
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  treat_missing_data  = "missing"
  alarm_actions       = local.actions
  ok_actions          = local.actions
}

# ── 로그 지표 ─────────────────────────────────────────────────────
resource "aws_cloudwatch_log_metric_filter" "this" {
  for_each       = var.log_metric_alarms
  name           = "${var.name_prefix}-${each.key}"
  log_group_name = each.value.log_group_name
  pattern        = each.value.pattern
  metric_transformation {
    namespace = local.namespace
    name      = each.key
    value     = each.value.value
    unit      = "Count"
  }
}

resource "aws_cloudwatch_metric_alarm" "log" {
  for_each            = var.log_metric_alarms
  alarm_name          = "${var.name_prefix}-${each.key}"
  alarm_description   = each.value.description
  namespace           = local.namespace
  metric_name         = each.key
  statistic           = each.value.statistic
  period              = each.value.period
  evaluation_periods  = each.value.evaluation_periods
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = each.value.threshold
  treat_missing_data  = each.value.treat_missing_data
  alarm_actions       = local.actions
  ok_actions          = local.actions
  depends_on          = [aws_cloudwatch_log_metric_filter.this]
}

# ── 일반 지표 ─────────────────────────────────────────────────────
resource "aws_cloudwatch_metric_alarm" "metric" {
  for_each            = var.metric_alarms
  alarm_name          = "${var.name_prefix}-${each.key}"
  alarm_description   = each.value.description
  namespace           = each.value.namespace
  metric_name         = each.value.metric_name
  dimensions          = each.value.dimensions
  statistic           = each.value.statistic
  period              = each.value.period
  evaluation_periods  = each.value.evaluation_periods
  comparison_operator = each.value.comparison_operator
  threshold           = each.value.threshold
  treat_missing_data  = each.value.treat_missing_data
  alarm_actions       = local.actions
  ok_actions          = local.actions
}

output "topic_arn" {
  value = aws_sns_topic.ops.arn
}

output "metric_namespace" {
  description = "로그 지표가 쌓이는 네임스페이스"
  value       = local.namespace
}
