# pmcs-dev "서버 1대형"(B안, 2026-10-22 결정): EC2 t4g.small 1대에 docker compose 로
# Caddy(TLS) + API + 프론트 + PostgreSQL 16 을 올린다. 월 약 $22 (ECS·ALB·RDS dev 는 약 $70~80).
# prod 는 ECS·ALB·WAF·RDS 그대로이며, 달라지는 부분은 운영 리허설에서 검증한다.
#
# app 루트(ECS dev)와 상태를 공유하지 않는다. 전환 기간에는 둘이 함께 돌고, 가비아 레코드만 바꿔 넘어간다.
# 서버 안의 구성 파일은 infra/dev-box/ 에 있고, 이 루트가 S3 로 올린다.

locals {
  name_prefix = "pmcs-dev"
  name        = "${local.name_prefix}-box"
  az          = "ap-northeast-2a"

  # 서버 위 docker compose 플러그인. 2주 이상 지난 릴리스로 고정하고 체크섬을 확인한다.
  compose_version = "v5.5.1"
  compose_sha256  = "732e3a84c1a0f67256ce80bc2598a24546b10ca05f9faa97efceb1171ece2ef7"

  config_dir       = "${path.module}/../../../../dev-box"
  log_group_prefix = "/${local.name_prefix}/box"
  log_services     = ["caddy", "api", "frontend", "postgres"]

  ecr_registry = split("/", module.ecr.repository_urls["api"])[0]
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# ── 네트워크: 공개 서브넷 하나 (VPC·서브넷·IGW 는 무료) ─────────────────

resource "aws_vpc" "box" {
  cidr_block           = "10.30.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = "${local.name}-vpc" }
}

# 기본 보안 그룹은 규칙을 비워 실수로 쓰이지 않게 한다.
resource "aws_default_security_group" "box" {
  vpc_id = aws_vpc.box.id
}

resource "aws_internet_gateway" "box" {
  vpc_id = aws_vpc.box.id
  tags   = { Name = "${local.name}-igw" }
}

resource "aws_subnet" "public" {
  vpc_id            = aws_vpc.box.id
  cidr_block        = "10.30.1.0/24"
  availability_zone = local.az
  tags              = { Name = "${local.name}-public" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.box.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.box.id
  }
  tags = { Name = "${local.name}-public" }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

# 들어오는 연결은 HTTP·HTTPS 만. SSH 는 열지 않고 SSM 세션으로 접속한다.
resource "aws_security_group" "box" {
  name        = local.name
  description = "PMCS dev box: HTTP/HTTPS in (Caddy), all out"
  vpc_id      = aws_vpc.box.id
  tags        = { Name = local.name }
}

# 규칙 설명에는 작은따옴표를 쓸 수 없다(AWS API 가 거부).
resource "aws_vpc_security_group_ingress_rule" "http" {
  security_group_id = aws_security_group.box.id
  description       = "Lets Encrypt HTTP-01 and redirect to HTTPS"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_ingress_rule" "https" {
  security_group_id = aws_security_group.box.id
  description       = "Browsers and HMI"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.box.id
  description       = "ECR, SSM, S3, CloudWatch, Lets Encrypt, SMTP"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

# ── 설정·백업 버킷 ─────────────────────────────────────────────────

resource "aws_s3_bucket" "box" {
  bucket = "${local.name}-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_public_access_block" "box" {
  bucket                  = aws_s3_bucket.box.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "box" {
  bucket = aws_s3_bucket.box.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "box" {
  bucket = aws_s3_bucket.box.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "box" {
  bucket = aws_s3_bucket.box.id
  rule {
    id     = "expire-backups"
    status = "Enabled"
    filter {
      prefix = "backups/"
    }
    expiration {
      days = var.backup_retention_days
    }
  }
}

data "aws_iam_policy_document" "bucket" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.box.arn, "${aws_s3_bucket.box.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "box" {
  bucket = aws_s3_bucket.box.id
  policy = data.aws_iam_policy_document.bucket.json
}

# 서버의 pmcs-deploy 가 config/ 를 통째로 내려받는다. 파일이 바뀌면 etag 로 다시 올라간다.
locals {
  config_files = {
    "compose.yml"        = "${local.config_dir}/compose.yml"
    "Caddyfile"          = "${local.config_dir}/Caddyfile"
    "initdb/01-roles.sh" = "${local.config_dir}/initdb/01-roles.sh"
    "pmcs-deploy.sh"     = "${local.config_dir}/pmcs-deploy.sh"
    "pmcs-backup.sh"     = "${local.config_dir}/pmcs-backup.sh"
  }

  # 비밀이 아닌 설정. 비밀 값은 SSM 파라미터에 있다.
  settings_env = <<-EOT
    AWS_REGION=${data.aws_region.current.region}
    LOG_GROUP_PREFIX=${local.log_group_prefix}
    APP_HOSTS=${join(", ", var.app_hosts)}
    API_HOSTS=${join(", ", var.api_hosts)}
    FRONTEND_ORIGIN=${join(",", [for h in var.app_hosts : "https://${h}"])}
    API_IMAGE=${module.ecr.repository_urls["api"]}:${var.api_image_tag}
    FRONTEND_IMAGE=${module.ecr.repository_urls["frontend"]}:${var.frontend_image_tag}
  EOT
}

resource "aws_s3_object" "config" {
  for_each = local.config_files
  bucket   = aws_s3_bucket.box.id
  key      = "config/${each.key}"
  source   = each.value
  etag     = filemd5(each.value)
}

resource "aws_s3_object" "settings" {
  bucket  = aws_s3_bucket.box.id
  key     = "config/settings.env"
  content = local.settings_env
}

# ── 비밀 값: SSM SecureString (무료, 기본 키 aws/ssm) ─────────────────
# 값은 scripts/dev-box/init-env.sh 가 채운다(DB 계정 비밀번호 생성 + ECS dev 시크릿 복사).
# Terraform 은 자리만 만들고 값은 상태에 남기지 않는다.

resource "aws_ssm_parameter" "env" {
  name        = "/${local.name_prefix}/box/env"
  description = "PMCS dev box secrets (dotenv). Filled by scripts/dev-box/init-env.sh"
  type        = "SecureString"
  value       = "UNSET"

  lifecycle {
    ignore_changes = [value]
  }
}

# ── 로그 ───────────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "box" {
  for_each          = toset(local.log_services)
  name              = "${local.log_group_prefix}/${each.key}"
  retention_in_days = 30
}

# ── 서버 권한 ──────────────────────────────────────────────────────

data "aws_iam_policy_document" "assume_ec2" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "box" {
  name               = local.name
  assume_role_policy = data.aws_iam_policy_document.assume_ec2.json
}

# SSM 세션·명령 실행(배포, DB 포트 포워딩)
resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.box.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

data "aws_iam_policy_document" "box" {
  statement {
    sid       = "EcrLogin"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
  statement {
    sid = "EcrPull"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
    ]
    resources = values(module.ecr.repository_arns)
  }
  statement {
    sid       = "ReadConfig"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.box.arn}/config/*"]
  }
  statement {
    sid       = "ListConfig"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.box.arn]
    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["config/", "config/*"]
    }
  }
  statement {
    sid       = "WriteBackups"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.box.arn}/backups/*"]
  }
  statement {
    sid       = "ReadSecrets"
    actions   = ["ssm:GetParameter"]
    resources = [aws_ssm_parameter.env.arn]
  }
  statement {
    sid       = "ContainerLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = [for g in aws_cloudwatch_log_group.box : "${g.arn}:*"]
  }
}

resource "aws_iam_role_policy" "box" {
  name   = "box"
  role   = aws_iam_role.box.id
  policy = data.aws_iam_policy_document.box.json
}

resource "aws_iam_instance_profile" "box" {
  name = local.name
  role = aws_iam_role.box.name
}

# ── 서버 ───────────────────────────────────────────────────────────

data "aws_ssm_parameter" "al2023_arm64" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

# Postgres 데이터·Caddy 인증서. 서버를 다시 만들어도 남는다.
resource "aws_ebs_volume" "data" {
  availability_zone = local.az
  size              = 10
  type              = "gp3"
  encrypted         = true
  tags              = { Name = "${local.name}-data" }
}

resource "aws_instance" "box" {
  ami                    = data.aws_ssm_parameter.al2023_arm64.value
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.box.id]
  iam_instance_profile   = aws_iam_instance_profile.box.name
  # 고정 IP 가 붙기 전 첫 부팅(패키지 설치)에도 인터넷에 닿도록 임시 공인 IP 를 받는다. 고정 IP 가 붙으면 반납된다.
  associate_public_ip_address = true

  # IMDSv2 만, 홉 1: 컨테이너(브리지 네트워크)는 서버 역할 자격 증명에 닿지 못한다.
  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
    encrypted   = true
  }

  user_data = templatefile("${path.module}/user-data.sh.tftpl", {
    compose_version = local.compose_version
    compose_sha256  = local.compose_sha256
    data_volume_id  = replace(aws_ebs_volume.data.id, "-", "")
    bucket          = aws_s3_bucket.box.bucket
    env_param       = aws_ssm_parameter.env.name
    region          = data.aws_region.current.region
    ecr_registry    = local.ecr_registry
  })

  tags = { Name = local.name }

  # 새 AMI 가 나오거나 부팅 스크립트를 고쳐도 서버를 갈아엎지 않는다(교체는 의도적으로 -replace).
  lifecycle {
    ignore_changes = [ami, user_data]
  }

  # 첫 부팅 때 pmcs-deploy 가 설정 파일을 받는다.
  depends_on = [aws_s3_object.config, aws_s3_object.settings, aws_iam_role_policy.box]
}

resource "aws_volume_attachment" "data" {
  device_name = "/dev/sdf"
  volume_id   = aws_ebs_volume.data.id
  instance_id = aws_instance.box.id
}

# 고정 IP: 가비아 A 레코드가 가리킨다. 서버를 다시 만들어도 같은 IP 를 붙인다.
resource "aws_eip" "box" {
  domain = "vpc"
  tags   = { Name = local.name }
}

resource "aws_eip_association" "box" {
  allocation_id = aws_eip.box.id
  instance_id   = aws_instance.box.id
}
