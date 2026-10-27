# prod 자동 배포: GitHub Actions(.github/workflows/deploy-prod.yml)가 main 병합 때 이미지를 ECR 에 올리고,
# 승인(GitHub 환경 aws-prod)을 받은 뒤 scripts/aws-deploy/ecs-deploy.sh 로 마이그레이션·서비스 교체를 한다.
# 장기 키 없이 GitHub OIDC 로 역할을 받는다. 역할은 둘로 나눈다.
#   build  — main 브랜치에서 돈 실행. ECR 두 저장소에 이미지를 올리고 스캔 결과를 읽는 것만 한다.
#   deploy — GitHub 환경 aws-prod(승인 필요)에서 돈 실행. 작업 정의 등록·마이그레이션 실행·서비스 교체·태그 기록.
#
# 배포할 이미지 태그는 SSM 파라미터 image-tag 가 정한다(api·frontend 공통, <커밋>-arm64).
# 배포가 값을 쓰고, Terraform 은 그 값을 읽어 작업 정의를 만든다(자리와 첫 값만 만들고 ignore_changes).
# 배포는 이미지만 바꾼 새 작업 정의 버전을 등록하고, 작업 정의는 track_latest 로 최신 버전과 비교하므로
# 배포 뒤에도 plan 은 No changes 다.

locals {
  github_repo = "J-neration/power-monitoring-and-control-system"
  image_tag   = nonsensitive(aws_ssm_parameter.image_tag.value)

  # 배포가 새 버전을 등록하는 작업 정의(모두 이미지 태그를 따른다).
  deploy_task_modules = {
    api         = module.api
    frontend    = module.frontend
    api_migrate = module.api_migrate
    db_tunnel   = module.db_tunnel
  }
}

resource "aws_ssm_parameter" "image_tag" {
  name        = "/${local.name_prefix}/app/image-tag"
  description = "Image tag deployed to prod ECS (api and frontend). Written by CI and scripts/aws-deploy/ecs-deploy.sh"
  type        = "String"
  value       = var.initial_image_tag

  lifecycle {
    ignore_changes = [value]
  }
}

# ── GitHub OIDC ────────────────────────────────────────────────────
# 계정에 하나만 둘 수 있는 공급자다. dev(pmcs-dev)는 envs/dev/box/deploy.tf 에 따로 있다.
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_policy_document" "build_assume" {
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
    # main 브랜치에서 돈 실행만 (PR·다른 브랜치·포크는 불가).
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${local.github_repo}:ref:refs/heads/main"]
    }
  }
}

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
    # GitHub 환경 aws-prod 에서 돈 실행만. 그 환경은 승인자와 main 브랜치로 제한한다(README).
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${local.github_repo}:environment:aws-prod"]
    }
  }
}

resource "aws_iam_role" "github_build" {
  name                 = "${local.name_prefix}-github-build"
  description          = "GitHub Actions (main branch) pushes prod images to ECR"
  assume_role_policy   = data.aws_iam_policy_document.build_assume.json
  max_session_duration = 3600
}

resource "aws_iam_role" "github_deploy" {
  name                 = "${local.name_prefix}-github-deploy"
  description          = "GitHub Actions (environment aws-prod) deploys prod ECS"
  assume_role_policy   = data.aws_iam_policy_document.deploy_assume.json
  max_session_duration = 3600
}

data "aws_iam_policy_document" "github_build" {
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
}

resource "aws_iam_role_policy" "github_build" {
  name   = "build"
  role   = aws_iam_role.github_build.id
  policy = data.aws_iam_policy_document.github_build.json
}

data "aws_iam_policy_document" "github_deploy" {
  statement {
    sid       = "CheckImage"
    actions   = ["ecr:DescribeImages"]
    resources = values(module.ecr.repository_arns)
  }
  statement {
    sid       = "ImageTag"
    actions   = ["ssm:GetParameter", "ssm:PutParameter"]
    resources = [aws_ssm_parameter.image_tag.arn]
  }
  # 아래 셋은 리소스 단위 권한을 지원하지 않는다.
  statement {
    sid = "TaskDefinitions"
    actions = [
      "ecs:DescribeTaskDefinition",
      "ecs:RegisterTaskDefinition",
      "ecs:DeregisterTaskDefinition",
    ]
    resources = ["*"]
  }
  # 새 버전에 기존 태그(Project 등)를 그대로 붙인다. 등록할 때만 허용한다.
  statement {
    sid       = "TagNewTaskDefinitions"
    actions   = ["ecs:TagResource"]
    resources = ["arn:aws:ecs:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:task-definition/${local.name_prefix}-*:*"]
    condition {
      test     = "StringEquals"
      variable = "ecs:CreateAction"
      values   = ["RegisterTaskDefinition"]
    }
  }
  statement {
    sid       = "PassTaskRoles"
    actions   = ["iam:PassRole"]
    resources = flatten([for m in values(local.deploy_task_modules) : [m.execution_role_arn, m.task_role_arn]])
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }
  statement {
    sid       = "Services"
    actions   = ["ecs:DescribeServices", "ecs:UpdateService"]
    resources = [module.api.service_arn, module.frontend.service_arn]
  }
  statement {
    sid       = "RunMigration"
    actions   = ["ecs:RunTask"]
    resources = ["arn:aws:ecs:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:task-definition/${module.api_migrate.task_definition_family}:*"]
    condition {
      test     = "ArnEquals"
      variable = "ecs:cluster"
      values   = [aws_ecs_cluster.this.arn]
    }
  }
  statement {
    sid       = "WatchMigration"
    actions   = ["ecs:DescribeTasks"]
    resources = ["arn:aws:ecs:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:task/${aws_ecs_cluster.this.name}/*"]
  }
  statement {
    sid       = "MigrationLogs"
    actions   = ["logs:GetLogEvents"]
    resources = ["${module.api_migrate.log_group_arn}:*"]
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  name   = "deploy"
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.github_deploy.json
}
