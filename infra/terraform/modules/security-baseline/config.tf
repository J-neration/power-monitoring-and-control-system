# Security Hub 점검의 근거가 되는 리소스 구성 기록. 기록은 Config 전용 버킷(config_bucket.tf)으로 간다.

resource "aws_iam_service_linked_role" "config" {
  count            = var.create_config_service_linked_role ? 1 : 0
  aws_service_name = "config.amazonaws.com"
}

resource "aws_config_configuration_recorder" "this" {
  name     = "${var.name_prefix}-recorder"
  role_arn = "arn:${local.partition}:iam::${local.account_id}:role/aws-service-role/config.amazonaws.com/AWSServiceRoleForConfig"

  recording_group {
    all_supported                 = true
    include_global_resource_types = true
  }

  recording_mode {
    recording_frequency = "CONTINUOUS"
  }

  depends_on = [aws_iam_service_linked_role.config]
}

resource "aws_config_delivery_channel" "this" {
  name           = "${var.name_prefix}-delivery"
  s3_bucket_name = aws_s3_bucket.config.id
  s3_kms_key_arn = aws_kms_key.security.arn

  snapshot_delivery_properties {
    delivery_frequency = "TwentyFour_Hours"
  }

  depends_on = [
    aws_config_configuration_recorder.this,
    aws_s3_bucket_policy.config,
    aws_s3_bucket_server_side_encryption_configuration.config,
  ]
}

resource "aws_config_configuration_recorder_status" "this" {
  name       = aws_config_configuration_recorder.this.name
  is_enabled = true

  depends_on = [aws_config_delivery_channel.this]
}
