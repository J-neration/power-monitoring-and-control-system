# Fargate 서비스 하나(또는 작업 정의만). 실행 역할은 자기 시크릿만 읽고,
# 태스크 역할은 ECS Exec을 켠 경우에만 SSM 채널 권한을 갖는다.

data "aws_region" "current" {}

locals {
  full_name = "${var.name_prefix}-${var.name}"
  has_port  = var.container_port != null

  container = {
    name                   = var.name
    image                  = var.image
    essential              = true
    user                   = var.user
    command                = var.command
    readonlyRootFilesystem = false
    portMappings = local.has_port ? [{
      name          = "http"
      containerPort = var.container_port
      protocol      = "tcp"
      appProtocol   = "http"
    }] : []
    environment = [for k in sort(keys(var.environment)) : { name = k, value = var.environment[k] }]
    secrets     = [for k in sort(keys(var.secrets)) : { name = k, valueFrom = var.secrets[k] }]
    linuxParameters = {
      initProcessEnabled = true
    }
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.this.name
        awslogs-region        = data.aws_region.current.region
        awslogs-stream-prefix = var.name
      }
    }
  }
}

resource "aws_cloudwatch_log_group" "this" {
  name              = "/ecs/${var.name_prefix}/${var.name}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn
}

# ── 실행 역할: 이미지 pull, 로그 쓰기, 자기 시크릿 읽기 ─────────────────

data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${local.full_name}-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

# ECR pull + 로그 쓰기. GuardDuty 런타임 감시 사이드카 이미지(AWS 소유 ECR)도 이 권한으로 받는다.
resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "execution_secrets" {
  count = length(var.secret_arns) > 0 ? 1 : 0

  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = var.secret_arns
  }

  statement {
    actions   = ["kms:Decrypt"]
    resources = [var.kms_key_arn]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["secretsmanager.${data.aws_region.current.region}.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "execution_secrets" {
  count  = length(var.secret_arns) > 0 ? 1 : 0
  name   = "read-own-secrets"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution_secrets[0].json
}

# ── 태스크 역할: 앱 코드가 쓰는 AWS 권한 (현재는 ECS Exec만) ───────────

resource "aws_iam_role" "task" {
  name               = "${local.full_name}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

data "aws_iam_policy_document" "task_exec" {
  count = var.enable_execute_command ? 1 : 0

  statement {
    actions = [
      "ssmmessages:CreateControlChannel",
      "ssmmessages:CreateDataChannel",
      "ssmmessages:OpenControlChannel",
      "ssmmessages:OpenDataChannel",
    ]
    resources = ["*"]
  }

  statement {
    actions   = ["kms:Decrypt"]
    resources = [var.execute_command_kms_key_arn]
  }

  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"]
    resources = ["${var.execute_command_log_group_arn}:*"]
  }

  statement {
    actions   = ["logs:DescribeLogGroups"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "task_exec" {
  count  = var.enable_execute_command ? 1 : 0
  name   = "ecs-exec"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task_exec[0].json
}

# ── 작업 정의와 서비스 ───────────────────────────────────────────────

resource "aws_ecs_task_definition" "this" {
  family                   = local.full_name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  container_definitions = jsonencode([
    { for k, v in local.container : k => v if v != null }
  ])
}

resource "aws_ecs_service" "this" {
  count = var.create_service ? 1 : 0

  name                    = local.full_name
  cluster                 = var.cluster_arn
  task_definition         = aws_ecs_task_definition.this.arn
  desired_count           = var.desired_count
  launch_type             = "FARGATE"
  platform_version        = "LATEST"
  enable_execute_command  = var.enable_execute_command
  propagate_tags          = "SERVICE"
  enable_ecs_managed_tags = true

  health_check_grace_period_seconds = var.target_group_arn != null ? var.health_check_grace_period_seconds : null

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = var.security_group_ids
    assign_public_ip = false
  }

  # 새 버전이 뜨지 못하면 배포를 멈추고 이전 버전으로 되돌린다.
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  dynamic "load_balancer" {
    for_each = var.target_group_arn != null ? [1] : []
    content {
      target_group_arn = var.target_group_arn
      container_name   = var.name
      container_port   = var.container_port
    }
  }

  dynamic "service_connect_configuration" {
    for_each = var.service_connect != null ? [var.service_connect] : []
    content {
      enabled   = true
      namespace = service_connect_configuration.value.namespace_arn

      dynamic "service" {
        for_each = service_connect_configuration.value.discovery_name != null ? [service_connect_configuration.value.discovery_name] : []
        content {
          port_name      = "http"
          discovery_name = service.value
          client_alias {
            port     = var.container_port
            dns_name = service.value
          }
        }
      }
    }
  }
}
