# pqms.co.kr DNS. 가비아 대신 Route 53 이 응답한다(가비아는 apex 를 ALB 에 연결할 수 없다).
# 2026-10-28 컷오버로 pqms.co.kr·www 를 AWS ALB 로 옮겼고, 2026-11-05 옛 Netlify 를 해지하며
# Netlify 로 되돌리는 선택지(app_target)와 dev.pqms.co.kr(옛 dev 화면)을 지웠다.
#
# 영역을 지웠다 다시 만들면 네임서버가 바뀌어 도메인 전체가 끊기므로 prevent_destroy 로 막는다.
# app 루트는 이 영역에 api·app 주소와 인증서 검증 레코드를 직접 추가한다(이름으로 찾음).

locals {
  domain           = "pqms.co.kr"
  ttl              = 300
  dev_box_ip       = "54.116.197.4" # pmcs-dev 서버 1대형 EIP (envs/dev/box). 바뀌면 여기도 바꾼다.
  dev_box_hostname = ["app-dev", "api-dev"]
}

resource "aws_route53_zone" "this" {
  name    = local.domain
  comment = "PQMS public DNS (moved from Gabia)"

  lifecycle {
    prevent_destroy = true
  }
}

data "aws_lb" "prod" {
  name = "pmcs-prod-alb"
}

# ── pqms.co.kr · www: 운영 화면 ─────────────────────────────────────

resource "aws_route53_record" "apex" {
  zone_id = aws_route53_zone.this.zone_id
  name    = local.domain
  type    = "A"

  alias {
    name                   = data.aws_lb.prod.dns_name
    zone_id                = data.aws_lb.prod.zone_id
    evaluate_target_health = false
  }
}

# pqms.co.kr(ALB)을 따라가고, ALB 가 pqms.co.kr 로 301 리디렉트한다.
resource "aws_route53_record" "www" {
  zone_id = aws_route53_zone.this.zone_id
  name    = "www.${local.domain}"
  type    = "CNAME"
  ttl     = local.ttl
  records = [local.domain]
}

# ── dev ────────────────────────────────────────────────────────────

resource "aws_route53_record" "dev_box" {
  for_each = toset(local.dev_box_hostname)
  zone_id  = aws_route53_zone.this.zone_id
  name     = "${each.key}.${local.domain}"
  type     = "A"
  ttl      = local.ttl
  records  = [local.dev_box_ip]
}

output "zone_id" {
  value = aws_route53_zone.this.zone_id
}

output "name_servers" {
  description = "가비아 네임서버 설정에 넣을 4개"
  value       = aws_route53_zone.this.name_servers
}
