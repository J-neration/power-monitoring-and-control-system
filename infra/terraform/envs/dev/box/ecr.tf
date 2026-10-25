# 이미지 저장소(ECR)와 그 암호화 키. 원래 app 루트(ECS dev)가 만들었고, ECS dev 를 없애면서
# 이 루트로 넘겼다(2026-10-23, import). 이미지가 이 키로 암호화돼 있어 키를 지우면 이미지를 못 받는다.
# 키 설명·정책은 넘겨받을 때 그대로 두었다(정책의 CloudWatch Logs 항목은 이제 쓰이지 않는다).

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

module "ecr" {
  source = "../../../modules/ecr"

  name_prefix  = local.name_prefix
  repositories = ["api", "frontend"]
  kms_key_arn  = aws_kms_key.app.arn
}
