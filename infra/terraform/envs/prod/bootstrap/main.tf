# pmcs-prod 계정의 Terraform 상태 저장소. 다른 모든 prod 루트(security, dns, app)가 이 버킷을 쓴다.
#
# 처음 한 번은 로컬 상태로 apply 한 뒤, backend.tf를 추가하고
# `terraform init -migrate-state`로 이 루트의 상태도 버킷 안으로 옮긴다(README 참고).

module "state_backend" {
  source = "../../../modules/state-backend"

  name_prefix = "pmcs-prod"
}

output "state_bucket" {
  value = module.state_backend.bucket_name
}

output "state_kms_key_arn" {
  value = module.state_backend.kms_key_arn
}
