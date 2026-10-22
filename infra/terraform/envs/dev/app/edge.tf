module "edge" {
  source = "../../../modules/edge"

  name_prefix           = local.name_prefix
  vpc_id                = module.network.vpc_id
  public_subnet_ids     = module.network.public_subnet_ids
  alb_security_group_id = aws_security_group.alb.id
  app_hostname          = var.app_hostname
  api_hostname          = var.api_hostname
  frontend_port         = local.frontend_port
  api_port              = local.api_port
  kms_key_arn           = aws_kms_key.app.arn

  # dev 비용 절감(2026-10-22 결정): WAF는 prod에만 둔다. api 도메인은 ALB 규칙으로 /receiver만 서버에 닿는다.
  enable_waf = false
}
