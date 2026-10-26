output "address" {
  value = aws_db_instance.this.address
}

output "port" {
  value = aws_db_instance.this.port
}

output "db_name" {
  value = aws_db_instance.this.db_name
}

output "master_user_secret_arn" {
  description = "RDS가 관리하는 마스터 비밀번호 시크릿 (3단계에서 앱 전용 계정을 만들 때만 사용)"
  value       = aws_db_instance.this.master_user_secret[0].secret_arn
}

output "identifier" {
  description = "CloudWatch 지표 차원(DBInstanceIdentifier)"
  value       = aws_db_instance.this.identifier
}
