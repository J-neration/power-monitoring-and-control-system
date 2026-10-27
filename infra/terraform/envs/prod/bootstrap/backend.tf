# 상태 버킷을 만든 뒤 이 루트의 상태도 그 안으로 옮겼다(terraform init -migrate-state).
terraform {
  backend "s3" {
    bucket       = "pmcs-prod-tfstate-887664351558"
    key          = "bootstrap/terraform.tfstate"
    region       = "ap-northeast-2"
    encrypt      = true
    kms_key_id   = "alias/pmcs-prod-tfstate"
    use_lockfile = true
  }
}
