# dev 자동 배포: GitHub Actions(.github/workflows/deploy-dev-box.yml)가 dev 병합 때 이미지를 ECR 에 올리고
# 이 서버에서 pmcs-deploy 를 실행한다. 장기 키 없이 GitHub OIDC 로 역할을 받는다.
#
# 배포할 이미지 태그는 SSM 파라미터 image-tag 가 정한다(api·frontend 공통, <커밋>-arm64).
# CI 와 scripts/dev-box/deploy.sh 가 값을 쓰고, Terraform 은 자리와 첫 값만 만든다(ignore_changes).
# 그래서 이미지를 바꿀 때 tfvars 를 고치거나 apply 할 필요가 없다.

locals {
  github_repo = "J-neration/power-monitoring-and-control-system"
}

resource "aws_ssm_parameter" "image_tag" {
  name        = "/${local.name_prefix}/box/image-tag"
  description = "Image tag deployed to the dev box (api and frontend). Written by CI and scripts/dev-box/deploy.sh"
  type        = "String"
  value       = var.initial_image_tag

  lifecycle {
    ignore_changes = [value]
  }
}

# 배포 역할이 서버에서 실행할 수 있는 유일한 명령. AWS-RunShellScript 를 허용하면 임의 명령을 root 로
# 돌릴 수 있으므로, 고정된 명령 하나만 있는 문서를 따로 둔다.
resource "aws_ssm_document" "deploy" {
  name            = "${local.name}-deploy"
  document_type   = "Command"
  document_format = "JSON"
  content = jsonencode({
    schemaVersion = "2.2"
    description   = "Run pmcs-deploy on the PMCS dev box"
    mainSteps = [{
      action = "aws:runShellScript"
      name   = "pmcsDeploy"
      inputs = {
        runCommand     = ["/usr/local/bin/pmcs-deploy"]
        timeoutSeconds = "900"
      }
    }]
  })
}

# ── GitHub OIDC ────────────────────────────────────────────────────
# 계정에 하나만 둘 수 있는 공급자다. prod 는 다른 계정(pmcs-prod)이라 거기서 따로 만든다.
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

# 이 저장소의 dev 브랜치에서 돈 워크플로만 역할을 받는다 (PR·다른 브랜치·포크는 불가).
data "aws_iam_policy_document" "deploy_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${local.github_repo}:ref:refs/heads/dev"]
    }
  }
}

resource "aws_iam_role" "deploy" {
  name                 = "${local.name_prefix}-github-deploy"
  description          = "GitHub Actions (dev branch) pushes images and deploys the dev box"
  assume_role_policy   = data.aws_iam_policy_document.deploy_assume.json
  max_session_duration = 3600
}

data "aws_iam_policy_document" "deploy" {
  statement {
    sid       = "EcrLogin"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
  statement {
    sid = "EcrPushAndScan"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:CompleteLayerUpload",
      "ecr:DescribeImages",
      "ecr:DescribeImageScanFindings",
      "ecr:GetDownloadUrlForLayer",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]
    resources = values(module.ecr.repository_arns)
  }
  statement {
    sid       = "ImageTag"
    actions   = ["ssm:GetParameter", "ssm:PutParameter"]
    resources = [aws_ssm_parameter.image_tag.arn]
  }
  statement {
    sid     = "RunDeployOnBox"
    actions = ["ssm:SendCommand"]
    resources = [
      aws_ssm_document.deploy.arn,
      aws_instance.box.arn,
    ]
  }
  # 아래 둘은 리소스 단위 권한을 지원하지 않는다 (읽기 전용).
  statement {
    sid       = "ReadCommandResult"
    actions   = ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations"]
    resources = ["*"]
  }
  statement {
    sid       = "FindBox"
    actions   = ["ec2:DescribeInstances"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "deploy" {
  name   = "deploy"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}
