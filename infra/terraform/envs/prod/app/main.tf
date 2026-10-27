# pmcs-prod 앱 인프라: 네트워크 → RDS → ECR/ECS → ALB/WAF → Secrets/IAM/로그.
# 2026-10-22~23 에 검증한 ECS dev(git 7494501 의 envs/dev/app)를 바탕으로 한 "필수 보안형"(2026-10-22 결정):
#   NAT 없이 태스크를 공개 서브넷 + 공인 IP 로 두고(들어오는 연결은 ALB 보안 그룹만), Fargate 일반형(Spot 아님),
#   WAF 켬, RDS 단일 AZ + 백업 14일(PITR) + 삭제 방지. Multi-AZ·NAT 는 고객사가 요구할 때 켠다.
# security·dns 루트와는 상태를 공유하지 않는다(dns 영역은 이름으로 찾는다).

locals {
  name_prefix = "pmcs-prod"
  azs         = ["ap-northeast-2a", "ap-northeast-2c"]

  api_port      = 4000
  frontend_port = 3000

  # RDS CA 번들 경로 (PR #94에서 이미지에 포함)
  rds_ca_file = "/app/apps/backend/certs/rds-global-bundle.pem"

  log_retention_days = 90

  # Graviton(ARM64): 같은 사양에서 x86보다 약 20% 저렴하다(서울 vCPU $0.03725/h vs $0.04656/h).
  # 이미지는 linux/arm64로 빌드한다 — Apple Silicon Mac에서는 기본값, CI는 ubuntu-24.04-arm 러너.
  cpu_architecture = "ARM64"
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# ── 앱 데이터 암호화 키: RDS, 시크릿, ECR, 로그, 운영 알림 토픽 ──────────────

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

  # 운영 알림 토픽(modules/ops-alarms)이 이 키로 암호화된다. 알람이 메일을 보내려면 CloudWatch 가 키를 써야 한다.
  statement {
    sid       = "CloudWatchAlarmsToEncryptedTopic"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey*"]
    resources = ["*"]
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
}

resource "aws_kms_key" "app" {
  description             = "${local.name_prefix} app data (RDS, secrets, ECR, logs, ops alerts)"
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
  vpc_cidr           = "10.40.0.0/16" # dev ECS 10.20, dev 서버 10.30 과 겹치지 않게
  availability_zones = local.azs
  # NAT 없이 시작한다(월 약 $45~90 절감). ECS 태스크는 공개 서브넷에서 공인 IP 로 밖에 나가고,
  # 들어오는 연결은 보안 그룹이 ALB 에서 오는 것만 허용한다. 고객사가 요구하면 켜고 태스크를 비공개 서브넷으로 옮긴다.
  enable_nat_gateway = false
  kms_key_arn        = aws_kms_key.app.arn
}

# ── 이미지 저장소 ───────────────────────────────────────────────────

module "ecr" {
  source = "../../../modules/ecr"

  name_prefix  = local.name_prefix
  repositories = ["api", "frontend"]
  kms_key_arn  = aws_kms_key.app.arn
}
