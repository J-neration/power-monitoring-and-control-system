output "alb_arn" {
  value = aws_lb.this.arn
}

output "alb_dns_name" {
  description = "app·api 도메인의 CNAME(또는 Route 53 별칭) 대상"
  value       = aws_lb.this.dns_name
}

output "alb_zone_id" {
  value = aws_lb.this.zone_id
}

output "frontend_target_group_arn" {
  value = aws_lb_target_group.frontend.arn
}

output "api_target_group_arn" {
  value = aws_lb_target_group.api.arn
}

output "tls_enabled" {
  value = local.tls_enabled
}

output "acm_validation_records" {
  description = "도메인 DNS에 등록할 ACM 검증 CNAME 레코드"
  value = local.tls_enabled ? [
    for o in aws_acm_certificate.this[0].domain_validation_options : {
      name  = o.resource_record_name
      type  = o.resource_record_type
      value = o.resource_record_value
    }
  ] : []
}

output "web_acl_arn" {
  value = aws_wafv2_web_acl.this.arn
}
