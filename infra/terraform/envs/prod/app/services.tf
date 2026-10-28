# ── 시크릿 (값은 Terraform 밖에서 콘솔로 입력한다. 상태·코드에 남지 않게) ─────
# pmcs-prod/api  : JSON {DATABASE_URL, MIGRATE_DATABASE_URL, RECEIVER_API_KEY, CRITICAL_FAULT_WEBHOOK_URL}
#   RECEIVER_API_KEY 는 현장 HMI 펌웨어에 고정된 지금 Railway prod 값과 같아야 한다(중계가 키를 그대로 넘김).
# pmcs-prod/jwt  : JSON {JWT_SECRET}  (백엔드 JWT_SECRET = 프론트 AUTH_JWT_SECRET). 새로 발급한다.
# pmcs-prod/alert-mail : JSON {SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, ALERT_EMAIL_TO}
#   관리자 알림 메일. 수신자 주소가 들어가므로 공개 저장소(코드)가 아니라 시크릿에 둔다.
# 리허설 동안에는 복사한 고객 데이터로 알림이 나가지 않도록 웹훅·메일 값을 모두 빈 문자열로 두고,
# 컷오버 때 채운다(빈 SMTP 는 발송을 건너뛴다).
# 키가 하나라도 빠지면 태스크가 시작되지 않는다.

resource "aws_secretsmanager_secret" "api" {
  name                    = "${local.name_prefix}/api"
  description             = "API runtime secrets: DATABASE_URL, MIGRATE_DATABASE_URL, RECEIVER_API_KEY, CRITICAL_FAULT_WEBHOOK_URL"
  kms_key_id              = aws_kms_key.app.arn
  recovery_window_in_days = 30
}

resource "aws_secretsmanager_secret" "jwt" {
  name                    = "${local.name_prefix}/jwt"
  description             = "JWT signing secret shared by the API (JWT_SECRET) and the frontend middleware (AUTH_JWT_SECRET)"
  kms_key_id              = aws_kms_key.app.arn
  recovery_window_in_days = 30
}

# 사람이 터널로 데이터를 둘러볼 때 쓰는 조회 전용 DB 계정. 값은 scripts/aws-migrate/setup-readonly-role.sh 가 넣는다.
resource "aws_secretsmanager_secret" "db_readonly" {
  name                    = "${local.name_prefix}/db-readonly"
  description             = "Read-only DB login for people browsing data over the SSM tunnel: username, password, dbname"
  kms_key_id              = aws_kms_key.app.arn
  recovery_window_in_days = 30
}

resource "aws_secretsmanager_secret" "alert_mail" {
  name                    = "${local.name_prefix}/alert-mail"
  description             = "Admin alert mail over SMTP: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, ALERT_EMAIL_TO"
  kms_key_id              = aws_kms_key.app.arn
  recovery_window_in_days = 30
}

# ── ECS 클러스터 ────────────────────────────────────────────────────

resource "aws_service_discovery_http_namespace" "this" {
  name        = "${local.name_prefix}.internal"
  description = "ECS Service Connect namespace (frontend -> api)"
}

resource "aws_cloudwatch_log_group" "ecs_exec" {
  name              = "/ecs/${local.name_prefix}/exec-sessions"
  retention_in_days = 365
  kms_key_id        = aws_kms_key.app.arn
}

resource "aws_ecs_cluster" "this" {
  name = local.name_prefix

  # Container Insights는 지표당 과금이라 끈다(태스크 2개에 월 약 $20). 서비스 상태는 무료 지표
  # (AWS/ECS CPU·메모리, ALB 대상 그룹의 정상 대상 수)로 알람을 건다(alarms.tf).
  setting {
    name  = "containerInsights"
    value = "disabled"
  }

  # ECS Exec 세션은 KMS로 암호화하고, 입력한 명령과 출력을 로그로 남긴다.
  # prod 에서는 DB 터널 태스크만 Exec 를 쓴다(서비스 컨테이너에는 들어가지 않는다).
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

locals {
  # NAT 가 없으므로 태스크를 공개 서브넷에 두고 공인 IP 로 밖에 나간다(들어오는 연결은 보안 그룹이 막음).
  # 일회성 태스크(마이그레이션·DB 터널)도 scripts/aws-migrate 가 같은 서브넷을 고른다.
  task_subnet_ids       = module.network.public_subnet_ids
  task_assign_public_ip = true

  api_image      = "${module.ecr.repository_urls["api"]}:${local.image_tag}"
  frontend_image = "${module.ecr.repository_urls["frontend"]}:${local.image_tag}"

  # 컷오버 전 리허설은 app.pqms.co.kr 로 하므로 둘 다 허용한다. 브라우저는 BFF(같은 출처)로만 API 를 부른다.
  frontend_origins = join(",", [for h in concat([var.app_hostname], var.app_alias_hostnames) : "https://${h}"])
}

# ── API ─────────────────────────────────────────────────────────────

module "api" {
  source = "../../../modules/ecs-service"

  name_prefix = local.name_prefix
  name        = "api"
  cluster_arn = aws_ecs_cluster.this.arn
  image       = local.api_image
  cpu         = var.api_cpu
  memory      = var.api_memory

  cpu_architecture = local.cpu_architecture

  container_port = local.api_port
  # Railway용 Dockerfile CMD(부팅 시 마이그레이션)를 쓰지 않고 서버만 띄운다.
  # 마이그레이션은 아래 api-migrate 태스크로 따로 실행한다.
  command = ["node", "apps/backend/dist/src/index.js"]

  # AGGREGATION_ENABLED 는 코드 기본값(켜짐, Railway prod 와 같음).
  # DEVICE_FRESHNESS_CHECK_ENABLED: 30분 넘게 끊긴 설비를 관리자에게 메일로 알린다(코드 기본값도 켜짐).
  # 1시간마다 보내는 prime-parkinglot 은 메일 대상에서 빠져 있다(lib/moduleAlerts.ts, 1749c5d).
  # 서버가 새로 뜰 때 이미 끊겨 있는 설비는 한 번 더 메일이 간다(배포 때마다).
  environment = {
    NODE_ENV                       = "production"
    DEVICE_FRESHNESS_CHECK_ENABLED = "true"
    HOST                           = "0.0.0.0"
    PORT                           = tostring(local.api_port)
    FRONTEND_ORIGIN                = local.frontend_origins
    TRUST_PROXY_HOPS               = "1"
    WS_PING_INTERVAL_MS            = "30000"
    WS_REQUIRE_AUTH                = "true"
    DATABASE_SSL_CA_FILE           = local.rds_ca_file
    DATABASE_POOL_MAX              = "10"
    LOG_LEVEL                      = "info"
  }
  secrets = {
    DATABASE_URL               = "${aws_secretsmanager_secret.api.arn}:DATABASE_URL::"
    RECEIVER_API_KEY           = "${aws_secretsmanager_secret.api.arn}:RECEIVER_API_KEY::"
    CRITICAL_FAULT_WEBHOOK_URL = "${aws_secretsmanager_secret.api.arn}:CRITICAL_FAULT_WEBHOOK_URL::"
    JWT_SECRET                 = "${aws_secretsmanager_secret.jwt.arn}:JWT_SECRET::"
    SMTP_HOST                  = "${aws_secretsmanager_secret.alert_mail.arn}:SMTP_HOST::"
    SMTP_PORT                  = "${aws_secretsmanager_secret.alert_mail.arn}:SMTP_PORT::"
    SMTP_USER                  = "${aws_secretsmanager_secret.alert_mail.arn}:SMTP_USER::"
    SMTP_PASS                  = "${aws_secretsmanager_secret.alert_mail.arn}:SMTP_PASS::"
    SMTP_FROM                  = "${aws_secretsmanager_secret.alert_mail.arn}:SMTP_FROM::"
    ALERT_EMAIL_TO             = "${aws_secretsmanager_secret.alert_mail.arn}:ALERT_EMAIL_TO::"
  }
  secret_arns = [
    aws_secretsmanager_secret.api.arn,
    aws_secretsmanager_secret.jwt.arn,
    aws_secretsmanager_secret.alert_mail.arn,
  ]
  kms_key_arn = aws_kms_key.app.arn

  subnet_ids         = local.task_subnet_ids
  assign_public_ip   = local.task_assign_public_ip
  security_group_ids = [aws_security_group.api.id]
  desired_count      = var.api_desired_count
  target_group_arn   = module.edge.api_target_group_arn

  service_connect = {
    namespace_arn  = aws_service_discovery_http_namespace.this.arn
    discovery_name = "api"
  }

  log_retention_days = local.log_retention_days
}

# 마이그레이션 전용 작업 정의 (서비스 없음). 배포 때 run-task로 한 번 실행한다.
# MIGRATE_DATABASE_URL은 스키마 소유 계정(pmcs_migrator)으로, Prisma 마이그레이션 엔진의 검증 옵션
# sslmode=require&sslcert=<CA 파일>&sslaccept=strict 를 붙인다(scripts/aws-migrate/setup-db-roles.sh 가 만든다).
# 이 엔진은 DATABASE_SSL_CA_FILE을 읽지 않고, sslmode=verify-full·sslrootcert 는 무시해 검증이 되지 않는다.
# 또 sslcert 파일의 첫 인증서만 읽으므로 전체 묶음이 아닌 certs/rds-ap-northeast-2-rsa2048-g1.pem 을 쓴다.
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

# RDS 터널 전용 작업 정의 (서비스 없음). scripts/aws-migrate/open-db-tunnel.sh 가 run-task 로 띄우고
# SSM 포트 포워딩으로 Mac → RDS 를 잇는다(이전 복사·복구 테스트·조회용). 시크릿을 받지 않으며 1시간 뒤 스스로 끝난다.
# api 보안 그룹으로 실행되므로 RDS 5432 에만 닿는다.
module "db_tunnel" {
  source = "../../../modules/ecs-service"

  name_prefix      = local.name_prefix
  name             = "db-tunnel"
  cluster_arn      = aws_ecs_cluster.this.arn
  image            = local.api_image
  cpu              = 256
  memory           = 512
  cpu_architecture = local.cpu_architecture
  create_service   = false
  command          = ["sleep", "3600"]

  kms_key_arn = aws_kms_key.app.arn

  enable_execute_command        = true
  execute_command_log_group_arn = aws_cloudwatch_log_group.ecs_exec.arn
  execute_command_kms_key_arn   = aws_kms_key.app.arn

  log_retention_days = local.log_retention_days
}

# ── 프론트엔드 ──────────────────────────────────────────────────────

module "frontend" {
  source = "../../../modules/ecs-service"

  name_prefix = local.name_prefix
  name        = "frontend"
  cluster_arn = aws_ecs_cluster.this.arn
  image       = local.frontend_image
  cpu         = var.frontend_cpu
  memory      = var.frontend_memory

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

  subnet_ids         = local.task_subnet_ids
  assign_public_ip   = local.task_assign_public_ip
  security_group_ids = [aws_security_group.frontend.id]
  desired_count      = var.frontend_desired_count
  target_group_arn   = module.edge.frontend_target_group_arn

  service_connect = {
    namespace_arn = aws_service_discovery_http_namespace.this.arn
  }

  log_retention_days = local.log_retention_days
}
