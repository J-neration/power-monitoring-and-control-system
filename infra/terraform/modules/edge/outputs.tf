output "alb_arn" {
  value = aws_lb.this.arn
}

output "alb_dns_name" {
  description = "app·api 도메인의 CNAME(또는 Route 53 별칭) 대상"
  value       = aws_lb.this.dns_name
}

output "alb_arn_suffix" {
  description = "CloudWatch 지표 차원(LoadBalancer)"
  value       = aws_lb.this.arn_suffix
}

output "frontend_target_group_arn_suffix" {
  description = "CloudWatch 지표 차원(TargetGroup)"
  value       = aws_lb_target_group.frontend.arn_suffix
}

output "api_target_group_arn_suffix" {
  value = aws_lb_target_group.api.arn_suffix
}

output "alb_zone_id" {
  value = aws_lb.this.zone_id
}

# ECS 서비스는 리스너 규칙에 연결된 대상 그룹만 받는다(아니면 CreateService가 실패한다).
# 그래서 규칙이 생긴 뒤에 이 값이 넘어가도록 depends_on을 건다.
output "frontend_target_group_arn" {
  value      = aws_lb_target_group.frontend.arn
  depends_on = [aws_lb_listener_rule.app]
}

output "api_target_group_arn" {
  value      = aws_lb_target_group.api.arn
  depends_on = [aws_lb_listener_rule.app_ws, aws_lb_listener_rule.api_receiver]
}

output "tls_enabled" {
  value = local.tls_enabled
}

output "acm_validation_records" {
  description = "도메인 DNS에 등록할 ACM 검증 CNAME 레코드 (route53_zone_id 를 주면 자동으로 만들어진다)"
  value = local.tls_enabled ? [
    for o in aws_acm_certificate.this[0].domain_validation_options : {
      name  = o.resource_record_name
      type  = o.resource_record_type
      value = o.resource_record_value
    }
  ] : []
}

output "web_acl_arn" {
  value = var.enable_waf ? aws_wafv2_web_acl.this[0].arn : null
}
