terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  backend "s3" {
    bucket       = "pmcs-dev-tfstate-035680193225"
    key          = "app/terraform.tfstate"
    region       = "ap-northeast-2"
    encrypt      = true
    kms_key_id   = "alias/pmcs-dev-tfstate"
    use_lockfile = true
  }
}

# 자격 증명은 코드에 넣지 않는다. 로컬에서는 AWS_PROFILE=pmcs-dev로 실행한다.
provider "aws" {
  region              = "ap-northeast-2"
  allowed_account_ids = ["035680193225"]

  default_tags {
    tags = {
      Project     = "pmcs"
      Environment = "dev"
      ManagedBy   = "terraform"
      Stack       = "app"
    }
  }
}
