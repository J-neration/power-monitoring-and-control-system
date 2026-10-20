module "database" {
  source = "../../../modules/database"

  name_prefix        = local.name_prefix
  subnet_ids         = module.network.isolated_subnet_ids
  security_group_ids = [aws_security_group.db.id]
  kms_key_arn        = aws_kms_key.app.arn

  # dev는 단일 AZ·최소 사양. prod는 Multi-AZ.
  instance_class = "db.t4g.micro"
  multi_az       = false
}
