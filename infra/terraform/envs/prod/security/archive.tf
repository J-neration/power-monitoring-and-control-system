# 오래 보관할 파일(옛 시스템 DB 덤프, 해지 고객 데이터 추출본 등)을 두는 버킷.
# 감사 로그·Config 버킷과 달리 만료 규칙이 없다. 지울 때는 사람이 직접 지운다.
# 암호화는 보안 기반의 KMS 키를 같이 쓴다(키를 새로 만들면 월 $1 가 더 든다).

resource "aws_s3_bucket" "archive" {
  bucket = "pmcs-prod-archive-${data.aws_caller_identity.current.account_id}"

  lifecycle {
    prevent_destroy = true
  }
}

data "aws_caller_identity" "current" {}

resource "aws_s3_bucket_ownership_controls" "archive" {
  bucket = aws_s3_bucket.archive.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "archive" {
  bucket                  = aws_s3_bucket.archive.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "archive" {
  bucket = aws_s3_bucket.archive.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "archive" {
  bucket = aws_s3_bucket.archive.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = module.security.security_kms_key_arn
    }
    bucket_key_enabled = true
  }
}

# 현재 버전은 그대로 두고, 덮어쓰거나 지운 뒤 남는 이전 버전만 정리한다.
resource "aws_s3_bucket_lifecycle_configuration" "archive" {
  bucket = aws_s3_bucket.archive.id

  rule {
    id     = "clean-noncurrent"
    status = "Enabled"
    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.archive]
}

data "aws_iam_policy_document" "archive_bucket" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.archive.arn,
      "${aws_s3_bucket.archive.arn}/*",
    ]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "archive" {
  bucket = aws_s3_bucket.archive.id
  policy = data.aws_iam_policy_document.archive_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.archive]
}

output "archive_bucket_name" {
  value = aws_s3_bucket.archive.id
}
