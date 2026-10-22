# pmcs-dev 앱 인프라: 네트워크 → RDS → ECR/ECS → ALB/WAF → Secrets/IAM/로그.
# security 루트와는 상태를 공유하지 않는다(서로 독립적으로 plan·apply 가능).

locals {
  name_prefix = "pmcs-dev"
  azs         = ["ap-northeast-2a", "ap-northeast-2c"]

  api_port      = 4000
  frontend_port = 3000

  # RDS CA 번들 경로 (PR #94에서 이미지에 포함)
  rds_ca_file = "/app/apps/backend/certs/rds-global-bundle.pem"

  log_retention_days = 30

  # Graviton(ARM64): 같은 사양에서 x86보다 약 20% 저렴하다(서울 vCPU $0.03725/h vs $0.04656/h).
  # 이미지는 linux/arm64로 빌드한다 — Apple Silicon Mac에서는 기본값, CI는 ubuntu-24.04-arm 러너.
  # 백엔드는 네이티브 모듈이 없다(Prisma 7 queryCompiler + adapter-pg, bcryptjs, pg).
  cpu_architecture = "ARM64"
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# ── 앱 데이터 암호화 키: RDS, 시크릿, ECR, 로그 ─────────────────────────

data "aws_iam_policy_document" "app_key" {
  statement {
    sid       = "AccountAdministration"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }

  statement {
    sid = "CloudWatchLogs"
    actions = [
      "kms:Encrypt*",
      "kms:Decrypt*",
      "kms:ReEncrypt*",
      "kms:GenerateDataKey*",
      "kms:Describe*",
    ]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["logs.${data.aws_region.current.region}.amazonaws.com"]
    }
    condition {
      test     = "ArnLike"
      variable = "kms:EncryptionContext:aws:logs:arn"
      values   = ["arn:aws:logs:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:log-group:*"]
    }
  }
}

resource "aws_kms_key" "app" {
  description             = "${local.name_prefix} application data (RDS, secrets, ECR, logs)"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.app_key.json
}

resource "aws_kms_alias" "app" {
  name          = "alias/${local.name_prefix}-app"
  target_key_id = aws_kms_key.app.key_id
}

# ── 네트워크 ────────────────────────────────────────────────────────

module "network" {
  source = "../../../modules/network"

  name_prefix        = local.name_prefix
  vpc_cidr           = "10.20.0.0/16"
  availability_zones = local.azs
  # dev는 NAT 하나(월 약 $43 절감). prod는 AZ마다 하나.
  single_nat_gateway = true
  # dev 비용 절감(2026-10-22 결정): NAT 없이 ECS 태스크를 공개 서브넷에 두고 공인 IP로 밖에 나간다.
  # 들어오는 연결은 보안 그룹이 ALB에서 오는 것만 허용한다. prod는 비공개 서브넷 + NAT.
  enable_nat_gateway = false
  kms_key_arn        = aws_kms_key.app.arn
}
