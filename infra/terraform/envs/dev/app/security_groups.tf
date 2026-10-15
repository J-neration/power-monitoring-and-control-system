# 허용 흐름:  인터넷 →443/80→ ALB →3000→ frontend →4000→ api →5432→ RDS
#                              ALB →4000→ api (/ws, /receiver)
# 아웃바운드 443은 ECR·Secrets Manager·CloudWatch·GuardDuty 에이전트와 장애 웹훅용(NAT 경유).

resource "aws_security_group" "alb" {
  name        = "${local.name_prefix}-alb"
  description = "Public ALB"
  vpc_id      = module.network.vpc_id
  tags        = { Name = "${local.name_prefix}-alb" }
}

resource "aws_security_group" "frontend" {
  name        = "${local.name_prefix}-frontend"
  description = "Frontend ECS tasks"
  vpc_id      = module.network.vpc_id
  tags        = { Name = "${local.name_prefix}-frontend" }
}

resource "aws_security_group" "api" {
  name        = "${local.name_prefix}-api"
  description = "API ECS tasks (also used by the migration task)"
  vpc_id      = module.network.vpc_id
  tags        = { Name = "${local.name_prefix}-api" }
}

resource "aws_security_group" "db" {
  name        = "${local.name_prefix}-db"
  description = "RDS PostgreSQL"
  vpc_id      = module.network.vpc_id
  tags        = { Name = "${local.name_prefix}-db" }
}

# ALB
resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTPS from the internet"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTP from the internet (redirected to HTTPS)"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
}

resource "aws_vpc_security_group_egress_rule" "alb_to_frontend" {
  security_group_id            = aws_security_group.alb.id
  description                  = "To frontend tasks"
  referenced_security_group_id = aws_security_group.frontend.id
  ip_protocol                  = "tcp"
  from_port                    = local.frontend_port
  to_port                      = local.frontend_port
}

resource "aws_vpc_security_group_egress_rule" "alb_to_api" {
  security_group_id            = aws_security_group.alb.id
  description                  = "To API tasks (/ws, /receiver)"
  referenced_security_group_id = aws_security_group.api.id
  ip_protocol                  = "tcp"
  from_port                    = local.api_port
  to_port                      = local.api_port
}

# frontend
resource "aws_vpc_security_group_ingress_rule" "frontend_from_alb" {
  security_group_id            = aws_security_group.frontend.id
  description                  = "From ALB"
  referenced_security_group_id = aws_security_group.alb.id
  ip_protocol                  = "tcp"
  from_port                    = local.frontend_port
  to_port                      = local.frontend_port
}

resource "aws_vpc_security_group_egress_rule" "frontend_to_api" {
  security_group_id            = aws_security_group.frontend.id
  description                  = "To API via Service Connect"
  referenced_security_group_id = aws_security_group.api.id
  ip_protocol                  = "tcp"
  from_port                    = local.api_port
  to_port                      = local.api_port
}

resource "aws_vpc_security_group_egress_rule" "frontend_https_out" {
  security_group_id = aws_security_group.frontend.id
  description       = "AWS APIs via NAT"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

# api
resource "aws_vpc_security_group_ingress_rule" "api_from_alb" {
  security_group_id            = aws_security_group.api.id
  description                  = "From ALB (/ws, /receiver)"
  referenced_security_group_id = aws_security_group.alb.id
  ip_protocol                  = "tcp"
  from_port                    = local.api_port
  to_port                      = local.api_port
}

resource "aws_vpc_security_group_ingress_rule" "api_from_frontend" {
  security_group_id            = aws_security_group.api.id
  description                  = "From frontend BFF"
  referenced_security_group_id = aws_security_group.frontend.id
  ip_protocol                  = "tcp"
  from_port                    = local.api_port
  to_port                      = local.api_port
}

resource "aws_vpc_security_group_egress_rule" "api_to_db" {
  security_group_id            = aws_security_group.api.id
  description                  = "To RDS"
  referenced_security_group_id = aws_security_group.db.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

resource "aws_vpc_security_group_egress_rule" "api_https_out" {
  security_group_id = aws_security_group.api.id
  description       = "AWS APIs and the fault webhook via NAT"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

# db: 인바운드는 api 보안 그룹에서만, 아웃바운드 규칙은 없음
resource "aws_vpc_security_group_ingress_rule" "db_from_api" {
  security_group_id            = aws_security_group.db.id
  description                  = "From API and migration tasks"
  referenced_security_group_id = aws_security_group.api.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}
