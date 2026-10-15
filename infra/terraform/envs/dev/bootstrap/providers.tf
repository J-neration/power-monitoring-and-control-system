terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

# 자격 증명은 코드에 넣지 않는다. 로컬에서는 AWS_PROFILE=pmcs-dev로 실행한다.
provider "aws" {
  region = "ap-northeast-2"

  # 다른 계정(관리 계정, pmcs-prod)의 자격 증명으로 실행하면 plan 단계에서 바로 멈춘다.
  allowed_account_ids = ["035680193225"]

  default_tags {
    tags = {
      Project     = "pmcs"
      Environment = "dev"
      ManagedBy   = "terraform"
      Stack       = "bootstrap"
    }
  }
}
