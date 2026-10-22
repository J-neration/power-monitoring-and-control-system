# 구성 점검. AWS 기본 보안 표준(FSBP)을 켜고, 고객사가 요구하면 CIS도 켠다.

# Security Hub 점검은 Config 기록을 근거로 하므로 enable_config 와 함께 켜고 끈다.
resource "aws_securityhub_account" "this" {
  count                     = var.enable_security_hub ? 1 : 0
  enable_default_standards  = false
  control_finding_generator = "SECURITY_CONTROL"
  auto_enable_controls      = true
}

resource "aws_securityhub_standards_subscription" "fsbp" {
  count         = var.enable_security_hub ? 1 : 0
  standards_arn = "arn:${local.partition}:securityhub:${local.region}::standards/aws-foundational-security-best-practices/v/1.0.0"

  depends_on = [aws_securityhub_account.this]
}

resource "aws_securityhub_standards_subscription" "cis" {
  count         = var.enable_security_hub && var.enable_cis_standard ? 1 : 0
  standards_arn = "arn:${local.partition}:securityhub:${local.region}::standards/cis-aws-foundations-benchmark/v/3.0.0"

  depends_on = [aws_securityhub_account.this]
}
