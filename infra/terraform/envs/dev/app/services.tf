# ── 이미지 저장소 ───────────────────────────────────────────────────

module "ecr" {
  source = "../../../modules/ecr"

  name_prefix  = local.name_prefix
  repositories = ["api", "frontend"]
  kms_key_arn  = aws_kms_key.app.arn
}

# ── 시크릿 (값은 Terraform 밖에서 콘솔로 입력한다. 상태·코드에 남지 않게) ─────
# pmcs-dev/api  : JSON {DATABASE_URL, MIGRATE_DATABASE_URL, RECEIVER_API_KEY, CRITICAL_FAULT_WEBHOOK_URL}
# pmcs-dev/jwt  : JSON {JWT_SECRET}  (백엔드 JWT_SECRET = 프론트 AUTH_JWT_SECRET)
# 키가 하나라도 빠지면 태스크가 시작되지 않는다. 웹훅을 안 쓰면 빈 문자열로 둔다.

resource "aws_secretsmanager_secret" "api" {
  name                    = "${local.name_prefix}/api"
  description             = "API runtime secrets: DATABASE_URL, MIGRATE_DATABASE_URL, RECEIVER_API_KEY, CRITICAL_FAULT_WEBHOOK_URL"
  kms_key_id              = aws_kms_key.app.arn
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret" "jwt" {
  name                    = "${local.name_prefix}/jwt"
  description             = "JWT signing secret shared by the API (JWT_SECRET) and the frontend middleware (AUTH_JWT_SECRET)"
  kms_key_id              = aws_kms_key.app.arn
  recovery_window_in_days = 7
}

# ── ECS 클러스터 ────────────────────────────────────────────────────

resource "aws_service_discovery_http_namespace" "this" {
  name        = "${local.name_prefix}.internal"
  description = "ECS Service Connect namespace (frontend -> api)"
}

resource "aws_cloudwatch_log_group" "ecs_exec" {
  name              = "/ecs/${local.name_prefix}/exec-sessions"
  retention_in_days = 90
  kms_key_id        = aws_kms_key.app.arn
}

resource "aws_ecs_cluster" "this" {
  name = local.name_prefix

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  # ECS Exec 세션은 KMS로 암호화하고, 입력한 명령과 출력을 로그로 남긴다.
  configuration {
    execute_command_configuration {
      kms_key_id = aws_kms_key.app.arn
      logging    = "OVERRIDE"

      log_configuration {
        cloud_watch_encryption_enabled = true
        cloud_watch_log_group_name     = aws_cloudwatch_log_group.ecs_exec.name
      }
    }
  }

  service_connect_defaults {
    namespace = aws_service_discovery_http_namespace.this.arn
  }
}

# ── API ─────────────────────────────────────────────────────────────

locals {
  api_image = "${module.ecr.repository_urls["api"]}:${var.api_image_tag}"

  # 도메인이 정해지기 전에는 CORS 허용 목록에 쓸 실제 주소가 없다. 브라우저는 BFF(같은 출처)로만
  # API를 부르므로 동작에는 영향이 없고, 도메인이 정해지면 실제 app 주소로 바뀐다.
  frontend_origin = var.app_hostname != null ? "https://${var.app_hostname}" : "https://app-dev.invalid"
}

module "api" {
  source = "../../../modules/ecs-service"

  name_prefix = local.name_prefix
  name        = "api"
  cluster_arn = aws_ecs_cluster.this.arn
  image       = local.api_image
  cpu         = 512
  memory      = 1024

  cpu_architecture = local.cpu_architecture

  container_port = local.api_port
  # Railway용 Dockerfile CMD(부팅 시 마이그레이션)를 쓰지 않고 서버만 띄운다.
  # 마이그레이션은 아래 api-migrate 태스크로 따로 실행한다.
  command = ["node", "apps/backend/dist/src/index.js"]

  environment = {
    NODE_ENV             = "production"
    HOST                 = "0.0.0.0"
    PORT                 = tostring(local.api_port)
    FRONTEND_ORIGIN      = local.frontend_origin
    TRUST_PROXY_HOPS     = "1"
    WS_PING_INTERVAL_MS  = "30000"
    WS_REQUIRE_AUTH      = "true"
    DATABASE_SSL_CA_FILE = local.rds_ca_file
    DATABASE_POOL_MAX    = "10"
    LOG_LEVEL            = "info"
  }
  secrets = {
    DATABASE_URL               = "${aws_secretsmanager_secret.api.arn}:DATABASE_URL::"
    RECEIVER_API_KEY           = "${aws_secretsmanager_secret.api.arn}:RECEIVER_API_KEY::"
    CRITICAL_FAULT_WEBHOOK_URL = "${aws_secretsmanager_secret.api.arn}:CRITICAL_FAULT_WEBHOOK_URL::"
    JWT_SECRET                 = "${aws_secretsmanager_secret.jwt.arn}:JWT_SECRET::"
  }
  secret_arns = [aws_secretsmanager_secret.api.arn, aws_secretsmanager_secret.jwt.arn]
  kms_key_arn = aws_kms_key.app.arn

  subnet_ids         = module.network.private_subnet_ids
  security_group_ids = [aws_security_group.api.id]
  desired_count      = var.api_desired_count
  # HTTPS 리스너가 없으면 대상 그룹이 ALB에 붙지 않아 서비스에 연결할 수 없다.
  target_group_arn = module.edge.tls_enabled ? module.edge.api_target_group_arn : null

  service_connect = {
    namespace_arn  = aws_service_discovery_http_namespace.this.arn
    discovery_name = "api"
  }

  enable_execute_command        = true
  execute_command_log_group_arn = aws_cloudwatch_log_group.ecs_exec.arn
  execute_command_kms_key_arn   = aws_kms_key.app.arn

  log_retention_days = local.log_retention_days
}

# 마이그레이션 전용 작업 정의 (서비스 없음). 배포 때 run-task로 한 번 실행한다.
# MIGRATE_DATABASE_URL은 스키마 변경 권한이 있는 계정으로, sslmode=verify-full과
# sslrootcert(위 CA 파일)를 넣는다 — Prisma 마이그레이션 엔진은 DATABASE_SSL_CA_FILE을 읽지 않는다.
module "api_migrate" {
  source = "../../../modules/ecs-service"

  name_prefix      = local.name_prefix
  name             = "api-migrate"
  cluster_arn      = aws_ecs_cluster.this.arn
  image            = local.api_image
  cpu              = 256
  memory           = 512
  cpu_architecture = local.cpu_architecture
  create_service   = false
  command          = ["sh", "-c", "cd apps/backend && npx prisma migrate deploy"]

  environment = {
    NODE_ENV = "production"
  }
  secrets = {
    DATABASE_URL = "${aws_secretsmanager_secret.api.arn}:MIGRATE_DATABASE_URL::"
  }
  secret_arns = [aws_secretsmanager_secret.api.arn]
  kms_key_arn = aws_kms_key.app.arn

  log_retention_days = local.log_retention_days
}

# ── 프론트엔드 ──────────────────────────────────────────────────────

module "frontend" {
  source = "../../../modules/ecs-service"

  name_prefix = local.name_prefix
  name        = "frontend"
  cluster_arn = aws_ecs_cluster.this.arn
  image       = "${module.ecr.repository_urls["frontend"]}:${var.frontend_image_tag}"
  cpu         = 512
  memory      = 1024

  cpu_architecture = local.cpu_architecture

  container_port = local.frontend_port

  environment = {
    # BFF가 서버에서 API를 부를 주소 (Service Connect)
    API_BASE_INTERNAL  = "http://api:${local.api_port}"
    TRUSTED_PROXY_HOPS = "1"
  }
  secrets = {
    AUTH_JWT_SECRET = "${aws_secretsmanager_secret.jwt.arn}:JWT_SECRET::"
  }
  secret_arns = [aws_secretsmanager_secret.jwt.arn]
  kms_key_arn = aws_kms_key.app.arn

  subnet_ids         = module.network.private_subnet_ids
  security_group_ids = [aws_security_group.frontend.id]
  desired_count      = var.frontend_desired_count
  target_group_arn   = module.edge.tls_enabled ? module.edge.frontend_target_group_arn : null

  service_connect = {
    namespace_arn = aws_service_discovery_http_namespace.this.arn
  }

  log_retention_days = local.log_retention_days
}
