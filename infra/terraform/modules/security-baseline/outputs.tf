output "security_kms_key_arn" {
  value = aws_kms_key.security.arn
}

output "audit_bucket_name" {
  value = aws_s3_bucket.audit.id
}

output "security_alerts_topic_arn" {
  value = aws_sns_topic.security_alerts.arn
}

output "guardduty_detector_id" {
  value = aws_guardduty_detector.this.id
}
