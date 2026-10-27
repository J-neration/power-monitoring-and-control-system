module "database" {
  source = "../../../modules/database"

  name_prefix        = local.name_prefix
  subnet_ids         = module.network.isolated_subnet_ids
  security_group_ids = [aws_security_group.db.id]
  kms_key_arn        = aws_kms_key.app.arn

  # "필수 보안형": 단일 AZ로 시작한다(장애 시 백업에서 복구). 고객사가 요구하면 multi_az = true (+월 약 $21).
  # 삭제 방지·최종 스냅샷·백업 14일(시점 복구)은 모듈 기본값.
  instance_class = "db.t4g.micro"
  multi_az       = false
}
