# PostgreSQL. isolated 서브넷에만 있고 공개 접속이 없으며, 앱 보안 그룹에서 5432로만 들어온다.
# 마스터 비밀번호는 RDS가 Secrets Manager에 만들어 관리하므로 Terraform 상태·코드에 남지 않는다.
# 앱은 마스터 계정이 아니라 3단계에서 만드는 전용 계정으로 접속한다.

locals {
  identifier = "${var.name_prefix}-db"
  log_types  = ["postgresql", "upgrade"]
}

resource "aws_db_subnet_group" "this" {
  name       = local.identifier
  subnet_ids = var.subnet_ids
}

resource "aws_db_parameter_group" "this" {
  name_prefix = "${local.identifier}-pg16-"
  family      = "postgres16"

  # SSL이 아닌 연결은 거부한다.
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
  parameter {
    name  = "log_connections"
    value = "1"
  }
  parameter {
    name  = "log_disconnections"
    value = "1"
  }
  # 1초 넘게 걸린 쿼리를 로그에 남긴다.
  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# RDS가 로그 그룹을 직접 만들면 암호화·보관 기간이 빠지므로 미리 만든다.
resource "aws_cloudwatch_log_group" "this" {
  for_each          = toset(local.log_types)
  name              = "/aws/rds/instance/${local.identifier}/${each.key}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn
}

data "aws_iam_policy_document" "monitoring_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["monitoring.rds.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "monitoring" {
  name               = "${local.identifier}-monitoring"
  assume_role_policy = data.aws_iam_policy_document.monitoring_assume.json
}

resource "aws_iam_role_policy_attachment" "monitoring" {
  role       = aws_iam_role.monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

resource "aws_db_instance" "this" {
  identifier     = local.identifier
  engine         = "postgres"
  engine_version = var.engine_version
  instance_class = var.instance_class
  multi_az       = var.multi_az

  db_name                             = "pmcs"
  username                            = "pmcs_admin"
  manage_master_user_password         = true
  master_user_secret_kms_key_id       = var.kms_key_arn
  iam_database_authentication_enabled = true

  allocated_storage     = var.allocated_storage_gb
  max_allocated_storage = var.max_allocated_storage_gb
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = var.kms_key_arn

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = var.security_group_ids
  publicly_accessible    = false
  ca_cert_identifier     = "rds-ca-rsa2048-g1"
  parameter_group_name   = aws_db_parameter_group.this.name

  # 시간은 UTC. 백업 02:00~03:00, 유지보수 월요일 03:00~04:00 (한국 시간)
  backup_retention_period    = var.backup_retention_days
  backup_window              = "17:00-18:00"
  maintenance_window         = "sun:18:00-sun:19:00"
  auto_minor_version_upgrade = true
  copy_tags_to_snapshot      = true
  deletion_protection        = true
  skip_final_snapshot        = false
  final_snapshot_identifier  = "${local.identifier}-final"
  delete_automated_backups   = false
  apply_immediately          = var.apply_immediately

  enabled_cloudwatch_logs_exports = local.log_types
  monitoring_interval             = 60
  monitoring_role_arn             = aws_iam_role.monitoring.arn

  depends_on = [aws_cloudwatch_log_group.this]
}
