output "alb_dns_name" {
  value = module.edge.alb_dns_name
}

output "acm_validation_records" {
  value = module.edge.acm_validation_records
}

output "ecr_repository_urls" {
  value = module.ecr.repository_urls
}

output "nat_public_ips" {
  value = module.network.nat_public_ips
}

output "db_address" {
  value = module.database.address
}

output "db_master_secret_arn" {
  value = module.database.master_user_secret_arn
}

output "api_secret_arn" {
  value = aws_secretsmanager_secret.api.arn
}

output "jwt_secret_arn" {
  value = aws_secretsmanager_secret.jwt.arn
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "migrate_task_definition_family" {
  value = module.api_migrate.task_definition_family
}
