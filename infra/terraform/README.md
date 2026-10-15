# PMCS AWS 인프라 (Terraform)

PMCS를 AWS 서울 리전(`ap-northeast-2`)으로 옮기기 위한 인프라 코드입니다.
이 디렉터리는 Railway(`watchPatterns`)·Docker 이미지·Netlify(`base = apps/frontend`)
어디에도 포함되지 않으므로, 여기만 바꾼 커밋은 현재 운영 배포에 영향을 주지 않습니다.

## 구조

```
infra/terraform/
  modules/            재사용 모듈 (dev·prod가 같은 코드를 씀)
    state-backend/    상태 저장 S3 버킷 + KMS 키
  envs/
    dev/              pmcs-dev 계정(035680193225)
      bootstrap/      상태 저장소. 가장 먼저, 한 번만
      security/       계정 보안 기반 (CloudTrail, GuardDuty, Security Hub, Config, KMS, SNS)
      app/            네트워크, RDS, ECR/ECS, ALB/WAF, Secrets, IAM, 로그
    prod/             pmcs-prod 계정(887664351558). dev 검증 후 같은 모듈로 작성
```

계정마다 상태 버킷과 KMS 키가 따로 있고, 루트(bootstrap·security·app)마다 상태 파일이
따로 있어 한 루트의 실수가 다른 루트의 리소스를 건드리지 않습니다.
각 루트의 프로바이더는 `allowed_account_ids`로 대상 계정을 고정하므로, 다른 계정의
자격 증명으로 실행하면 plan 단계에서 멈춥니다.

## 실행 방법

자격 증명은 코드에 넣지 않습니다. AAM 포털에서 `PmcsDevAdmin` 세션을 연 뒤
`aws login --profile pmcs-dev`로 로그인하고 아래처럼 실행합니다.

```sh
export AWS_PROFILE=pmcs-dev
aws sts get-caller-identity          # assumed-role/PmcsDevAdmin, 035680193225 확인
cd infra/terraform/envs/dev/<루트>
terraform init
terraform plan -out=<루트>.tfplan    # 결과와 월 비용을 검토·승인받은 뒤에만
terraform apply <루트>.tfplan
```

## bootstrap 최초 적용 순서

상태 버킷이 아직 없으므로 bootstrap은 처음에 로컬 상태로 적용하고, 버킷이 생기면
그 안으로 자기 상태를 옮깁니다.

1. `envs/dev/bootstrap`에서 `terraform init` → `plan` → `apply` (로컬 상태)
2. 아래 `backend.tf`를 추가하고 `terraform init -migrate-state`
3. 로컬의 `terraform.tfstate*` 파일 삭제 (상태는 이제 S3에 있음)

```hcl
terraform {
  backend "s3" {
    bucket       = "pmcs-dev-tfstate-035680193225"
    key          = "bootstrap/terraform.tfstate"
    region       = "ap-northeast-2"
    encrypt      = true
    kms_key_id   = "alias/pmcs-dev-tfstate"
    use_lockfile = true
  }
}
```

다른 루트도 같은 버킷을 쓰고 `key`만 `security/terraform.tfstate`,
`app/terraform.tfstate`로 바꿉니다. 잠금은 S3 네이티브 잠금(`use_lockfile`)이라
DynamoDB 테이블이 필요 없습니다.

## 지키는 규칙

- 리소스를 만들거나 바꾸기 전에는 항상 `plan` 결과와 월 예상 비용을 검토받습니다.
- 상태 버킷은 `prevent_destroy`로 보호합니다. 지우려면 코드에서 먼저 풀어야 합니다.
- 상태·플랜 파일(`*.tfstate`, `*.tfplan`)과 `.terraform/`은 커밋하지 않습니다.
  `.terraform.lock.hcl`은 프로바이더 버전 고정용이라 커밋합니다.
- 비밀 값은 Terraform 변수나 코드에 넣지 않고, Secrets Manager에 직접 입력합니다.
