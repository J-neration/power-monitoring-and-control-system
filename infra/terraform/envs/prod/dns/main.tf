# pqms.co.kr DNS. 가비아 대신 Route 53 이 응답하도록 옮긴다(가비아는 apex 를 ALB 에 연결할 수 없다).
#
# 순서:
#   1. 이 루트 apply → 지금 가비아에 있는 레코드를 똑같이 만든다(app_target = "netlify").
#   2. 출력 name_servers 에 직접 물어 가비아와 같은 답이 나오는지 확인한다.
#   3. 가비아에서 네임서버를 name_servers 4개로 바꾼다. 두 곳의 답이 같아 그동안 영향이 없다.
#   4. 컷오버 날 app_target = "aws" 로 apply → pqms.co.kr·www 가 AWS ALB 로 간다.
#      롤백은 "netlify" 로 되돌려 apply.
#
# 영역을 지웠다 다시 만들면 네임서버가 바뀌어 도메인 전체가 끊기므로 prevent_destroy 로 막는다.
# app 루트는 이 영역에 api·app 주소와 인증서 검증 레코드를 직접 추가한다(이름으로 찾음).

variable "app_target" {
  description = "pqms.co.kr·www 가 가리킬 곳. netlify = 지금 운영 화면, aws = pmcs-prod ALB (컷오버)."
  type        = string
  default     = "netlify"
  validation {
    condition     = contains(["netlify", "aws"], var.app_target)
    error_message = "app_target 은 netlify 또는 aws 여야 한다."
  }
}

locals {
  domain = "pqms.co.kr"
  ttl    = 300

  # 2026-10-27 가비아 레코드(5개, TTL 600)를 그대로 옮긴 값. MX·TXT·CAA 는 없었다.
  netlify_apex_ip  = "75.2.60.5"
  netlify_www      = "lmacs.netlify.app"
  netlify_dev      = "dev--lmacs.netlify.app"
  dev_box_ip       = "54.116.197.4" # pmcs-dev 서버 1대형 EIP (envs/dev/box). 바뀌면 여기도 바꾼다.
  dev_box_hostname = ["app-dev", "api-dev"]
}

resource "aws_route53_zone" "this" {
  name    = local.domain
  comment = "PMCS public DNS (moved from Gabia)"

  lifecycle {
    prevent_destroy = true
  }
}

data "aws_lb" "prod" {
  count = var.app_target == "aws" ? 1 : 0
  name  = "pmcs-prod-alb"
}

# ── pqms.co.kr · www: 운영 화면 ─────────────────────────────────────

resource "aws_route53_record" "apex_netlify" {
  count   = var.app_target == "netlify" ? 1 : 0
  zone_id = aws_route53_zone.this.zone_id
  name    = local.domain
  type    = "A"
  ttl     = local.ttl
  records = [local.netlify_apex_ip]
}

resource "aws_route53_record" "www_netlify" {
  count   = var.app_target == "netlify" ? 1 : 0
  zone_id = aws_route53_zone.this.zone_id
  name    = "www.${local.domain}"
  type    = "CNAME"
  ttl     = local.ttl
  records = [local.netlify_www]
}

# 컷오버 후: 둘 다 ALB 별칭. www 는 ALB 가 pqms.co.kr 로 301 리디렉트한다.
resource "aws_route53_record" "app_aws" {
  for_each = var.app_target == "aws" ? toset([local.domain, "www.${local.domain}"]) : toset([])
  zone_id  = aws_route53_zone.this.zone_id
  name     = each.key
  type     = "A"

  alias {
    name                   = data.aws_lb.prod[0].dns_name
    zone_id                = data.aws_lb.prod[0].zone_id
    evaluate_target_health = false
  }
}

# ── dev ────────────────────────────────────────────────────────────

# dev Netlify(옛 dev 화면). Netlify 를 정리할 때 함께 지운다.
resource "aws_route53_record" "dev_netlify" {
  zone_id = aws_route53_zone.this.zone_id
  name    = "dev.${local.domain}"
  type    = "CNAME"
  ttl     = local.ttl
  records = [local.netlify_dev]
}

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
