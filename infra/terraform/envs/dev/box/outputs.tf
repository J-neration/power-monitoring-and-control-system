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

output "deploy_role_arn" {
  description = "GitHub 저장소 시크릿 AWS_DEV_DEPLOY_ROLE_ARN 에 넣는 값"
  value       = aws_iam_role.deploy.arn
}

output "image_tag_parameter" {
  value = aws_ssm_parameter.image_tag.name
}
