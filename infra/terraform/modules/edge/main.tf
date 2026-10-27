# 외부에서 들어오는 유일한 입구: WAF → ALB.
#   app 도메인(+ app_alias_hostnames): /ws → API(WebSocket), 나머지 → 프론트엔드(BFF)
#   redirect_hostnames(예: www): app 도메인으로 301
#   api 도메인: /receiver만 → API (HMI 수신 전용, 그 외 경로는 WAF가 차단)
# 도메인이 정해지기 전에는 HTTPS 리스너와 인증서 없이 만들고, 80 포트는 404만 돌려준다.

data "aws_caller_identity" "current" {}
data "aws_elb_service_account" "current" {}

locals {
  tls_enabled = var.app_hostname != null && var.api_hostname != null
  account_id  = data.aws_caller_identity.current.account_id

  app_hosts = local.tls_enabled ? concat([var.app_hostname], var.app_alias_hostnames) : []
  cert_sans = local.tls_enabled ? concat([var.api_hostname], var.app_alias_hostnames, var.redirect_hostnames) : []
}

# ── 대상 그룹 ───────────────────────────────────────────────────────

resource "aws_lb_target_group" "frontend" {
  name                 = "${var.name_prefix}-frontend"
  port                 = var.frontend_port
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = var.vpc_id
  deregistration_delay = 30

  health_check {
    path                = "/login"
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_target_group" "api" {
  name                 = "${var.name_prefix}-api"
  port                 = var.api_port
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = var.vpc_id
  deregistration_delay = 30

  health_check {
    path                = "/health"
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

# ── ALB 접근 로그 버킷 (ALB 로그는 SSE-S3만 지원) ──────────────────────

resource "aws_s3_bucket" "alb_logs" {
  bucket = "${var.name_prefix}-alb-logs-${local.account_id}"
}

resource "aws_s3_bucket_ownership_controls" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "alb_logs" {
  bucket                  = aws_s3_bucket.alb_logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  rule {
    id     = "expire-alb-logs"
    status = "Enabled"
    filter {}
    expiration {
      days = var.log_retention_days
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

data "aws_iam_policy_document" "alb_logs" {
  statement {
    sid       = "AlbLogDelivery"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.alb_logs.arn}/alb/AWSLogs/${local.account_id}/*"]
    principals {
      type        = "AWS"
      identifiers = [data.aws_elb_service_account.current.arn]
    }
  }

  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.alb_logs.arn,
      "${aws_s3_bucket.alb_logs.arn}/*",
    ]
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

resource "aws_s3_bucket_policy" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  policy = data.aws_iam_policy_document.alb_logs.json

  depends_on = [aws_s3_bucket_public_access_block.alb_logs]
}

# ── ALB ─────────────────────────────────────────────────────────────

resource "aws_lb" "this" {
  name               = "${var.name_prefix}-alb"
  load_balancer_type = "application"
  internal           = false
  subnets            = var.public_subnet_ids
  security_groups    = [var.alb_security_group_id]

  # WebSocket이 끊기지 않도록 길게 두고, 백엔드가 30초마다 ping을 보낸다.
  idle_timeout               = 300
  drop_invalid_header_fields = true
  enable_deletion_protection = var.deletion_protection

  access_logs {
    bucket  = aws_s3_bucket.alb_logs.id
    prefix  = "alb"
    enabled = true
  }

  depends_on = [aws_s3_bucket_policy.alb_logs]
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = local.tls_enabled ? "redirect" : "fixed-response"

    dynamic "redirect" {
      for_each = local.tls_enabled ? [1] : []
      content {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }

    dynamic "fixed_response" {
      for_each = local.tls_enabled ? [] : [1]
      content {
        content_type = "text/plain"
        message_body = "Not Found"
        status_code  = "404"
      }
    }
  }
}

# ── HTTPS (도메인이 정해진 뒤) ───────────────────────────────────────

resource "aws_acm_certificate" "this" {
  count                     = local.tls_enabled ? 1 : 0
  domain_name               = var.app_hostname
  subject_alternative_names = local.cert_sans
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# Route 53 영역이 있으면 검증 레코드를 직접 만든다. 영역의 네임서버가 실제로 쓰이고 있어야(가비아 위임 후) 검증이 끝난다.
resource "aws_route53_record" "acm_validation" {
  for_each = local.tls_enabled && var.route53_zone_id != null ? {
    for o in aws_acm_certificate.this[0].domain_validation_options : o.domain_name => o
  } : {}

  zone_id         = var.route53_zone_id
  name            = each.value.resource_record_name
  type            = each.value.resource_record_type
  records         = [each.value.resource_record_value]
  ttl             = 300
  allow_overwrite = true
}

# 영역이 없으면 검증 레코드(출력 acm_validation_records)를 DNS 에 수동으로 등록해야 끝난다.
resource "aws_acm_certificate_validation" "this" {
  count                   = local.tls_enabled ? 1 : 0
  certificate_arn         = aws_acm_certificate.this[0].arn
  validation_record_fqdns = var.route53_zone_id != null ? [for r in aws_route53_record.acm_validation : r.fqdn] : null
}

resource "aws_lb_listener" "https" {
  count             = local.tls_enabled ? 1 : 0
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.this[0].certificate_arn

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Not Found"
      status_code  = "404"
    }
  }
}

resource "aws_lb_listener_rule" "redirect" {
  count        = local.tls_enabled && length(var.redirect_hostnames) > 0 ? 1 : 0
  listener_arn = aws_lb_listener.https[0].arn
  priority     = 5

  action {
    type = "redirect"
    redirect {
      host        = var.app_hostname
      path        = "/#{path}"
      query       = "#{query}"
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
  condition {
    host_header {
      values = var.redirect_hostnames
    }
  }
}

resource "aws_lb_listener_rule" "app_ws" {
  count        = local.tls_enabled ? 1 : 0
  listener_arn = aws_lb_listener.https[0].arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
  condition {
    host_header {
      values = local.app_hosts
    }
  }
  condition {
    path_pattern {
      values = ["/ws", "/ws/*"]
    }
  }
}

resource "aws_lb_listener_rule" "app" {
  count        = local.tls_enabled ? 1 : 0
  listener_arn = aws_lb_listener.https[0].arn
  priority     = 20

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.frontend.arn
  }
  condition {
    host_header {
      values = local.app_hosts
    }
  }
}

resource "aws_lb_listener_rule" "api_receiver" {
  count        = local.tls_enabled ? 1 : 0
  listener_arn = aws_lb_listener.https[0].arn
  priority     = 30

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
  condition {
    host_header {
      values = [var.api_hostname]
    }
  }
  condition {
    path_pattern {
      values = ["/receiver", "/receiver/*"]
    }
  }
}
