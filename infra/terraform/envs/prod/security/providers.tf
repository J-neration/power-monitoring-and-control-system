terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  backend "s3" {
    bucket       = "pmcs-prod-tfstate-887664351558"
    key          = "security/terraform.tfstate"
    region       = "ap-northeast-2"
    encrypt      = true
    kms_key_id   = "alias/pmcs-prod-tfstate"
    use_lockfile = true
  }
}

# 자격 증명은 코드에 넣지 않는다. 로컬에서는 AWS_PROFILE=pmcs-prod로 실행한다.
provider "aws" {
  region              = "ap-northeast-2"
  allowed_account_ids = ["887664351558"]

  default_tags {
    tags = {
      Project     = "pmcs"
      Environment = "prod"
      ManagedBy   = "terraform"
      Stack       = "security"
    }
  }
}
