# WAF 규칙 (숫자가 작을수록 먼저 평가):
#   0  api 도메인은 /receiver만 허용 (도메인이 정해진 뒤)
#   1~3 IP당 속도 제한: 로그인, HMI 수신, 전체
#   10~40 AWS 관리형 규칙: 악성 IP, 공통 취약점, 알려진 공격 입력, SQL 인젝션
# 로그는 차단·카운트된 요청만 남기고, 쿠키·인증 헤더·HMI 키는 가린다.

locals {
  managed_rule_groups = [
    { name = "AWSManagedRulesAmazonIpReputationList", priority = 10, count_rules = [] },
    # HMI 장비가 User-Agent 없이 보내거나 큰 본문을 보낼 수 있어, dev에서 실제 트래픽을 본 뒤
    # 차단으로 바꿀지 정한다. 그때까지는 카운트(기록만)로 둔다.
    { name = "AWSManagedRulesCommonRuleSet", priority = 20, count_rules = ["NoUserAgent_HEADER", "SizeRestrictions_BODY"] },
    { name = "AWSManagedRulesKnownBadInputsRuleSet", priority = 30, count_rules = [] },
    { name = "AWSManagedRulesSQLiRuleSet", priority = 40, count_rules = [] },
  ]

  rate_limits = [
    { name = "rate-limit-login", priority = 1, limit = var.login_rate_limit, path = "/api/auth/login" },
    { name = "rate-limit-receiver", priority = 2, limit = var.receiver_rate_limit, path = "/receiver" },
  ]
}

resource "aws_wafv2_web_acl" "this" {
  count = var.enable_waf ? 1 : 0

  name  = "${var.name_prefix}-web-acl"
  scope = "REGIONAL"

  default_action {
    allow {}
  }

  dynamic "rule" {
    for_each = var.api_hostname != null ? [var.api_hostname] : []
    content {
      name     = "api-host-receiver-only"
      priority = 0

      action {
        block {}
      }

      statement {
        and_statement {
          statement {
            byte_match_statement {
              search_string         = lower(rule.value)
              positional_constraint = "EXACTLY"
              field_to_match {
                single_header {
                  name = "host"
                }
              }
              text_transformation {
                priority = 0
                type     = "LOWERCASE"
              }
            }
          }
          statement {
            not_statement {
              statement {
                byte_match_statement {
                  search_string         = "/receiver"
                  positional_constraint = "STARTS_WITH"
                  field_to_match {
                    uri_path {}
                  }
                  text_transformation {
                    priority = 0
                    type     = "NONE"
                  }
                }
              }
            }
          }
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "api-host-receiver-only"
        sampled_requests_enabled   = true
      }
    }
  }

  dynamic "rule" {
    for_each = local.rate_limits
    content {
      name     = rule.value.name
      priority = rule.value.priority

      action {
        block {}
      }

      statement {
        rate_based_statement {
          limit                 = rule.value.limit
          aggregate_key_type    = "IP"
          evaluation_window_sec = 300

          scope_down_statement {
            byte_match_statement {
              search_string         = rule.value.path
              positional_constraint = "STARTS_WITH"
              field_to_match {
                uri_path {}
              }
              text_transformation {
                priority = 0
                type     = "LOWERCASE"
              }
            }
          }
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = rule.value.name
        sampled_requests_enabled   = true
      }
    }
  }

  rule {
    name     = "rate-limit-per-ip"
    priority = 3

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit                 = var.global_rate_limit
        aggregate_key_type    = "IP"
        evaluation_window_sec = 300
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "rate-limit-per-ip"
      sampled_requests_enabled   = true
    }
  }

  dynamic "rule" {
    for_each = local.managed_rule_groups
    content {
      name     = rule.value.name
      priority = rule.value.priority

      override_action {
        none {}
      }

      statement {
        managed_rule_group_statement {
          vendor_name = "AWS"
          name        = rule.value.name

          dynamic "rule_action_override" {
            for_each = rule.value.count_rules
            content {
              name = rule_action_override.value
              action_to_use {
                count {}
              }
            }
          }
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = rule.value.name
        sampled_requests_enabled   = true
      }
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.name_prefix}-web-acl"
    sampled_requests_enabled   = true
  }
}

resource "aws_wafv2_web_acl_association" "alb" {
  count        = var.enable_waf ? 1 : 0
  resource_arn = aws_lb.this.arn
  web_acl_arn  = aws_wafv2_web_acl.this[0].arn
}

# WAF 로그 그룹 이름은 반드시 aws-waf-logs- 로 시작해야 한다.
resource "aws_cloudwatch_log_group" "waf" {
  count             = var.enable_waf ? 1 : 0
  name              = "aws-waf-logs-${var.name_prefix}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn
}

resource "aws_wafv2_web_acl_logging_configuration" "this" {
  count                   = var.enable_waf ? 1 : 0
  resource_arn            = aws_wafv2_web_acl.this[0].arn
  log_destination_configs = [aws_cloudwatch_log_group.waf[0].arn]

  redacted_fields {
    single_header {
      name = "cookie"
    }
  }
  redacted_fields {
    single_header {
      name = "authorization"
    }
  }
  redacted_fields {
    single_header {
      name = "x-api-key"
    }
  }

  logging_filter {
    default_behavior = "DROP"

    filter {
      behavior    = "KEEP"
      requirement = "MEETS_ANY"
      condition {
        action_condition {
          action = "BLOCK"
        }
      }
      condition {
        action_condition {
          action = "COUNT"
        }
      }
    }
  }
}
