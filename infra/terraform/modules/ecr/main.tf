# 컨테이너 이미지 저장소. 태그는 덮어쓸 수 없고(IMMUTABLE), 푸시할 때마다 취약점을 스캔한다.

variable "name_prefix" {
  type = string
}

variable "repositories" {
  description = "저장소 이름 끝부분 목록 (예: api, frontend)"
  type        = list(string)
}

variable "kms_key_arn" {
  type = string
}

variable "keep_tagged_images" {
  description = "저장소마다 남겨 둘 최근 이미지 수. 롤백에 필요한 만큼만 남긴다."
  type        = number
  default     = 30
}

resource "aws_ecr_repository" "this" {
  for_each             = toset(var.repositories)
  name                 = "${var.name_prefix}/${each.key}"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = var.kms_key_arn
  }
}

resource "aws_ecr_lifecycle_policy" "this" {
  for_each   = aws_ecr_repository.this
  repository = each.value.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images after 7 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Keep only the most recent tagged images"
        selection = {
          tagStatus      = "tagged"
          tagPatternList = ["*"]
          countType      = "imageCountMoreThan"
          countNumber    = var.keep_tagged_images
        }
        action = { type = "expire" }
      },
    ]
  })
}

output "repository_urls" {
  value = { for k, r in aws_ecr_repository.this : k => r.repository_url }
}

output "repository_arns" {
  value = { for k, r in aws_ecr_repository.this : k => r.arn }
}
