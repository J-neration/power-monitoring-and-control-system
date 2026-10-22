output "public_ip" {
  description = "가비아 A 레코드에 넣을 고정 IP"
  value       = aws_eip.box.public_ip
}

output "instance_id" {
  value = aws_instance.box.id
}

output "bucket" {
  value = aws_s3_bucket.box.bucket
}

output "env_parameter" {
  value = aws_ssm_parameter.env.name
}
