output "alb_dns_name" {
  value = module.edge.alb_dns_name
}

output "ecr_repository_urls" {
  value = module.ecr.repository_urls
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

output "alert_mail_secret_arn" {
  value = aws_secretsmanager_secret.alert_mail.arn
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "migrate_task_definition_family" {
  value = module.api_migrate.task_definition_family
}

output "web_acl_arn" {
  value = module.edge.web_acl_arn
}
