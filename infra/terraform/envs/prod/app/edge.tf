data "aws_route53_zone" "this" {
  name = var.dns_zone_name
}

module "edge" {
  source = "../../../modules/edge"

  name_prefix           = local.name_prefix
  vpc_id                = module.network.vpc_id
  public_subnet_ids     = module.network.public_subnet_ids
  alb_security_group_id = aws_security_group.alb.id
  app_hostname          = var.app_hostname
  app_alias_hostnames   = var.app_alias_hostnames
  redirect_hostnames    = var.redirect_hostnames
  api_hostname          = var.api_hostname
  route53_zone_id       = data.aws_route53_zone.this.zone_id
  frontend_port         = local.frontend_port
  api_port              = local.api_port
  kms_key_arn           = aws_kms_key.app.arn

  # 현장 장비는 Railway 중계를 거쳐 들어오므로 WAF 에는 모두 Railway IP 몇 개로 보인다.
  # 장비 10여 대 × (10분마다 수신 + 관리자 화면이 열려 있을 때 1분마다 명령 조회)라 5분에 100건을 넘지 않는다.
  # 기본값 600 은 그 합계에도 충분하다.
  enable_waf = true
}

# api 와 리허설용 app 주소. pqms.co.kr·www 는 컷오버 때 dns 루트가 바꾼다.
resource "aws_route53_record" "alb" {
  for_each = toset(concat([var.api_hostname], var.app_alias_hostnames))
  zone_id  = data.aws_route53_zone.this.zone_id
  name     = each.key
  type     = "A"

  alias {
    name                   = module.edge.alb_dns_name
    zone_id                = module.edge.alb_zone_id
    evaluate_target_health = false
  }
}
